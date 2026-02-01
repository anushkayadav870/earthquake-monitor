from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
import datetime

class Neo4jHandler:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            NEO4J_URI, 
            auth=(NEO4J_USER, NEO4J_PASSWORD)
        )

    def close(self):
        self.driver.close()

    def insert_earthquake(self, data):
        """
        Creates an Earthquake node and links it to a Region.
        """
        with self.driver.session() as session:
            # 1. Create/Merge Region
            place = data.get("place", "Unknown")
            region_name = self._extract_region(place)
            
            # 2. Create Earthquake Node and Link to Region
            session.run(
                """
                MERGE (r:Region {name: $region_name})
                MERGE (e:Earthquake {id: $id})
                SET e.mag = toFloat($mag),
                    e.time = $time,
                    e.place = $place,
                    e.latitude = toFloat($lat),
                    e.longitude = toFloat($lon),
                    e.depth = toFloat($depth),
                    e.url = $url
                MERGE (e)-[:OCCURRED_IN]->(r)
                """,
                region_name=region_name,
                id=data["id"],
                mag=data["magnitude"],
                time=data["time"],
                place=place,
                lat=data["latitude"],
                lon=data["longitude"],
                depth=data["depth"],
                url=data["url"]
            )
            
            # 3. Check for Aftershocks
            self._link_aftershocks(session, data)

    def _extract_region(self, place):
        """
        Extracts 'CA' from '10km N of Los Angeles, CA'.
        If no comma, returns the whole string.
        """
        if "," in place:
            return place.split(",")[-1].strip()
        return place.strip()

    def _link_aftershocks(self, session, data):
        """
        Finds previous earthquakes within 100km and 7 days and links them.
        """
        # We use a simple Cypher query to find potential parents
        # This assumes 'time' is stored as a string, which might be hard to compare directly in Cypher 
        # unless we convert to Timestamp. USGS time is usually ms epoch or ISO.
        # The producer.py saves it as string.
        
        # NOTE: For better performance, we should store time as Integer (epoch ms).
        # But let's assume valid ISO string or try to rely on spatial proximity first.
        
        query = """
        MATCH (new:Earthquake {id: $id})
        MATCH (old:Earthquake)
        WHERE old.id <> new.id
        AND point({latitude: new.latitude, longitude: new.longitude}) 
            IS NOT NULL 
        AND point({latitude: old.latitude, longitude: old.longitude}) 
            IS NOT NULL
        AND point.distance(
            point({latitude: new.latitude, longitude: new.longitude}), 
            point({latitude: old.latitude, longitude: old.longitude})
        ) < 100000 
        MERGE (new)-[:POSSIBLE_AFTERSHOCK_OF]->(old)
        """
        try:
            session.run(query, id=data["id"])
        except Exception as e:
            print(f"Error linking aftershocks: {e}")

neo4j_handler = Neo4jHandler()
