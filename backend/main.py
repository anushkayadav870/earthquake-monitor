from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import asyncio
import redis.asyncio as redis
import os
import json
from config import REDIS_URL, LIVE_CHANNEL, ALERT_CHANNEL
from socket_manager import manager
from db_mongo import mongo_handler
from db_neo4j import neo4j_handler
from utils import MongoJSONEncoder

# Redis Subscriber Background Task
async def redis_connector():
    """
    Connects to Redis Pub/Sub and broadcasts messages to WebSockets.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(LIVE_CHANNEL)
    await pubsub.subscribe(ALERT_CHANNEL)
    
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
    # Startup: Initialize Mongo and start the Redis listener
    await mongo_handler.initialize()
    task = asyncio.create_task(redis_connector())
    yield
    # Shutdown (task cancellation can be added here if needed)

app = FastAPI(lifespan=lifespan)

@app.get("/")
def read_root():
    return {"message": "Hello from Earthquake Monitor Backend!"}

# Force reload for analytics routes

@app.get("/earthquakes")
async def get_quakes(
    mag_min: float = None, 
    mag_max: float = None, 
    start_time: int = None, 
    end_time: int = None, 
    depth_min: float = None,
    depth_max: float = None,
    north: float = None,
    south: float = None,
    east: float = None,
    west: float = None,
    limit: int = 50
):
    """
    Fetch filtered earthquakes.
    Example: /earthquakes?mag_min=5.0&limit=10&north=40&south=30
    """
    quakes = await mongo_handler.get_earthquakes(
        mag_min, mag_max, start_time, end_time, 
        depth_min, depth_max, 
        north, south, east, west, 
        limit
    )
    return quakes

@app.get("/earthquakes/heatmap")
async def get_heatmap(start_time: int, end_time: int):
    """
    Returns heatmap data (intensity per grid point).
    Range: start_time to end_time (required).
    """
    return await mongo_handler.get_heatmap_data(start_time, end_time)

@app.get("/earthquakes/latest")
async def get_latest_earthquakes(limit: int = 50):
    """
    Fetch the most recent earthquakes from the Redis buffer (Phase 2.4).
    Fast access for real-time dashboard/playback.
    """
    from config import EVENT_BUFFER_KEY
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    
    # Get top N elements from ZSET (sorted by score/timestamp descending)
    events_raw = await redis_client.zrevrange(EVENT_BUFFER_KEY, 0, limit - 1)
    await redis_client.aclose()
    
    events = [json.loads(e) for e in events_raw]
    return events

@app.get("/analytics/magnitude-distribution")
async def get_mag_dist():
    """
    Get earthquake counts grouped by magnitude ranges.
    Caches results for 10 minutes.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = "analytics:mag_dist"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    dist = await mongo_handler.get_magnitude_distribution()
    await redis_client.set(cache_key, json.dumps(dist, cls=MongoJSONEncoder), ex=600)
    await redis_client.aclose()
    return dist

@app.get("/analytics/magnitude-trends")
async def get_mag_trends():
    """
    Get daily earthquake counts to show trends.
    Caches results for 10 minutes.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = "analytics:mag_trends"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    trends = await mongo_handler.get_magnitude_trends()
    await redis_client.set(cache_key, json.dumps(trends, cls=MongoJSONEncoder), ex=600)
    await redis_client.aclose()
    return trends

@app.get("/analytics/depth-vs-magnitude")
async def get_depth_mag():
    """
    Get depth vs magnitude data for scatter plots.
    Caches results for 1 hour.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = "analytics:depth_mag"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    data = await mongo_handler.get_depth_vs_magnitude()
    await redis_client.set(cache_key, json.dumps(data, cls=MongoJSONEncoder), ex=3600)
    await redis_client.aclose()
    return data

@app.get("/analytics/risk-scores")
async def get_risk_scores():
    """
    Get 0-100 risk scores for major regions.
    Caches results for 24 hours.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = "analytics:risk_scores"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    scores = await mongo_handler.get_regional_risk_scores()
    await redis_client.set(cache_key, json.dumps(scores, cls=MongoJSONEncoder), ex=86400) # 24h
    await redis_client.aclose()
    return scores

@app.get("/analytics/unusual-activity")
async def get_unusual_activity():
    """
    Identify regions with significantly higher frequency than historical norms.
    Caches results for 1 hour.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = "analytics:unusual_activity"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    anomalies = await mongo_handler.get_unusual_activity_detection()
    await redis_client.set(cache_key, json.dumps(anomalies, cls=MongoJSONEncoder), ex=3600) # 1h
    await redis_client.aclose()
    return anomalies

@app.get("/analytics/aftershocks")
async def get_aftershocks(limit: int = 50):
    """
    Get identified aftershock sequences from Neo4j.
    Caches results for 10 minutes.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = f"analytics:aftershocks:{limit}"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    data = neo4j_handler.get_aftershock_sequences(limit)
    await redis_client.set(cache_key, json.dumps(data, cls=MongoJSONEncoder), ex=600)
    await redis_client.aclose()
    return data

@app.get("/analytics/cascades")
async def get_cascades(limit: int = 50):
    """
    Get identified cascade (triggered) events from Neo4j.
    Caches results for 10 minutes.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = f"analytics:cascades:{limit}"
    
    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)
    
    data = neo4j_handler.get_cascade_events(limit)
    await redis_client.set(cache_key, json.dumps(data, cls=MongoJSONEncoder), ex=600)
    await redis_client.aclose()
    return data



@app.get("/earthquakes/{event_id}")
async def get_earthquake_detail(event_id: str):
    """
    Fetch full details: Metadata (Mongo) + Relationships (Neo4j).
    """
    # 1. Fetch Core Metadata
    mongo_data = await mongo_handler.get_event(event_id)
    if not mongo_data:
        raise HTTPException(status_code=404, detail="Earthquake not found")
    
    # 2. Fetch Graph Context (Cities, Faults)
    graph_context = neo4j_handler.get_earthquake_context(event_id)
    
    return {**mongo_data, "context": graph_context}

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