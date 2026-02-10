import asyncio
import httpx
import json
import redis.asyncio as redis
from config import USGS_API_URL, REDIS_URL, STREAM_KEY, LIVE_CHANNEL, FETCH_INTERVAL, ALERT_THRESHOLD, ALERT_CHANNEL

async def fetch_earthquakes():
    """Fetch earthquake data from USGS API."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(USGS_API_URL)
            response.raise_for_status()
            return response.json()
        except httpx.RequestError as e:
            print(f"Error fetching data: {e}")
            return None
        except httpx.HTTPStatusError as e:
            print(f"HTTP Error: {e}")
            return None

async def push_to_redis(redis_client, data):
    """Push earthquake events to Redis Stream."""
    if not data or "features" not in data:
        return

    count = 0
    for feature in data["features"]:
        # Extract relevant fields
        event_id = feature["id"]
        properties = feature["properties"]
        geometry = feature["geometry"]

        magnitude = float(properties.get("mag") or 0.0)
        place = str(properties.get("place") or "Unknown")
        timestamp = int(properties.get("time") or 0)

        event_data = {
            "id": str(event_id),
            "magnitude": str(magnitude),
            "place": place,
            "time": str(timestamp),
            "url": str(properties.get("url") or ""),
            "longitude": str(geometry["coordinates"][0]),
            "latitude": str(geometry["coordinates"][1]),
            "depth": str(geometry["coordinates"][2]),
            "raw_json": json.dumps(feature) # Store full raw data
        }

        try:
            # 1. DEDUPLICATION
            dedup_key = f"processed:{event_id}"
            is_new = await redis_client.set(dedup_key, "1", nx=True, ex=86400)
            
            if not is_new:
                continue
            
            # 2. REDIS BUFFER (Phase 2.4 - Time-lapse/Playback support)
            # Use ZSET with timestamp as score for fast range queries
            from config import EVENT_BUFFER_KEY, BUFFER_SIZE
            await redis_client.zadd(EVENT_BUFFER_KEY, {json.dumps(event_data): timestamp})
            # Keep buffer size limited
            await redis_client.zremrangebyrank(EVENT_BUFFER_KEY, 0, -(BUFFER_SIZE + 1))

            # 3. ENHANCED ALERTS (Phase 1.2 - Regional rules)
            from config import ALERT_THRESHOLD, REGIONAL_ALERT_THRESHOLD, HIGH_RISK_REGIONS, ALERT_CHANNEL
            
            is_high_risk_region = any(region in place for region in HIGH_RISK_REGIONS)
            threshold = REGIONAL_ALERT_THRESHOLD if is_high_risk_region else ALERT_THRESHOLD

            if magnitude >= threshold:
                event_data["is_alert"] = "true" 
                alert_payload = {
                    "event": event_data,
                    "message": f"{'REGIONAL ' if is_high_risk_region else ''}ALERT: Magnitude {magnitude} earthquake detected near {place}"
                }
                await redis_client.publish(ALERT_CHANNEL, json.dumps(alert_payload))
                print(f"*** TRIGGERED ALERT FOR EVENT {event_id} (Mag {magnitude}) ***")

            # XADD: Appends to stream for worker processing
            await redis_client.xadd(STREAM_KEY, event_data)
            
            # PUBLISH: Broadcast to real-time subscribers
            await redis_client.publish(LIVE_CHANNEL, event_data["raw_json"])
            
            count += 1
        except Exception as e:
            print(f"Error pushing to Redis: {e}")

    print(f"Pushed {count} events to Redis Stream '{STREAM_KEY}' and Buffer.")

async def main():
    print(f"Starting Earthquake Producer...")
    print(f"Connecting to Redis at {REDIS_URL}")
    
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    
    try:
        await redis_client.ping()
        print("Connected to Redis successfully.")
    except Exception as e:
        print(f"Failed to connect to Redis: {e}")
        return

    while True:
        print("Fetching data from USGS...")
        data = await fetch_earthquakes()
        
        if data:
            print(f"Fetched {len(data.get('features', []))} events.")
            await push_to_redis(redis_client, data)
        
        print(f"Sleeping for {FETCH_INTERVAL} seconds...")
        await asyncio.sleep(FETCH_INTERVAL)

if __name__ == "__main__":
    asyncio.run(main())
