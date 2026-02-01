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
        Uses the earthquake 'id' as the unique filter.
        """
        try:
            # Upsert: Update if exists, Insert if not
            result = await self.collection.update_one(
                {"id": data["id"]},
                {"$set": data},
                upsert=True
            )
            if result.upserted_id:
                print(f"[Mongo] Inserted new earthquake: {data['id']}")
            elif result.modified_count > 0:
                print(f"[Mongo] Updated earthquake: {data['id']}")
            # Else: No changes
        except Exception as e:
            print(f"[Mongo] Error inserting earthquake {data.get('id')}: {e}")

    def close(self):
        self.client.close()

# Global instance
mongo_handler = MongoHandler()
