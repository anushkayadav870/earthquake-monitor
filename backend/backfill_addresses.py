from neo4j import GraphDatabase
import sys
import os

# Add backend to path to import geocoder and config
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from geocoder import geocoder
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD

# Connection details from config
URI = NEO4J_URI
AUTH = (NEO4J_USER, NEO4J_PASSWORD)

def backfill_addresses():
    print(f"Starting Backfill for 'exact_address' at {URI}...")
    driver = GraphDatabase.driver(URI, auth=AUTH)
    
    try:
        with driver.session() as session:
            # 1. Fetch nodes without exact_address
            result = session.run("""
                MATCH (e:Earthquake) 
                WHERE e.exact_address IS NULL OR e.exact_address = 'Unknown'
                RETURN e.id, e.location.latitude AS lat, e.location.longitude AS lon
            """)
            
            nodes = list(result)
            print(f"Found {len(nodes)} nodes to update.")
            
            for i, record in enumerate(nodes):
                eid = record["e.id"]
                lat = record["lat"]
                lon = record["lon"]
                
                if lat is not None and lon is not None:
                    print(f"[{i+1}/{len(nodes)}] Processing {eid} ({lat}, {lon})...")
                    address = geocoder.get_exact_address(lat, lon)
                    
                    if address:
                        session.run("""
                            MATCH (e:Earthquake {id: $id})
                            SET e.exact_address = $address
                        """, id=eid, address=address)
                    else:
                        print(f"  Could not resolve address for {eid}")
                
    except Exception as e:
        print(f"Error during backfill: {e}")
    finally:
        driver.close()
        
    print("Backfill Complete.")

if __name__ == "__main__":
    backfill_addresses()
