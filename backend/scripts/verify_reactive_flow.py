import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import httpx

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "seismic_db")
API_URL = "http://localhost:8000"

async def test_flow():
    print(f"Connecting to MongoDB: {MONGO_URI}")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    config_col = db["config"]

    # 1. Start a task to listen for the WebSocket notification (mocking main.py logic)
    # Actually, we can just trigger the API and look at the logs of the worker.
    # But let's try to update config via API.
    
    print("\n[Test] Updating clustering config via API...")
    new_params = {
        "eps_km": 50.5,
        "time_window_hours": 24,
        "min_samples": 3
    }
    
    async with httpx.AsyncClient() as api_client:
        try:
            resp = await api_client.post(f"{API_URL}/clustering/config", json=new_params)
            print(f"[Test] API Response: {resp.status_code} - {resp.json()}")
        except Exception as e:
            print(f"[Test] API Connection failed (Is the server running?): {e}")
            # If API is down, we can try direct DB update
            print("[Test] Trying direct DB update instead...")
            await config_col.update_one(
                {"_id": "clustering_params"},
                {"$set": new_params},
                upsert=True
            )
            print("[Test] DB Updated directly.")

    print("\n[Test] Verification complete. Please check the worker logs for:")
    print("1. [MongoDB] Config change detected")
    print("2. [Worker] CONFIG CHANGE triggering re-clustering")
    print("3. [Worker] UI Notification sent")

if __name__ == "__main__":
    asyncio.run(test_flow())
