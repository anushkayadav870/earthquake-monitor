import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, MONGO_DB_NAME

async def count_earthquakes():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB_NAME]
    collection = db["earthquakes"]
    count = await collection.count_documents({})
    print(f"Total earthquakes in MongoDB: {count}")
    
    # Print a sample
    if count > 0:
        sample = await collection.find_one()
        print("Sample document:", sample)
    else:
        print("No documents found. Make sure the worker is running.")

    client.close()

if __name__ == "__main__":
    asyncio.run(count_earthquakes())
