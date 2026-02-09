from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from typing import Optional
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
from clustering import ClusteringEngine

# Global Clustering Engine
clustering_engine = ClusteringEngine()

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

# CORS: allow local dev frontends to access the API
from fastapi.middleware.cors import CORSMiddleware

# Default allowed origins - can be overridden with CORS_ORIGINS env (comma-separated)
_origin_str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:5174")
_allowed_origins = [o.strip() for o in _origin_str.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Hello from Earthquake Monitor Backend!"}

@app.get("/clusters")
async def get_clusters():
    """
    Get all active clusters.
    """
    return await mongo_handler.get_clusters()

@app.get("/clusters/{cluster_id}")
async def get_cluster_detail(cluster_id: str):
    """
    Get details for a specific cluster.
    """
    # Direct query to clusters collection for now
    col = mongo_handler.db["clusters"]
    doc = await col.find_one({"cluster_id": cluster_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Cluster not found")
    doc["_id"] = str(doc["_id"])
    return doc

@app.get("/clustering/config")
async def get_clustering_config():
    """
    Get current clustering parameters.
    """
    return await clustering_engine.get_config()

@app.post("/clustering/config")
async def set_clustering_config(params: dict):
    """
    Update clustering parameters. The worker will detect this via MongoDB Change Stream.
    """
    allowed = ["eps_km", "time_window_hours", "min_samples"]
    new_config = {k: v for k, v in params.items() if k in allowed}
    
    # 1. Save to DB (This triggers the watcher in worker.py)
    await mongo_handler.set_clustering_config(new_config)
    print(f"[API] Updated clustering config to: {new_config}")
    
    return {"status": "updated", "config": new_config, "message": "Clustering config saved. Watcher will trigger re-clustering."}

# Force reload for analytics routes - Attempt 2

@app.get("/earthquakes")
async def get_quakes(
    mag_min: Optional[float] = Query(None), 
    mag_max: Optional[float] = Query(None), 
    start_time: Optional[int] = Query(None), 
    end_time: Optional[int] = Query(None), 
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    north: Optional[float] = Query(None),
    south: Optional[float] = Query(None),
    east: Optional[float] = Query(None),
    west: Optional[float] = Query(None),
    cluster_id: Optional[str] = Query(None),
    limit: int = Query(50)
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
    
    # Filter by cluster_id if provided (could be moved to mongo_handler for efficiency)
    if cluster_id:
        quakes = [q for q in quakes if q.get("cluster_id") == cluster_id]
        
    return quakes

@app.get("/earthquakes/heatmap")
async def get_heatmap(
    start_time: Optional[int] = Query(None),
    end_time: Optional[int] = Query(None),
    mag_min: Optional[float] = Query(None),
    mag_max: Optional[float] = Query(None),
    depth_min: Optional[float] = Query(None),
    depth_max: Optional[float] = Query(None),
    weight_by: str = Query("magnitude")  # "magnitude", "count", "energy", "depth"
):
    """
    Returns heatmap data (intensity per grid point).
    Supports filtering by time, magnitude, depth.
    weight_by: how to calculate heat intensity
      - "magnitude": sum of magnitudes (default)
      - "count": number of events
      - "energy": sum of 10^mag (seismic energy proxy)
      - "depth": inverse depth weighted (shallower = hotter)
    """
    return await mongo_handler.get_heatmap_data(
        start_time=start_time,
        end_time=end_time,
        mag_min=mag_min,
        mag_max=mag_max,
        depth_min=depth_min,
        depth_max=depth_max,
        weight_by=weight_by
    )

@app.get("/neo4j/graph")
async def get_graph_data(
    min_mag: float = 0, 
    max_mag: float = 10, 
    start_time: int = 0
):
    """
    Fetch graph data for the map layer with filters.
    """
    return neo4j_handler.get_graph_data(
        min_mag=min_mag, 
        max_mag=max_mag, 
        start_time=start_time
    )

@app.get("/neo4j/top-central")
async def get_top_central_quakes(limit: int = Query(10)):
    """
    Get earthquakes with highest connectivity in the graph.
    """
    return neo4j_handler.get_top_central_quakes(limit=limit)

@app.get("/neo4j/neighbors/{node_id}")
async def get_node_neighbors(node_id: str):
    """
    Get immediate neighbors for a specific node to show in details view.
    """
    return neo4j_handler.get_node_neighbors(node_id)

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
    
    raw = await mongo_handler.get_magnitude_distribution()
    dist = []
    for item in raw:
        bucket_id = item.get("_id")
        if bucket_id == "Other":
            label = "Other"
        elif isinstance(bucket_id, (int, float)):
            label = f"{int(bucket_id)}-{int(bucket_id) + 1}"
        else:
            label = str(bucket_id)
        dist.append({"bucket": label, "count": item.get("count", 0)})
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
    
    raw = await mongo_handler.get_magnitude_trends()
    trends = [{"label": item.get("_id"), "count": item.get("count", 0)} for item in raw]
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
    
    raw = await mongo_handler.get_depth_vs_magnitude()
    data = [{"magnitude": d.get("magnitude"), "depth": d.get("depth")} for d in raw]
    await redis_client.set(cache_key, json.dumps(data, cls=MongoJSONEncoder), ex=3600)
    await redis_client.aclose()
    return data

@app.get("/analytics/trends")
async def get_trends_alias():
    """
    Alias for /analytics/magnitude-trends with frontend-friendly shape.
    """
    return await get_mag_trends()

@app.get("/analytics/depth-magnitude")
async def get_depth_magnitude_alias():
    """
    Alias for /analytics/depth-vs-magnitude with frontend-friendly shape.
    """
    return await get_depth_mag()

@app.get("/analytics/top-regions")
async def get_top_regions(limit: int = 10):
    """
    Get top regions by earthquake count.
    Caches results for 10 minutes.
    """
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    cache_key = f"analytics:top_regions:{limit}"

    cached_data = await redis_client.get(cache_key)
    if cached_data:
        await redis_client.aclose()
        return json.loads(cached_data)

    raw = await mongo_handler.get_top_regions(limit=limit)
    data = [{"region": item.get("_id"), "count": item.get("count", 0)} for item in raw]
    await redis_client.set(cache_key, json.dumps(data, cls=MongoJSONEncoder), ex=600)
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