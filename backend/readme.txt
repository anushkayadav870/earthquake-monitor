# Earthquake Monitor - Startup Instructions

Follow these steps in order to start the entire system.
**System Requirements**: Docker Desktop (for DBs), Python 3.10+, Node.js (for Frontend).

---

## 1. Start Databases (Docker)
Open a terminal (PowerShell or Command Prompt) and navigate to the project root.
```powershell
docker-compose up -d
```
*   This starts **Redis** (Cache/Streams), **MongoDB** (Storage), and **Neo4j** (Graph).
*   Wait about 30 seconds for Neo4j to fully start.

---

## 2. Start Backend Services
You will need **3 separate terminals** for the backend (all inside `backend/` folder).

### Terminal 1: Event Producer (Fetches Live Data)
This script fetches data from USGS every 30 seconds and pushes it to Redis.
```powershell
cd backend
python producer.py
```

### Terminal 2: Background Worker (ETL)
This consumes data from Redis and saves it to MongoDB and Neo4j.
*(Make sure to set the Neo4j URI if it differs from default, otherwise just python worker.py)*
```powershell
cd backend
$env:NEO4J_URI="bolt://localhost:7687"
python worker.py
```

### Terminal 3: API Server
This handles the HTTP requests and WebSocket connections for the frontend.
```powershell
cd backend
uvicorn main:app --reload
```
*   **API URL**: `http://localhost:8000`
*   **Documentation**: `http://localhost:8000/docs`

---

## 3. Start Frontend (Optional/Pending)
*(Currently Phase 3 - Frontend is not fully implemented yet, but you can run the boilerplate)*

### Terminal 4: Frontend Dev Server
```powershell
cd frontend
npm run dev
```
*   **App URL**: `http://localhost:5173`

---

## 4. Verification
Check if everything is connected:
1.  **Logs**: Terminal 1 (Producer) should say "Fetched X events...". Terminal 2 (Worker) should show nothing (silent) or errors if any.
2.  **API Check**: Open `http://localhost:8000/health`. Should return `{"status": "ok"}`.
3.  **Data Check**: Open `http://localhost:8000/earthquakes?limit=5` to see live data.
