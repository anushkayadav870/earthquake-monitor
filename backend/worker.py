import asyncio
import redis.asyncio as redis
import json
from config import REDIS_URL, STREAM_KEY
from db_mongo import mongo_handler
from db_neo4j import neo4j_handler
from geocoder import geocoder
from utils import format_timestamp
from producer import main as run_producer_loop
from clustering import ClusteringEngine

CONSUMER_GROUP = "analytics_group"
CONSUMER_NAME = "worker_1"

MAX_RETRIES = 5
DEAD_LETTER_STREAM = "earthquake_dlq"

async def process_message(redis_client, message_id, data):
    """Encapsulates the enrichment and storage logic for a single message."""
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
        await mongo_handler.insert_earthquake(data)
        
        # Ingest into Neo4j
        try:
            neo4j_handler.insert_earthquake(data)
            print(f"[Neo4j] Inserted/Updated earthquake: {data['id']}")
        except Exception as e:
            print(f"[Neo4j] Error inserting into Neo4j: {e}")
            # We don't necessarily want to fail the whole process if only Neo4j fails,
            # but for a "fault-tolerant" system, maybe we should? 
            # Let's let it retry if critical databases fail.
        
        # Acknowledge SUCCESS
        await redis_client.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
        return True
    except Exception as e:
        print(f"Error processing message {message_id}: {e}")
        return False

async def run_consumer_loop():
    print("Starting Fault-Tolerant Consumer...")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)

    # Create Consumer Group if not exists
    try:
        await redis_client.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        print(f"Created consumer group '{CONSUMER_GROUP}'")
    except redis.ResponseError as e:
        if "BUSYGROUP" not in str(e):
            print(f"Error creating consumer group: {e}")
            return

    while True:
        try:
            # 1. First, check for PENDING messages (Waiting Room)
            # Messages that were read but never ACKed (e.g. worker crashed)
            pending_streams = await redis_client.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_KEY: "0"}, # "0" means pending
                count=5
            )

            if pending_streams:
                print(f"Found {len(pending_streams[0][1])} pending messages. Recovering...")
                for stream_key, messages in pending_streams:
                    for message_id, data in messages:
                        # Check delivery count to avoid infinite loop on "poison" messages
                        # XPENDING gives us details like idle time and delivery count
                        pending_info = await redis_client.xpending_range(STREAM_KEY, CONSUMER_GROUP, message_id, message_id, 1)
                        if pending_info:
                            delivery_count = pending_info[0].get('times_delivered', 0)
                            if delivery_count > MAX_RETRIES:
                                print(f"!!! Message {message_id} failed {delivery_count} times. Moving to DLQ.")
                                await redis_client.xadd(DEAD_LETTER_STREAM, data)
                                await redis_client.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
                                continue

                        await process_message(redis_client, message_id, data)

            # 2. Then, read NEW messages
            new_streams = await redis_client.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_KEY: ">"}, # ">" means new
                count=1,
                block=2000
            )

            if new_streams:
                for stream_key, messages in new_streams:
                    for message_id, data in messages:
                        await process_message(redis_client, message_id, data)

        except Exception as e:
            print(f"Consumer loop error: {e}")
            await asyncio.sleep(5)

async def run_clustering_listener():
    print("Starting Clustering Listener...")
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("control_channel")
    
    clustering_engine = ClusteringEngine()
    
    # Run once on startup to ensure clusters are fresh
    await clustering_engine.run_clustering()
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                if data == "recluster":
                    # Fetch latest config to log what we are using
                    config = await clustering_engine.get_config()
                    print(f"[Worker] RECEIVED recluster command. Using Config: {config}")
                    count = await clustering_engine.run_clustering()
                    print(f"[Worker] Re-clustering complete. Found {count} clusters.")
    except Exception as e:
        print(f"Clustering listener error: {e}")
    finally:
        await redis_client.aclose()

async def main():
    # Initialize Databases
    await mongo_handler.initialize()
    
    # Run both Producer and Consumer concurrently
    await asyncio.gather(
        run_producer_loop(),
        run_consumer_loop(),
        run_clustering_listener()
    )

if __name__ == "__main__":
    asyncio.run(main())
