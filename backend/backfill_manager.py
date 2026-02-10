import asyncio
import os
import sys
import time
from motor.motor_asyncio import AsyncIOMotorClient
from neo4j import GraphDatabase

# Add parent directory to path to import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import MONGO_URI, MONGO_DB_NAME, NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
from geocoder import geocoder
from utils import format_timestamp

class BackfillManager:
    def __init__(self):
        self.mongo_client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.mongo_client[MONGO_DB_NAME]
        self.collection = self.db["earthquakes"]
        self.neo4j_driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    async def close(self):
        self.mongo_client.close()
        self.neo4j_driver.close()

    async def backfill_readable_times(self):
        """Enrich earthquakes in Neo4j with readable_time if missing."""
        print("--- Backfilling readable_time in Neo4j ---")
        try:
            with self.neo4j_driver.session() as session:
                result = session.run("MATCH (e:Earthquake) WHERE e.readable_time IS NULL RETURN e.id, e.time")
                updates = []
                for record in result:
                    eid = record["e.id"]
                    epoch = record["e.time"]
                    if epoch:
                        readable = format_timestamp(epoch)
                        updates.append({"id": eid, "readable_time": readable})

                if updates:
                    print(f"Found {len(updates)} nodes in Neo4j to update with readable_time.")
                    session.run("""
                        UNWIND $batch AS row
                        MATCH (e:Earthquake {id: row.id})
                        SET e.readable_time = row.readable_time
                    """, batch=updates)
                    print(f"Successfully updated {len(updates)} nodes in Neo4j.")
                else:
                    print("No nodes in Neo4j missing readable_time.")
        except Exception as e:
            print(f"Error backfilling readable_time in Neo4j: {e}")

    async def backfill_exact_addresses(self):
        """Enrich earthquakes in Neo4j with exact_address if missing."""
        print("\n--- Backfilling exact_address in Neo4j ---")
        try:
            with self.neo4j_driver.session() as session:
                result = session.run("""
                    MATCH (e:Earthquake) 
                    WHERE e.exact_address IS NULL OR e.exact_address = 'Unknown'
                    RETURN e.id, e.location.latitude AS lat, e.location.longitude AS lon
                """)
                nodes = list(result)
                print(f"Found {len(nodes)} nodes in Neo4j to update with exact_address.")

                for i, record in enumerate(nodes):
                    eid = record["e.id"]
                    lat = record["lat"]
                    lon = record["lon"]
                    if lat is not None and lon is not None:
                        address = geocoder.get_exact_address(lat, lon)
                        if address:
                            session.run("""
                                MATCH (e:Earthquake {id: $id})
                                SET e.exact_address = $address
                            """, id=eid, address=address)
                            if (i + 1) % 10 == 0 or i + 1 == len(nodes):
                                print(f"[{i+1}/{len(nodes)}] Updated {eid} in Neo4j")
        except Exception as e:
            print(f"Error backfilling exact_address in Neo4j: {e}")

    async def sync_neo4j_to_mongo(self):
        """Sync enriched fields (exact_address, readable_time) from Neo4j to MongoDB."""
        print("\n--- Syncing enriched data from Neo4j to MongoDB ---")
        try:
            with self.neo4j_driver.session() as session:
                result = session.run("""
                    MATCH (e:Earthquake)
                    RETURN e.id, e.exact_address, e.readable_time
                """)
                records = list(result)
                print(f"Checking {len(records)} records for sync...")

                for i, record in enumerate(records):
                    eid = record["e.id"]
                    address = record["e.exact_address"]
                    readable = record["e.readable_time"]

                    update_fields = {}
                    if address and address != 'Unknown':
                        update_fields["exact_address"] = address
                    if readable:
                        update_fields["readable_time"] = readable

                    if update_fields:
                        await self.collection.update_one(
                            {"id": eid},
                            {"$set": update_fields}
                        )
                        if (i + 1) % 50 == 0 or i + 1 == len(records):
                            print(f"[{i+1}/{len(records)}] Synced {eid} to MongoDB")
        except Exception as e:
            print(f"Error syncing Neo4j to MongoDB: {e}")

    async def run_full_backfill(self):
        """Run all backfill and sync tasks."""
        print("Starting Full Backfill Cycle...")
        start_time = time.time()
        
        await self.backfill_readable_times()
        await self.backfill_exact_addresses()
        await self.sync_neo4j_to_mongo()
        
        duration = time.time() - start_time
        print(f"\nFull Backfill Cycle Completed in {duration:.2f} seconds.")

async def main():
    manager = BackfillManager()
    await manager.run_full_backfill()
    await manager.close()

if __name__ == "__main__":
    asyncio.run(main())
