from neo4j import GraphDatabase
from config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
import json
import os
import httpx


DEFAULT_RULES = {
    "impact_rules": [],
    "default_impact_radius": 10,
    "fault_zone_distance_limit_km": 200,
    "aftershock_rules": {"min_main_mag": 5.0, "max_dist_km": 50, "max_days_diff": 7},
    "cascade_rules": {"min_other_mag": 4.0, "max_dist_km": 200, "max_hours_diff": 48},
}


class Neo4jHandler:
    SEED_FAULTS = [
        {"name": "San Andreas Fault", "lat": 35.1, "lon": -119.6},
        {"name": "Hayward Fault", "lat": 37.8, "lon": -122.3},
        {"name": "Cascadia Subduction Zone", "lat": 45.0, "lon": -125.0},
        {"name": "New Madrid Fault", "lat": 36.6, "lon": -89.5},
        {"name": "Denali Fault", "lat": 63.5, "lon": -147.5},
    ]

    SEED_FAULTS_QUERY = """
    UNWIND $faults AS f
    MERGE (fz:FaultZone {name: f.name})
    SET fz.location = point({latitude: f.lat, longitude: f.lon})
    """

    INSERT_EARTHQUAKE_QUERY = """
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
    """

    LINK_RELATED_EVENTS_QUERY = """
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

    DETECT_CASCADES_QUERY = """
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

    def __init__(self):
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        self.rules = {}
        self._load_rules()
        self.seed_faults()

    def close(self):
        self.driver.close()

    def _load_rules(self):
        rules_path = os.path.join(os.path.dirname(__file__), "neo4j_rules.json")
        try:
            with open(rules_path, "r", encoding="utf-8") as f:
                self.rules = json.load(f)
        except Exception as e:
            print(f"Warning: Could not load neo4j_rules.json, using defaults. Error: {e}")
            self.rules = DEFAULT_RULES.copy()

    def compute_impact_radius(self, mag):
        # Same logic, slightly faster local lookups
        for rule in self.rules.get("impact_rules", ()):
            if rule["min"] <= mag < rule["max"]:
                return rule["radius_km"]
        return self.rules.get("default_impact_radius", 10)

    def seed_faults(self):
        try:
            with self.driver.session() as session:
                session.run(self.SEED_FAULTS_QUERY, faults=self.SEED_FAULTS)
        except Exception as e:
            print(f"Error seeding faults: {e}")

    def ingest_faults_from_geojson(self, geojson_url):
        try:
            with httpx.Client() as client:
                res = client.get(geojson_url)
                res.raise_for_status()
                data = res.json()

            faults = []
            for feat in data.get("features", []):
                props = feat.get("properties", {}) or {}
                name = props.get("name") or props.get("Name") or "Unknown Fault"
                geom = feat.get("geometry", {}) or {}

                coords = []
                gtype = geom.get("type")
                if gtype == "LineString":
                    coords = geom.get("coordinates", []) or []
                elif gtype == "MultiLineString":
                    coords = [pt for line in (geom.get("coordinates", []) or []) for pt in line]
                else:
                    continue

                if not coords:
                    continue

                # centroid
                lon = sum(c[0] for c in coords) / len(coords)
                lat = sum(c[1] for c in coords) / len(coords)

                faults.append({"name": name, "lat": lat, "lon": lon})

            if not faults:
                print("No faults found in GeoJSON.")
                return

            with self.driver.session() as session:
                session.run(self.SEED_FAULTS_QUERY, faults=faults)
                print(f"Successfully ingested {len(faults)} faults from GeoJSON.")

        except Exception as e:
            print(f"Error ingesting faults from GeoJSON: {e}")

    def insert_earthquake(self, data):
        with self.driver.session() as session:
            place = data.get("place", "Unknown")
            region_name, city_name = self._extract_location_details(place)

            mag = float(data.get("magnitude", 0) or 0)
            impact_km = self.compute_impact_radius(mag)
            fault_limit_m = self.rules.get("fault_zone_distance_limit_km", 200) * 1000

            session.run(
                self.INSERT_EARTHQUAKE_QUERY,
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
                fault_limit=fault_limit_m,
            )

            cluster_id = data.get("cluster_id")
            if cluster_id:
                self.link_earthquake_to_cluster(data["id"], cluster_id)

            self._link_related_events(session, data)
            self._detect_cascades(data)  # keeps same behavior as your code (opens its own session)

    def sync_clusters(self, clusters):
        query = """
        UNWIND $clusters AS c
        MERGE (cl:Cluster {id: c.cluster_id})
        SET cl.centroid = point({latitude: c.centroid.coordinates[1], longitude: c.centroid.coordinates[0]}),
            cl.event_count = toInteger(c.event_count),
            cl.avg_magnitude = toFloat(c.avg_magnitude),
            cl.start_time = toInteger(c.start_time),
            cl.end_time = toInteger(c.end_time)

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
        try:
            with self.driver.session() as session:
                session.run("MATCH (c:Cluster) DETACH DELETE c")
        except Exception as e:
            print(f"Error clearing clusters in Neo4j: {e}")

    def link_earthquake_to_cluster(self, eq_id, cluster_id):
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
        if "," not in place:
            return "Unknown Region", place.strip()

        parts = place.split(",")
        region = parts[-1].strip()
        remainder = parts[0]

        if " of " in remainder:
            city = remainder.split(" of ")[-1].strip()
        else:
            city = remainder.strip()

        return region, city

    def _link_related_events(self, session, data):
        rules = self.rules.get("aftershock_rules", {})
        try:
            session.run(
                self.LINK_RELATED_EVENTS_QUERY,
                id=data["id"],
                min_mag=rules.get("min_main_mag", 5.0),
                max_dist=rules.get("max_dist_km", 50),
                max_days=rules.get("max_days_diff", 7),
            )
        except Exception as e:
            print(f"Error linking related events: {e}")

    def _detect_cascades(self, data):
        rules = self.rules.get("cascade_rules", {})
        try:
            with self.driver.session() as session:
                session.run(
                    self.DETECT_CASCADES_QUERY,
                    id=data["id"],
                    min_mag=rules.get("min_other_mag", 4.0),
                    max_dist=rules.get("max_dist_km", 200),
                    max_hours=rules.get("max_hours_diff", 48),
                )
        except Exception as e:
            print(f"Error detecting cascades: {e}")

    def get_earthquake_context(self, event_id):
        query = """
        MATCH (e:Earthquake {id: $id})
        OPTIONAL MATCH (e)-[:OCCURRED_IN]->(r:Region)
        OPTIONAL MATCH (e)-[:OCCURRED_NEAR]->(c:City)
        OPTIONAL MATCH (e)-[:ON_FAULTLINE]->(f:FaultZone)
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
                    sequences.append(
                        {
                            "main_shock": dict(record["main"]),
                            "aftershock": dict(record["after"]),
                            "details": dict(record["r"]),
                        }
                    )
                return sequences
        except Exception as e:
            print(f"Error fetching aftershock sequences: {e}")
            return []

    def get_cascade_events(self, limit=50):
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
                    cascades.append(
                        {
                            "triggering_event": dict(record["trigger"]),
                            "triggered_event": dict(record["triggered"]),
                            "details": dict(record["r"]),
                        }
                    )
                return cascades
        except Exception as e:
            print(f"Error fetching cascade events: {e}")
            return []

    def get_graph_data(
        self,
        min_mag=0,
        max_mag=10,
        start_time=None,
        end_time=None,
        cluster_id=None,
        relationship_types=None,
    ):
        base_query = """
        MATCH (e:Earthquake)
        WHERE e.mag >= $min_mag AND e.mag <= $max_mag
        """

        if start_time:
            base_query += " AND e.time >= $start_time"
        if end_time:
            base_query += " AND e.time <= $end_time"
        if cluster_id:
            base_query += " AND e.cluster_id = $cluster_id"

        semantic_set = {
            "AFTERSHOCK_OF",
            "FORESHOCK_OF",
            "TRIGGERED",
            "BELONGS_TO_CLUSTER",
            "ON_FAULTLINE",
            "EPICENTER_OF",
        }
        generic_set = {"NEAR", "OCCURRED_IN"}

        if relationship_types:
            target_semantic = [t for t in relationship_types if t in semantic_set]
            target_generic = [t for t in relationship_types if t in generic_set]
        else:
            target_semantic = list(semantic_set)
            target_generic = list(generic_set)

        query_semantic = None
        if target_semantic:
            sem_types_str = "|".join(target_semantic)
            query_semantic = base_query + f"""
            MATCH (e)-[r:{sem_types_str}]->(target)
            RETURN e, r, target
            LIMIT 2000
            """

        query_generic = None
        if target_generic:
            gen_types_str = "|".join(target_generic)
            query_generic = base_query + f"""
            MATCH (e)-[r:{gen_types_str}]->(target)
            RETURN e, r, target
            LIMIT 1000
            """

        nodes = {}
        edges = []

        try:
            with self.driver.session() as session:
                if query_semantic:
                    for record in session.run(
                        query_semantic,
                        min_mag=min_mag,
                        max_mag=max_mag,
                        start_time=start_time,
                        end_time=end_time,
                        cluster_id=cluster_id,
                    ):
                        self._process_graph_record(record, nodes, edges)

                if query_generic:
                    for record in session.run(
                        query_generic,
                        min_mag=min_mag,
                        max_mag=max_mag,
                        start_time=start_time,
                        end_time=end_time,
                        cluster_id=cluster_id,
                    ):
                        self._process_graph_record(record, nodes, edges)

            return {"nodes": list(nodes.values()), "edges": edges}
        except Exception as e:
            print(f"Error fetching graph data: {e}")
            return {"nodes": [], "edges": []}

    def _process_graph_record(self, record, nodes, edges):
        e = record["e"]
        eid = e["id"]

        if eid not in nodes:
            loc = e.get("location")
            nodes[eid] = {
                "id": eid,
                "label": "Earthquake",
                "mag": e["mag"],
                "time": e["time"],
                "lat": loc.latitude if loc else None,
                "lon": loc.longitude if loc else None,
                "cluster_id": e.get("cluster_id"),
            }

        target = record["target"]
        if not target:
            return

        target_id = target.get("id") or target.get("name")
        label = list(target.labels)[0] if hasattr(target, "labels") else "Unknown"

        if target_id not in nodes:
            nodes[target_id] = {"id": target_id, "label": label, "name": target.get("name")}
            if label == "Cluster":
                nodes[target_id].update(
                    {
                        "event_count": target.get("event_count"),
                        "avg_mag": target.get("avg_magnitude"),
                    }
                )

        rel = record["r"]
        edges.append(
            {
                "source": eid,
                "target": target_id,
                "type": rel.type,
                "dist_km": rel.get("distance_km"),
            }
        )

    def get_top_central_quakes(self, limit=10):
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
                    if center_node is None:
                        n = record["n"]
                        center_node = dict(n)
                        center_node["labels"] = list(n.labels)

                    m = record["m"]
                    r = record["r"]

                    neighbor_node = dict(m)
                    neighbor_node["labels"] = list(m.labels)

                    if "location" in neighbor_node:
                        loc = neighbor_node["location"]
                        neighbor_node["lat"] = loc.latitude
                        neighbor_node["lon"] = loc.longitude
                        del neighbor_node["location"]

                    neighbors.append(
                        {
                            "node": neighbor_node,
                            "relationship": {
                                "type": r.type,
                                "properties": dict(r),
                                "direction": "out"
                                if r.start_node.element_id == record["n"].element_id
                                else "in",
                            },
                        }
                    )

                return {"center": center_node, "neighbors": neighbors}

        except Exception as e:
            print(f"Error fetching node neighbors: {e}")
            return {"center": None, "neighbors": []}


neo4j_handler = Neo4jHandler()
