from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
import math

class Neo4jHandler:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            NEO4J_URI, 
            auth=(NEO4J_USER, NEO4J_PASSWORD)
        )
        self.seed_faults()

    def close(self):
        self.driver.close()

    def seed_faults(self):
        """
        Populate the graph with major Fault Zones (Mock Data).
        In a real app, this would ingest GeoJSON.
        """
        faults = [
            {"name": "San Andreas Fault", "lat": 35.1, "lon": -119.6},
            {"name": "Hayward Fault", "lat": 37.8, "lon": -122.3},
            {"name": "Cascadia Subduction Zone", "lat": 45.0, "lon": -125.0},
            {"name": "New Madrid Fault", "lat": 36.6, "lon": -89.5},
            {"name": "Denali Fault", "lat": 63.5, "lon": -147.5}
        ]
        
        query = """
        UNWIND $faults AS f
        MERGE (fz:FaultZone {name: f.name})
        SET fz.location = point({latitude: f.lat, longitude: f.lon})
        """
        try:
            with self.driver.session() as session:
                session.run(query, faults=faults)
                # print("Seeded Fault Zones.")
        except Exception as e:
            print(f"Error seeding faults: {e}")

    def insert_earthquake(self, data):
        """
        1. Create Earthquake & detailed Location Hierarchy (City, Region).
        2. Set City location based on first earthquake data (proxy).
        3. Link to nearby Fault Zones.
        4. Link to Affected Cities (Impact Radius).
        """
        with self.driver.session() as session:
            place = data.get("place", "Unknown")
            region_name, city_name = self._extract_location_details(place)
            
            # Impact Radius Calculation: R = 10^(0.5*M - 1.8) approx, or simplified:
            # Let's use specific rule: M2=5km, M4=20km, M6=100km, M8=500km
            mag = float(data.get("magnitude", 0) or 0)
            if mag < 2: impact_km = 5
            elif mag < 4: impact_km = 20
            elif mag < 6: impact_km = 100
            else: impact_km = 500
            
            session.run(
                """
                MERGE (r:Region {name: $region_name})
                MERGE (c:City {name: $city_name})
                MERGE (c)-[:LOCATED_IN]->(r)
                
                // Set City location if not exists (using this event as proxy)
                FOREACH (ignoreMe IN CASE WHEN c.location IS NULL THEN [1] ELSE [] END | 
                    SET c.location = point({latitude: toFloat($lat), longitude: toFloat($lon)})
                )

                MERGE (e:Earthquake {id: $id})
                SET e.mag = toFloat($mag),
                    e.time = $time,
                    e.readable_time = $readable_time,
                    e.place = $place,
                    e.exact_address = $exact_address,
                    e.location = point({latitude: toFloat($lat), longitude: toFloat($lon)})
                
                MERGE (e)-[:OCCURRED_NEAR]->(c)
                
                // Link to Fault Zone (if within 200km of our mock points)
                WITH e, c
                MATCH (fz:FaultZone)
                WHERE point.distance(e.location, fz.location) < 200000 
                MERGE (e)-[:ON_FAULT]->(fz)
                
                // Link to Affected Cities (Impact Radius)
                WITH e, $impact_km AS radius
                MATCH (affected_city:City)
                WHERE point.distance(e.location, affected_city.location) < (radius * 1000)
                MERGE (e)-[rel:AFFECTED_ZONE]->(affected_city)
                SET rel.radius_km = radius
                """,
                region_name=region_name,
                city_name=city_name,
                id=data["id"],
                mag=mag,
                time=data["time"],
                readable_time=data.get("readable_time", "N/A"),
                place=place,
                exact_address=data.get("exact_address", "Unknown"),
                lat=data["latitude"],
                lon=data["longitude"],
                impact_km=impact_km
            )
            
            self._link_aftershocks(session, data)

    def _extract_location_details(self, place):
        if "," in place:
            parts = place.split(",")
            region = parts[-1].strip()
            remainder = parts[0]
        else:
            return "Unknown Region", place.strip()

        if " of " in remainder:
            city = remainder.split(" of ")[-1].strip()
        else:
            city = remainder.strip()
            
        return region, city

    def _link_aftershocks(self, session, data):
        query = """
        MATCH (new:Earthquake {id: $id})
        MATCH (old:Earthquake)
        WHERE old.id <> new.id
        AND new.location IS NOT NULL AND old.location IS NOT NULL
        
        WITH new, old, 
             point.distance(new.location, old.location) / 1000 AS dist_km
             
        WHERE dist_km < 100
        MERGE (new)-[r:POSSIBLE_AFTERSHOCK_OF]->(old)
        SET r.distance_km = dist_km
        """
        try:
            session.run(query, id=data["id"])
        except Exception as e:
            print(f"Error linking aftershocks: {e}")

neo4j_handler = Neo4jHandler()
