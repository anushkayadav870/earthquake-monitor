import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from neo4j import GraphDatabase
import sys
import os

# Add backend to path to import config
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from config import MONGO_URI, MONGO_DB_NAME, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

async def sync_addresses():
    print(f"Syncing addresses from Neo4j to MongoDB...")
    
    # Neo4j Client
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    
    # MongoDB Client
    mongo_client = AsyncIOMotorClient(MONGO_URI)
    db = mongo_client[MONGO_DB_NAME]
    collection = db["earthquakes"]
    
    try:
        with driver.session() as session:
            # 1. Fetch all earthquakes with exact_address from Neo4j
            result = session.run("""
                MATCH (e:Earthquake)
                WHERE e.exact_address IS NOT NULL AND e.exact_address <> 'Unknown'
                RETURN e.id, e.exact_address
            """)
            
            records = list(result)
            print(f"Found {len(records)} addresses to sync.")
            
            for i, record in enumerate(records):
                eid = record["e.id"]
                address = record["e.exact_address"]
                
                # 2. Update MongoDB
                res = await collection.update_one(
                    {"id": eid},
                    {"$set": {"exact_address": address}}
                )
                if res.modified_count > 0:
                    print(f"[{i+1}/{len(records)}] Updated Mongo for {eid}: {address[:30]}...")
                
    except Exception as e:
        print(f"Error during sync: {e}")
    finally:
        driver.close()
        mongo_client.close()
        
    print("Sync Complete.")

if __name__ == "__main__":
    asyncio.run(sync_addresses())
