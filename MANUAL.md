# Earthquake Monitor - Developer Manual & In-Depth Guide

## 1. System Architecture: Front-to-Back Explanation
This system is an **Event-Driven Microservices Architecture**. Here is exactly what happens when an earthquake occurs:

### Step 1: Data Ingestion (The Producer)
*   **Source**: USGS Real-Time API (United States Geological Survey).
*   **Component**: `backend/producer.py`
*   **Action**: Every 30 seconds, this script requests data from USGS.
*   **Logic**: It compares new event IDs against a local cache to avoid duplicates.
*   **Output**: It pushes new events to **Redis Stream** (`earthquake_stream`) and publishes alerts to **Redis Pub/Sub** (`verified_alerts`).

### Step 2: Streaming & Buffering (Redis)
*   **Role**: The "Nervous System" of the app.
*   **Stream**: Acts like a queue. Events sit here until the Worker processes them.
*   **Pub/Sub**: Acts like a radio broadcast. The API Server listens to this to push live updates to the Frontend immediately (before database storage).
*   **ZSET Buffer**: Stores the last ~500 events in memory for instant "Latest Earthquakes" access without hitting the heavy database.

### Step 3: Processing & Storage (The Worker)
*   **Component**: `backend/worker.py`
*   **Action**: It "listens" to the Redis Stream. When an event arrives:
    1.  **MongoDB**: Saves the full raw JSON document (Metadata, Magnitude, Time).
    2.  **Neo4j**: Maps relationships. It checks:
        *   "Is this near a known Fault Line?" (Connects `[:ON_FAULT]`)
        *   "Is this near a City?" (Connects `[:OCCURRED_NEAR]`)
        *   "Is this an Aftershock?" (Checks time/distance against previous big quakes).

### Step 4: The API Layer (FastAPI)
*   **Component**: `backend/main.py`
*   **Role**: The Gateway for the Frontend.
*   **Endpoints**:
    *   `/earthquakes`: Queries MongoDB for lists/filtering.
    *   `/analytics/*`: complex aggregation queries (Math) on MongoDB.
    *   `/earthquakes/{id}`: Combines Mongo data + Neo4j Graph relationships into one JSON response.

---

## 2. How to Run the Application (Step-by-Step)
You are running a **Distributed System** locally. This means multiple "servers" must run at once.

### Prerequisites (Already Installed)
*   **Docker Desktop**: host Redis, MongoDB, and Neo4j.
*   **Python**: Runs your logic code.

### Startup Sequence
**1. Start the Infrastructure (Databases)**
Open Terminal 1 (Root Folder):
```powershell
docker-compose up -d mongo redis neo4j
```
*Wait 30 seconds for Neo4j to wake up.*

**2. Start the Brain (Producer -> Worker -> API)**
You need **3 separate terminals** inside the `backend/` folder:

*   **Terminal A (Producer)**: "I fetch data."
    ```powershell
    python producer.py
    ```
*   **Terminal B (Worker)**: "I save relationships."
    ```powershell
    # Windows PowerShell
    $env:NEO4J_URI="bolt://localhost:7687"; python worker.py
    ```
*   **Terminal C (API Server)**: "I answer questions."
    ```powershell
    uvicorn main:app --reload
    ```

---

## 3. How to Test Each Feature (Verification Protocol)

### Phase 1: Live Monitoring
*   **Goal**: Ensure data is flowing.
*   **Test**: `curl -s "http://localhost:8000/earthquakes?limit=1"`
*   **Success**: Returns a JSON object with a recent timestamp.

### Phase 2: Visuals & Filters
*   **Goal**: Check if we can slice/dice the data.
*   **Test (Heatmap)**: `curl -s "http://localhost:8000/earthquakes/heatmap?start_time=0&end_time=9999999999999"`
    *   *Result*: List of grid points `[{lat, lon, intensity}...]`.
*   **Test (Detail)**: Getting a single ID.
    *   *Step*: Copy an ID from the Live Feed (e.g., `tx2026abcd`).
    *   *Command*: `curl -s "http://localhost:8000/earthquakes/tx2026abcd"`
    *   *Result*: Look for `"context": {...}`. If it's there (even empty), Neo4j is connected.

### Phase 3: Analytics
*   **Goal**: Verify mathematical aggregations.
*   **Test**: `curl -s "http://localhost:8000/analytics/magnitude-distribution"`
    *   *Result*: `[{ "_id": 2.0, "count": 15 }, { "_id": 3.0, "count": 5 }]`

### Phase 4: Graph Insights
*   **Goal**: See relationships.
*   **Test**: `curl -s "http://localhost:8000/analytics/aftershocks"`
    *   *Result*: List of pairs `[{ "main_shock": ..., "aftershock": ... }]`. 
    *   *Note*: This might be empty if no major quakes happened recently, but an empty list `[]` is a **PASS**. A 404/500 error is a **FAIL**.

### Phase 5: Risk & Predictions
*   **Goal**: Check custom algorithms.
*   **Test**: `curl -s "http://localhost:8000/analytics/risk-scores"`
    *   *Result*: `[{ "region": "California", "risk_score": 45 }, ...]`

---

## 4. Troubleshooting Common Issues

**"Connection Refused" / 404 Errors**
*   **Cause**: You likely have a "Zombie Process" holding the port or Docker networking issues.
*   **Fix**:
    1.  `docker stop eq_backend eq_worker` (Stop container conflicts)
    2.  `taskkill /IM python.exe /F` (Kill zombie python processes)
    3.  Restart your 3 terminals.

**"Neo4j Address Resolution Error"**
*   **Cause**: The code is looking for `neo4j` (Docker Internal DNS) but you are running locally.
*   **Fix**: Ensure `config.py` uses `bolt://localhost:7687` (We verified this is fixed!).
