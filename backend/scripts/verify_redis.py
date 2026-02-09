import asyncio
import redis.asyncio as redis
from config import REDIS_URL, STREAM_KEY

async def verify_stream():
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    try:
        # Read last 5 entries from stream
        # xrevrange(name, max='+', min='-', count=None)
        entries = await redis_client.xrevrange(STREAM_KEY, count=5)
        print(f"Found {len(entries)} entries in stream '{STREAM_KEY}':")
        for stream_id, data in entries:
            print(f"ID: {stream_id}")
            print(f"Data: {data}")
            print("-" * 20)
    except Exception as e:
        print(f"Error verifies verification: {e}")
    finally:
        await redis_client.aclose()

if __name__ == "__main__":
    asyncio.run(verify_stream())
