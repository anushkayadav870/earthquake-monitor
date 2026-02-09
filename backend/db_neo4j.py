from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
import math
import json
import os
import httpx

class Neo4jHandler:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            NEO4J_URI, 
            auth=(NEO4J_USER, NEO4J_PASSWORD)
        )
        self._load_rules()
        self.seed_faults()

    def _load_rules(self):
        """Load Neo4j rules from config file."""
        rules_path = os.path.join(os.path.dirname(__file__), "neo4j_rules.json")
        try:
            with open(rules_path, "r") as f:
                self.rules = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load neo4j_rules.json, using defaults. Error: {e}")
            self.rules = {
                "impact_rules": [],
                "default_impact_radius": 10,
                "fault_zone_distance_limit_km": 200,
                "aftershock_rules": {"min_main_mag": 5.0, "max_dist_km": 50, "max_days_diff": 7},
                "cascade_rules": {"min_other_mag": 4.0, "max_dist_km": 200, "max_hours_diff": 48}
            }

    def compute_impact_radius(self, mag):
        """
        Dynamically compute impact radius based on magnitude rules.
        """
        for rule in self.rules.get("impact_rules", []):
            if rule["min"] <= mag < rule["max"]:
                return rule["radius_km"]
        return self.rules.get("default_impact_radius", 10)

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

    def ingest_faults_from_geojson(self, geojson_url):
        """
        Fetches fault data from a GeoJSON URL and ingests it into Neo4j.
        Calculates a simple centroid for the fault lines to store as Point location.
        """
        try:
            with httpx.Client() as client:
                res = client.get(geojson_url)
                res.raise_for_status()
                data = res.json()

            faults = []
            for f in data.get("features", []):
                name = f["properties"].get("name") or f["properties"].get("Name") or "Unknown Fault"
                geom = f.get("geometry", {})
                
                if geom.get("type") == "LineString":
                    coords = geom["coordinates"]
                elif geom.get("type") == "MultiLineString":
                    # Flatten coordinates for MultiLineString
                    coords = [pt for line in geom["coordinates"] for pt in line]
                else:
                    continue

                if not coords: continue

                # Use centroid of fault line
                lons = [c[0] for c in coords]
                lats = [c[1] for c in coords]
                lon = sum(lons)/len(lons)
                lat = sum(lats)/len(lats)

                faults.append({
                    "name": name,
                    "lat": lat,
                    "lon": lon
                })

            if not faults:
                print("No faults found in GeoJSON.")
                return

            query = """
            UNWIND $faults AS f
            MERGE (fz:FaultZone {name: f.name})
            SET fz.location = point({latitude: f.lat, longitude: f.lon})
            """

            with self.driver.session() as session:
                session.run(query, faults=faults)
                print(f"Successfully ingested {len(faults)} faults from GeoJSON.")
                
        except Exception as e:
            print(f"Error ingesting faults from GeoJSON: {e}")

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
            
            # Impact Radius Calculation: Rule-based
            mag = float(data.get("magnitude", 0) or 0)
            impact_km = self.compute_impact_radius(mag)
            fault_limit_m = self.rules.get("fault_zone_distance_limit_km", 200) * 1000
            
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
                MERGE (e)-[:OCCURRED_IN]->(r)
                
                // Link to Fault Zone (Rule-based distance)
                WITH e, c, $fault_limit AS fault_limit
                MATCH (fz:FaultZone)
                WHERE point.distance(e.location, fz.location) < fault_limit 
                MERGE (e)-[:ON_FAULTLINE]->(fz)
                
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
                impact_km=impact_km,
                fault_limit=fault_limit_m
            )

            # Link to Cluster if present
            cluster_id = data.get("cluster_id")
            if cluster_id:
                self.link_earthquake_to_cluster(data["id"], cluster_id)
            
            self._link_related_events(session, data)
            self._detect_cascades(session, data)

    def sync_clusters(self, clusters):
        """
        Batch ingest cluster data from MongoDB.
        Also updates the EPICENTER_OF relationship to the max mag event.
        """
        query = """
        UNWIND $clusters AS c
        MERGE (cl:Cluster {id: c.cluster_id})
        SET cl.centroid = point({latitude: c.centroid.coordinates[1], longitude: c.centroid.coordinates[0]}),
            cl.event_count = toInteger(c.event_count),
            cl.avg_magnitude = toFloat(c.avg_magnitude),
            cl.start_time = toInteger(c.start_time),
            cl.end_time = toInteger(c.end_time)
            
        // Find the event with max magnitude in this cluster and mark as Epicenter
        WITH cl
        MATCH (e:Earthquake)-[:BELONGS_TO_CLUSTER]->(cl)
        WITH cl, e, e.mag as mag
        ORDER BY mag DESC
        LIMIT 1
        MERGE (cl)-[:EPICENTER_OF]->(e)
        """
        try:
            with self.driver.session() as session:
                session.run(query, clusters=clusters)
        except Exception as e:
            print(f"Error syncing clusters to Neo4j: {e}")

    def clear_clusters(self):
        """
        Deletes all Cluster nodes and their relationships.
        """
        query = "MATCH (c:Cluster) DETACH DELETE c"
        try:
            with self.driver.session() as session:
                session.run(query)
                # print("Cleared all clusters from Neo4j.")
        except Exception as e:
            print(f"Error clearing clusters in Neo4j: {e}")

    def link_earthquake_to_cluster(self, eq_id, cluster_id):
        """
        Creates a BELONGS_TO_CLUSTER relationship.
        """
        query = """
        MATCH (e:Earthquake {id: $eq_id})
        MATCH (c:Cluster {id: $cluster_id})
        MERGE (e)-[:BELONGS_TO_CLUSTER]->(c)
        """
        try:
            with self.driver.session() as session:
                session.run(query, eq_id=eq_id, cluster_id=cluster_id)
        except Exception as e:
            print(f"Error linking earthquake to cluster in Neo4j: {e}")

    def create_near_relationships(self, max_dist_km=50, max_time_diff_hr=48):
        """
        Creates NEAR relationships between earthquakes based on proximity in space and time.
        """
        query = """
        MATCH (e1:Earthquake), (e2:Earthquake)
        WHERE e1.id < e2.id
        AND e1.location IS NOT NULL AND e2.location IS NOT NULL
        
        WITH e1, e2,
             point.distance(e1.location, e2.location) / 1000 AS dist_km,
             abs(toInteger(e1.time) - toInteger(e2.time)) / (1000 * 3600.0) AS hours_diff
             
        WHERE dist_km < $max_dist_km AND hours_diff < $max_time_diff_hr
        MERGE (e1)-[r:NEAR]->(e2)
        SET r.distance_km = dist_km,
            r.time_diff_hr = hours_diff
        """
        try:
            with self.driver.session() as session:
                session.run(query, max_dist_km=max_dist_km, max_time_diff_hr=max_time_diff_hr)
        except Exception as e:
            print(f"Error creating NEAR relationships in Neo4j: {e}")

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

    def _link_related_events(self, session, data):
        """
        Connects this earthquake to a 'Main Shock' (AFTERSHOCK_OF) or 'Future Shock' (FORESHOCK_OF).
        """
        rules = self.rules.get("aftershock_rules", {})
        query = """
        MATCH (new:Earthquake {id: $id})
        MATCH (other:Earthquake)
        WHERE other.id <> new.id
        AND other.mag >= $min_mag
        AND new.location IS NOT NULL AND other.location IS NOT NULL
        
        WITH new, other, 
             point.distance(new.location, other.location) / 1000 AS dist_km,
             (toInteger(new.time) - toInteger(other.time)) / (1000 * 60 * 60 * 24.0) AS days_diff
             
        WHERE dist_km <= $max_dist 
        AND abs(days_diff) <= $max_days 
        
        // Determine relationship type dynamically
        FOREACH (_ IN CASE WHEN days_diff > 0 THEN [1] ELSE [] END |
            MERGE (new)-[r:AFTERSHOCK_OF]->(other)
            SET r.distance_km = dist_km, r.time_diff_days = days_diff
        )
        FOREACH (_ IN CASE WHEN days_diff < 0 THEN [1] ELSE [] END |
            MERGE (new)-[r:FORESHOCK_OF]->(other)
            SET r.distance_km = dist_km, r.time_diff_days = days_diff
        )
        """
        try:
            session.run(query, 
                        id=data["id"], 
                        min_mag=rules.get("min_main_mag", 5.0),
                        max_dist=rules.get("max_dist_km", 50),
                        max_days=rules.get("max_days_diff", 7))
        except Exception as e:
            print(f"Error linking related events: {e}")

    def _detect_cascades(self, session, data):
        """
        Detects potential TRIGGERED events across different fault zones.
        """
        rules = self.rules.get("cascade_rules", {})
        query = """
        MATCH (new:Earthquake {id: $id})-[:ON_FAULTLINE]->(fz1:FaultZone)
        MATCH (other:Earthquake)-[:ON_FAULTLINE]->(fz2:FaultZone)
        WHERE fz1 <> fz2 
        AND other.id <> new.id
        AND other.mag >= $min_mag
        
        WITH new, other, fz1, fz2,
             point.distance(new.location, other.location) / 1000 AS dist_km,
             abs(toInteger(new.time) - toInteger(other.time)) / (1000 * 60 * 60.0) AS hours_diff
             
        WHERE dist_km <= $max_dist AND hours_diff <= $max_hours
        MERGE (other)-[r:TRIGGERED]->(new)
        SET r.distance_km = dist_km,
            r.hours_diff = hours_diff,
            r.from_fault = fz2.name,
            r.to_fault = fz1.name
        """
        try:
            with self.driver.session() as session:
                session.run(query, 
                            id=data["id"],
                            min_mag=rules.get("min_other_mag", 4.0),
                            max_dist=rules.get("max_dist_km", 200),
                            max_hours=rules.get("max_hours_diff", 48))
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

    def get_aftershock_sequences(self, limit=50):
        """
        Retrieves earthquakes linked by AFTERSHOCK_OF relationships.
        """
        query = """
        MATCH (after:Earthquake)-[r:AFTERSHOCK_OF]->(main:Earthquake)
        RETURN after, r, main
        ORDER BY after.time DESC
        LIMIT $limit
        """
        try:
            with self.driver.session() as session:
                result = session.run(query, limit=limit)
                sequences = []
                for record in result:
                    after = dict(record["after"])
                    main = dict(record["main"])
                    rel = dict(record["r"])
                    sequences.append({
                        "main_shock": main,
                        "aftershock": after,
                        "details": rel
                    })
                return sequences
        except Exception as e:
            print(f"Error fetching aftershock sequences: {e}")
            return []

    def get_cascade_events(self, limit=50):
        """
        Retrieves earthquakes linked by TRIGGERED relationships.
        """
        query = """
        MATCH (trigger:Earthquake)-[r:TRIGGERED]->(triggered:Earthquake)
        RETURN trigger, r, triggered
        ORDER BY triggered.time DESC
        LIMIT $limit
        """
        try:
            with self.driver.session() as session:
                result = session.run(query, limit=limit)
                cascades = []
                for record in result:
                    trigger = dict(record["trigger"])
                    triggered = dict(record["triggered"])
                    rel = dict(record["r"])
                    cascades.append({
                        "triggering_event": trigger,
                        "triggered_event": triggered,
                        "details": rel
                    })
                return cascades
        except Exception as e:
            print(f"Error fetching cascade events: {e}")
            return []


    def get_graph_data(self, min_mag=0, max_mag=10, start_time=None, end_time=None, cluster_id=None, relationship_types=None):
        """
        Fetches nodes and edges for graph visualization based on filters.
        relationship_types: List of strings e.g. ["AFTERSHOCK_OF", "NEAR"]
        """
        # Base query to fetch quakes and their relations
        query = """
        MATCH (e:Earthquake)
        WHERE e.mag >= $min_mag AND e.mag <= $max_mag
        """
        
        if start_time:
            query += " AND e.time >= $start_time"
        if end_time:
            query += " AND e.time <= $end_time"
        if cluster_id:
            query += " AND e.cluster_id = $cluster_id"
            
        # Define Semantic vs Generic types
        semantic_set = {"AFTERSHOCK_OF", "FORESHOCK_OF", "TRIGGERED", "BELONGS_TO_CLUSTER", "ON_FAULTLINE", "EPICENTER_OF"}
        generic_set = {"NEAR", "OCCURRED_IN"}
        
        # If no types specified, fetch ALL (default behavior)
        if not relationship_types:
            target_semantic = list(semantic_set)
            target_generic = list(generic_set)
        else:
            target_semantic = [t for t in relationship_types if t in semantic_set]
            target_generic = [t for t in relationship_types if t in generic_set]

        # Query 1: Fetch Semantic Relationships (High Priority)
        if target_semantic:
            sem_types_str = "|" + "|".join(target_semantic) # e.g. "|AFTERSHOCK_OF|TRIGGERED"
            # Remove leading pipe for valid syntax if needed, but here we need :TYPE|TYPE
            sem_types_str = sem_types_str[1:] 
            
            query_semantic = query + f"""
            MATCH (e)-[r:{sem_types_str}]->(target)
            RETURN e, r, target
            LIMIT 2000
            """
        else:
            query_semantic = None

        # Query 2: Fetch Spatial Relationships (Lower Priority, sampled)
        if target_generic:
            gen_types_str = "|".join(target_generic)
            query_generic = query + f"""
            MATCH (e)-[r:{gen_types_str}]->(target)
            RETURN e, r, target
            LIMIT 1000
            """
        else:
            query_generic = None
        
        nodes = {}
        edges = []

        try:
            with self.driver.session() as session:
                # Run Semantic Query
                if query_semantic:
                    result_sem = session.run(query_semantic, min_mag=min_mag, max_mag=max_mag, 
                                         start_time=start_time, end_time=end_time, cluster_id=cluster_id)
                    
                    for record in result_sem:
                        self._process_graph_record(record, nodes, edges)

                # Run Generic Query
                if query_generic:
                    result_gen = session.run(query_generic, min_mag=min_mag, max_mag=max_mag, 
                                         start_time=start_time, end_time=end_time, cluster_id=cluster_id)
                    
                    for record in result_gen:
                        self._process_graph_record(record, nodes, edges)

                return {"nodes": list(nodes.values()), "edges": edges}
        except Exception as e:
            print(f"Error fetching graph data: {e}")
            return {"nodes": [], "edges": []}

    def _process_graph_record(self, record, nodes, edges):
        e = record["e"]
        if e["id"] not in nodes:
            nodes[e["id"]] = {
                "id": e["id"],
                "label": "Earthquake",
                "mag": e["mag"],
                "time": e["time"],
                "lat": e["location"].latitude if e.get("location") else None,
                "lon": e["location"].longitude if e.get("location") else None,
                "cluster_id": e.get("cluster_id")
            }
        
        target = record["target"]
        if target:
            target_id = target.get("id") or target.get("name") # City/Fault/Cluster
            label = list(target.labels)[0] if hasattr(target, 'labels') else "Unknown"
            
            if target_id not in nodes:
                nodes[target_id] = {
                    "id": target_id,
                    "label": label,
                    "name": target.get("name")
                }
                if label == "Cluster":
                    nodes[target_id].update({
                        "event_count": target.get("event_count"),
                        "avg_mag": target.get("avg_magnitude")
                    })
            
            rel = record["r"]
            # Avoid duplicates if edges are fetched twice (unlikely with distinct types but good practice)
            edge_key = f"{e['id']}-{target_id}-{rel.type}"
            # Check if edge exists? For performance, we'll assign unique generic IDs in frontend or here.
            # Just append.
            edges.append({
                "source": e["id"],
                "target": target_id,
                "type": rel.type,
                "dist_km": rel.get("distance_km")
            })

    def get_top_central_quakes(self, limit=10):
        """
        Finds quakes with most connections (using DEGREE centrality as proxy).
        Requires GDS if we wanted PageRank, but simple Cypher works for Degree.
        """
        query = """
        MATCH (e:Earthquake)-[r]-()
        RETURN e, count(r) AS degree
        ORDER BY degree DESC
        LIMIT $limit
        """
        try:
            with self.driver.session() as session:
                result = session.run(query, limit=limit)
                return [{"id": r["e"]["id"], "mag": r["e"]["mag"], "degree": r["degree"]} for r in result]
        except Exception as e:
            print(f"Error fetching top central quakes: {e}")
            return []

    def get_node_neighbors(self, node_id):
        """
        Fetches immediate neighbors of a specific node (1-hop).
        """
        query = """
        MATCH (n {id: $node_id})-[r]-(m)
        RETURN n, r, m
        LIMIT 50
        """
        try:
            with self.driver.session() as session:
                result = session.run(query, node_id=node_id)
                neighbors = []
                center_node = None
                
                for record in result:
                    if not center_node:
                        n = record["n"]
                        center_node = dict(n)
                        center_node["labels"] = list(n.labels)
                    
                    m = record["m"]
                    r = record["r"]
                    
                    neighbor_node = dict(m)
                    neighbor_node["labels"] = list(m.labels)
                    # Helper: clean up Neo4j types for JSON (e.g. spatial Point)
                    if "location" in neighbor_node:
                        loc = neighbor_node["location"]
                        neighbor_node["lat"] = loc.latitude
                        neighbor_node["lon"] = loc.longitude
                        del neighbor_node["location"]
                        
                    neighbors.append({
                        "node": neighbor_node,
                        "relationship": {
                            "type": r.type,
                            "properties": dict(r),
                            "direction": "out" if r.start_node.element_id == record["n"].element_id else "in"
                        }
                    })
                    
        except Exception as e:
            print(f"Error fetching node neighbors: {e}")
            return {"center": None, "neighbors": []}

neo4j_handler = Neo4jHandler()
