# Earthquake Monitor System

A real-time earthquake monitoring system using microservices architecture.

## Tech Stack
- **Frontend**: Vite + Vue/React (Port 5173)
- **Backend**: Python FastAPI (Port 8000)
- **Database 1**: MongoDB (Port 27017) - Primary storage
- **Database 2**: Neo4j (Port 7474/7687) - Graph relationships (Faults/Regions)
- **Message Broker**: Redis (Port 6379) - Stream processing

## Prerequisites
1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be installed and running)
2. Git

## How to Run on a New Machine

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd earthquake-monitor
```

### 2. Configure Environment
Ensure the `.env` file exists in the root directory. If not, create one with the following content:

```env
# MongoDB Config
MONGO_URI=mongodb://mongo:27017/earthquake_db
MONGO_DB_NAME=earthquake_db

# Redis Config
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_URL=redis://redis:6379

# Neo4j Config
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=test1234  # Must be at least 8 chars

# App Config
DEBUG=True
```

### 3. Start the System
Run the following command to build and start all containers:

```bash
docker-compose up --build
```
*Note: The `--build` flag is important the first time to ensure all Python dependencies (like `neo4j` driver) are installed.*

### 4. Access the Services
- **Web App**: [http://localhost:5173](http://localhost:5173)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j Browser**: [http://localhost:7474](http://localhost:7474)
    - User: `neo4j`
    - Pass: `test1234`
- **MongoDB**: Connect via `mongodb://localhost:27017`

## Troubleshooting
- **Neo4j Access**: If you see "WebSocket connection failure", ensure the password is at least 8 characters.
- **Connection Refused**: Ensure Docker Desktop is running (`docker ps`).
- **Volume Errors**: If Neo4j fails to start due to "UnsupportedLogVersion", run:
  ```bash
  docker-compose down -v
  docker-compose up --build
  ```
