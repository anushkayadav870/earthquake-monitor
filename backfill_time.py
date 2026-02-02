from neo4j import GraphDatabase
from backend.utils import format_timestamp

# Local connection
URI = "bolt://localhost:7687"
AUTH = ("neo4j", "test1234")

def backfill():
    print("Starting Backfill for 'readable_time'...")
    driver = GraphDatabase.driver(URI, auth=AUTH)
    
    count = 0
    try:
        with driver.session() as session:
            # 1. Fetch all nodes without readable_time
            result = session.run("MATCH (e:Earthquake) WHERE e.readable_time IS NULL RETURN e.id, e.time")
            
            updates = []
            for record in result:
                eid = record["e.id"]
                epoch = record["e.time"]
                
                if epoch:
                    readable = format_timestamp(epoch)
                    updates.append({"id": eid, "readable_time": readable})
            
            # 2. Bulk Update
            if updates:
                print(f"Found {len(updates)} nodes to update.")
                session.run("""
                    UNWIND $batch AS row
                    MATCH (e:Earthquake {id: row.id})
                    SET e.readable_time = row.readable_time
                """, batch=updates)
                count = len(updates)
            else:
                print("No nodes needed updating.")
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        driver.close()
        
    print(f"Backfill Complete. Updated {count} nodes.")

if __name__ == "__main__":
    backfill()
