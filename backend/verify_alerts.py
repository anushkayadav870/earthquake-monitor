import asyncio
import redis.asyncio as redis
import json
from config import REDIS_URL, ALERT_CHANNEL, ALERT_THRESHOLD

async def listen_for_alerts():
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(ALERT_CHANNEL)
    
    print(f"Listening for alerts on channel '{ALERT_CHANNEL}'...")
    print(f"Waiting for earthquakes > Mag {ALERT_THRESHOLD}...")
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = json.loads(message["data"])
                print(f"\n[ALERT RECEIVED]: {data['message']}")
                print(f"Event Details: {data['event']['place']} (Mag {data['event']['magnitude']})")
    except KeyboardInterrupt:
        pass
    finally:
        await redis_client.aclose()

if __name__ == "__main__":
    asyncio.run(listen_for_alerts())
