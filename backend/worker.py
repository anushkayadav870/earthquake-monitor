import asyncio
import redis.asyncio as redis
import json
from config import REDIS_URL, STREAM_KEY
from db_mongo import mongo_handler
from db_neo4j import neo4j_handler
from geocoder import geocoder
from utils import format_timestamp
from producer import main as run_producer_loop

CONSUMER_GROUP = "analytics_group"
CONSUMER_NAME = "worker_1"

async def run_consumer_loop():
    print("Starting MongoDB Consumer...")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)

    # Create Consumer Group if not exists
    try:
        await redis_client.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        print(f"Created consumer group '{CONSUMER_GROUP}'")
    except redis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            print(f"Consumer group '{CONSUMER_GROUP}' already exists.")
        else:
            print(f"Error creating consumer group: {e}")
            return

    while True:
        try:
            # Read new messages
            # count=1 to process one by one (or batch it)
            # block=5000 waits 5 seconds for new messages if empty
            streams = await redis_client.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_KEY: ">"},
                count=1,
                block=5000
            )

            if not streams:
                continue

            for stream_key, messages in streams:
                for message_id, data in messages:
                    print(f"Processing event: {message_id}")
                    try:
                        # Enrich with Exact Location
                        lat = float(data.get("latitude", 0))
                        lon = float(data.get("longitude", 0))
                        exact_address = geocoder.get_exact_address(lat, lon)
                        if exact_address:
                            data["exact_address"] = exact_address

                        # Enrich with Readable Time
                        ts = data.get("time")
                        if ts:
                            data["readable_time"] = format_timestamp(ts)

                        # Pass data directly to Mongo handler
                        # ensure 'id' field is present (it is, from producer)
                        await mongo_handler.insert_earthquake(data)
                        
                        # Ingest into Neo4j
                        try:
                            neo4j_handler.insert_earthquake(data)
                            print(f"[Neo4j] Inserted/Updated earthquake: {data['id']}")
                        except Exception as e:
                            print(f"[Neo4j] Error inserting: {e}")
                        
                        # Acknowledge
                        await redis_client.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
                    except Exception as e:
                        print(f"Error processing message {message_id}: {e}")

        except Exception as e:
            print(f"Consumer loop error: {e}")
            await asyncio.sleep(5) # Prevent tight loop on error

async def main():
    # Run both Producer and Consumer concurrently
    await asyncio.gather(
        run_producer_loop(),
        run_consumer_loop()
    )

if __name__ == "__main__":
    asyncio.run(main())
