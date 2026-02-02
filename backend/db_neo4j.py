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
                    e.time = toInteger($time),
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
            self._detect_cascades(session, data)

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
        """
        Connects this earthquake to a 'Main Shock' in the graph if it meets criteria:
        - Within 50km
        - Within 7 days
        - Main Shock magnitude >= 5.0
        """
        query = """
        MATCH (new:Earthquake {id: $id})
        MATCH (main:Earthquake)
        WHERE main.id <> new.id
        AND main.mag >= 5.0
        AND new.location IS NOT NULL AND main.location IS NOT NULL
        
        // Convert to integers for subtraction in case already stored as strings
        WITH new, main, 
             point.distance(new.location, main.location) / 1000 AS dist_km,
             (toInteger(new.time) - toInteger(main.time)) / (1000 * 60 * 60 * 24.0) AS days_diff
             
        WHERE dist_km < 50 
        AND days_diff > 0 AND days_diff <= 7
        
        MERGE (new)-[r:PART_OF_SEQUENCE]->(main)
        SET r.type = "Aftershock",
            r.distance_km = dist_km,
            r.time_diff_days = days_diff
        """
        try:
            session.run(query, id=data["id"])
        except Exception as e:
            print(f"Error linking aftershocks: {e}")

    def _detect_cascades(self, session, data):
        """
        Detects potential triggered events across different fault zones.
        Criteria: different faults, < 200km distance, < 48 hours time gap.
        """
        query = """
        MATCH (new:Earthquake {id: $id})-[:ON_FAULT]->(fz1:FaultZone)
        MATCH (other:Earthquake)-[:ON_FAULT]->(fz2:FaultZone)
        WHERE fz1 <> fz2 
        AND other.id <> new.id
        AND other.mag >= 4.0
        
        WITH new, other, fz1, fz2,
             point.distance(new.location, other.location) / 1000 AS dist_km,
             abs(toInteger(new.time) - toInteger(other.time)) / (1000 * 60 * 60.0) AS hours_diff
             
        WHERE dist_km < 200 AND hours_diff < 48
        MERGE (other)-[r:POSSIBLE_TRIGGERED_EVENT]->(new)
        SET r.distance_km = dist_km,
            r.hours_diff = hours_diff,
            r.from_fault = fz2.name,
            r.to_fault = fz1.name
        try:
            with self.driver.session() as session:
                session.run(query, id=data["id"])
        except Exception as e:
            print(f"Error detecting cascades: {e}")

    def get_earthquake_context(self, event_id):
        """
        Fetches related graph data: nearby cities, faults, affected zones.
        """
        query = """
        MATCH (e:Earthquake {id: $id})
        OPTIONAL MATCH (e)-[:OCCURRED_IN]->(r:Region)
        OPTIONAL MATCH (e)-[:OCCURRED_NEAR]->(c:City)
        OPTIONAL MATCH (e)-[:ON_FAULT]->(f:FaultZone)
        OPTIONAL MATCH (e)-[:AFFECTED_ZONE]->(ac:City)
        
        RETURN {
            region: r.name,
            near_city: c.name,
            fault_zone: f.name,
            affected_cities: collect(ac.name)
        } as context
        """
        try:
            with self.driver.session() as session:
                result = session.run(query, id=event_id)
                record = result.single()
                return record["context"] if record else {}
        except Exception as e:
            print(f"Error fetching Neo4j context: {e}")
            return {}

neo4j_handler = Neo4jHandler()
