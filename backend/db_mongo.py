from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, MONGO_DB_NAME
import asyncio

class MongoHandler:
    def __init__(self):
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[MONGO_DB_NAME]
        self.collection = self.db["earthquakes"]

    async def insert_earthquake(self, data):
        """
        Upsert earthquake data into MongoDB.
        Ensures numeric fields are stored as floats/ints for filtering.
        """
        try:
            # Prepare data for MongoDB (convert strings to numbers)
            mongo_data = data.copy()
            if "magnitude" in mongo_data:
                mongo_data["magnitude"] = float(mongo_data["magnitude"])
            if "time" in mongo_data:
                mongo_data["time"] = int(mongo_data["time"])
            if "latitude" in mongo_data:
                mongo_data["latitude"] = float(mongo_data["latitude"])
            if "longitude" in mongo_data:
                mongo_data["longitude"] = float(mongo_data["longitude"])

            result = await self.collection.update_one(
                {"id": mongo_data["id"]},
                {"$set": mongo_data},
                upsert=True
            )
            # if result.upserted_id:
            #    print(f"[Mongo] Inserted: {data['id']}")
            
        except Exception as e:
            print(f"[Mongo] Error inserting earthquake {data.get('id')}: {e}")

    async def get_earthquakes(self, mag_min=None, mag_max=None, start_time=None, end_time=None, limit=100):
        """Fetch earthquakes with optional filters."""
        query = {}
        
        # Magnitude Filter
        if mag_min is not None or mag_max is not None:
            query["magnitude"] = {}
            if mag_min is not None:
                query["magnitude"]["$gte"] = float(mag_min)
            if mag_max is not None:
                query["magnitude"]["$lte"] = float(mag_max)
        
        # Time Filter (Time is stored as int ms)
        if start_time is not None or end_time is not None:
            query["time"] = {}
            if start_time is not None:
                query["time"]["$gte"] = int(start_time)
            if end_time is not None:
                query["time"]["$lte"] = int(end_time)

        cursor = self.collection.find(query).sort("time", -1).limit(limit)
        results = await cursor.to_list(length=limit)
        
        # Clean up _id for JSON serialization
        for r in results:
            r["_id"] = str(r["_id"])
        
        return results

    def close(self):
        self.client.close()

# Global instance
mongo_handler = MongoHandler()
