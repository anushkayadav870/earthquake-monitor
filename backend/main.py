from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
import redis.asyncio as redis
import os
from config import REDIS_URL, LIVE_CHANNEL
from socket_manager import manager
from db_mongo import mongo_handler

# Redis Subscriber Background Task
async def redis_connector():
    """
    Connects to Redis Pub/Sub and broadcasts messages to WebSockets.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(LIVE_CHANNEL)
    
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                # Broadcast the raw data to all connected clients
                await manager.broadcast(message["data"])
    except Exception as e:
        print(f"Redis PubSub Error: {e}")
    finally:
        await redis_client.aclose()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the Redis listener
    task = asyncio.create_task(redis_connector())
    yield
    # Shutdown (task cancellation can be added here if needed)

app = FastAPI(lifespan=lifespan)

@app.get("/")
def read_root():
    return {"message": "Hello from Earthquake Monitor Backend!"}

@app.get("/earthquakes")
async def get_quakes(
    mag_min: float = None, 
    mag_max: float = None, 
    start_time: int = None, 
    end_time: int = None, 
    limit: int = 50
):
    """
    Fetch filtered earthquakes.
    Example: /earthquakes?mag_min=5.0&limit=10
    """
    quakes = await mongo_handler.get_earthquakes(mag_min, mag_max, start_time, end_time, limit)
    return quakes

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection open, text is just a heartbeat or ignored
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mongo_uri": os.getenv("MONGO_URI"),
        "redis_host": os.getenv("REDIS_HOST"),
        "neo4j_uri": os.getenv("NEO4J_URI")
    }