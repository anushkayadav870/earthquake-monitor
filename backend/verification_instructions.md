# Backend Verification via CURL / Postman

### 1. Advanced Filters
**Deep Earthquakes (>30km)**
```bash
curl -X GET "http://localhost:8000/earthquakes?depth_min=30"
```

**California Region (Bounding Box)**
```bash
curl -X GET "http://localhost:8000/earthquakes?north=42&south=32&east=-114&west=-125"
```

### 2. Heatmap Data
**Get Intensity Grid (Full History)**
```bash
curl -X GET "http://localhost:8000/earthquakes/heatmap?start_time=0&end_time=9999999999999"
```

### 3. Detail & Context
**Get Detail with Neo4j Context**
*(Replace `us1000...` with a valid ID from the first request)*
```bash
curl -X GET "http://localhost:8000/earthquakes/us1000h4p4"
```

**Note**: If using Postman, simply select **GET** and paste the URL part (e.g. `http://localhost:8000/earthquakes?depth_min=30`).
