import asyncio
from clustering import ClusteringEngine
from db_mongo import mongo_handler

async def main():
    print("Initializing Mongo...")
    await mongo_handler.initialize()
    
    print("Starting Clustering Engine...")
    engine = ClusteringEngine()
    
    # Run clustering (this will now clear old clusters first)
    count = await engine.run_clustering()
    print(f"Clustering complete. Active clusters: {count}")

if __name__ == "__main__":
    asyncio.run(main())
