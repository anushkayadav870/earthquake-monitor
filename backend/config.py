import os

# USGS Earthquake API
USGS_API_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
STREAM_KEY = "earthquake_stream"
LIVE_CHANNEL = "live_earthquakes"
EVENT_BUFFER_KEY = "recent_events"
BUFFER_SIZE = 500

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "earthquake_db")

# Neo4j Configuration
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "test1234")

# Worker Settings
FETCH_INTERVAL = 30  # seconds

# Alert Configuration
ALERT_THRESHOLD = 5.0  # Global high-priority alert
REGIONAL_ALERT_THRESHOLD = 3.5  # Lower threshold for high-risk zones
ALERT_CHANNEL = "verified_alerts"
HIGH_RISK_REGIONS = ["California", "CA", "Alaska", "AK", "Japan", "Mexico", "Turkey", "Indonesia", "Chile"]
