import numpy as np
from sklearn.cluster import DBSCAN
from datetime import datetime
import pandas as pd
from db_mongo import mongo_handler
from config import CLUSTERING_DISTANCE_KM, CLUSTERING_TIME_WINDOW_HOURS, CLUSTERING_MIN_SAMPLES
import asyncio

class ClusteringEngine:
    def __init__(self):
        self.db = mongo_handler
        # Default fallback if DB config is missing
        self.default_eps_km = CLUSTERING_DISTANCE_KM
        self.default_time_hours = CLUSTERING_TIME_WINDOW_HOURS
        self.default_min_samples = CLUSTERING_MIN_SAMPLES

    async def get_config(self):
        """Fetch dynamic config from DB or use defaults."""
        config = await self.db.get_clustering_config()
        return {
            "eps_km": float(config.get("eps_km", self.default_eps_km)),
            "time_window_hours": float(config.get("time_window_hours", self.default_time_hours)),
            "min_samples": int(config.get("min_samples", self.default_min_samples))
        }

    def _prepare_data(self, earthquakes):
        """
        Convert list of earthquake dicts to a DataFrame and scale features.
        We use a simplified projection for distance:
        - Lat/Lon converted to km approx (valid for local/regional, improved for global with Haversine later)
        - Time converted to normalized units
        
        For Global ST-DBSCAN with scikit-learn, we can use a custom metric, 
        but it's slow. 
        Optimization: 
        1. Convert (Lat, Lon) -> (X, Y, Z) on Earth sphere? No, DBSCAN needs specific distance.
        2. Proj: Lat * 111km, Lon * 111km * cos(Lat).
        """
        if not earthquakes:
            return None, None

        df = pd.DataFrame(earthquakes)
        
        # Ensure we have required fields
        if "time" not in df.columns or "latitude" not in df.columns or "longitude" not in df.columns:
            return None, None

        # Ensure numeric types in the main DataFrame
        df["latitude"] = pd.to_numeric(df["latitude"], errors='coerce')
        df["longitude"] = pd.to_numeric(df["longitude"], errors='coerce')
        df["time"] = pd.to_numeric(df["time"], errors='coerce')
        df["magnitude"] = pd.to_numeric(df["magnitude"], errors='coerce')
        df["depth"] = pd.to_numeric(df["depth"], errors='coerce')

        # Drop rows with NaN values in critical columns
        df = df.dropna(subset=["latitude", "longitude", "time"])
        if df.empty:
            return None, None

        # Feature Engineering for Clustering
        coords = df[["latitude", "longitude", "time", "magnitude", "depth"]].copy()
        
        # 1. Convert Time to Hours relative to min time
        
        # 1. Convert Time to Hours relative to min time
        min_time = coords["time"].min()
        coords["hours_rel"] = (coords["time"] - min_time) / (1000 * 3600) # ms -> hours
        
        # 2. Approx KM conversion (Simplified Equirectangular)
        # We process lat/lon to "Approx KM" from (0,0)
        # This is a heuristic. For crossing 180th meridian, this breaks. 
        # But for an MVP clustering engine it works for most continuous regions.
        # Ideally we'd use Haversine metric in DBSCAN.
        coords["lat_km"] = coords["latitude"] * 111.32
        coords["lon_km"] = coords["longitude"] * 111.32 * np.cos(np.deg2rad(coords["latitude"]))
        
        print(f"[DEBUG] DF dtypes:\n{df.dtypes}")
        print(f"[DEBUG] DF head:\n{df.head()}")
        
        return df, coords

    async def run_clustering(self, recent_only=False):
        """
        Main method to run the clustering process.
        """
        config = await self.get_config()
        eps_km = config["eps_km"]
        time_window = config["time_window_hours"]
        min_samples = config["min_samples"]

        # 1. Fetch data
        # For full re-clustering, we might fetch last 30 days
        # For incremental, we'd need a more complex merging strategy.
        # Let's start with "Re-cluster Active Window" (e.g. last 7 days)
        # 7 days = 168 hours. ST-DBSCAN with 48h window needs meaningful history.
        
        lookback_days = 7
        start_time = int((datetime.now().timestamp() - (lookback_days * 24 * 3600)) * 1000)
        
        quakes = await self.db.get_earthquakes(start_time=start_time, limit=5000)
        if not quakes:
            print("[Clustering] No earthquakes to cluster.")
            return

        df, coords = self._prepare_data(quakes)
        if df is None:
            return

        # 3. Scale Features for DBSCAN
        # We want: 
        # - dist(p1, p2) <= eps implies spatial_dist <= eps_km AND time_diff <= time_window
        # This is essentially Chebyshev distance if we scale correctly.
        # Scale spatial to 1.0 = eps_km
        # Scale temporal to 1.0 = time_window
        
        X = np.column_stack((
            coords["lat_km"] / eps_km,
            coords["lon_km"] / eps_km,
            coords["hours_rel"] / time_window
        ))
        
        # 4. Run DBSCAN
        # metric='chebyshev' means max(|x1-x2|, |y1-y2|, ...). 
        # With scaled vars, distance <= 1.0 ensures all dimensions are within limits.
        db = DBSCAN(eps=1.0, min_samples=min_samples, metric='chebyshev')
        labels = db.fit_predict(X)
        
        # 5. Process Results
        df["cluster_id"] = labels
        
        # -1 is Noise in DBSCAN. We set cluster_id = None for noise
        # Or keep it as -1? Let's use string IDs for valid clusters, None for noise.
        
        updates = []
        clusters_metadata = {}
        
        for idx, row in df.iterrows():
            cluster_label = row["cluster_id"]
            eq_id = row["id"]
            
            if cluster_label != -1:
                # Generate a stable-ish cluster ID? 
                # DBSCAN labels are arbitrary (0, 1, 2). 
                # If we re-run, 0 might become 1.
                # A heuristic: Cluster ID = "cluster_{date}_{min_event_id}" 
                # For now, let's just use "gen_{run_timestamp}_{label}" to ensure unique sessions,
                # but this breaks persistence.
                # Better: Use the ID of the 'core' event or earliest event in cluster.
                pass
        
        # Group by label to find stable IDs
        grouped = df[df["cluster_id"] != -1].groupby("cluster_id")
        
        valid_cluster_map = {} # label -> stable_id
        
        print(f"[Clustering] Found {len(grouped)} potential clusters using eps={eps_km}km, min_samples={min_samples}")
        
        for label, group in grouped:
            # Stable ID = 'cl_{earliest_time}_{lat}_{lon}'
            earliest = group.loc[group["time"].idxmin()]
            # Create a deterministic hash/ID based on the main event
            stable_id = f"cl_{earliest['id']}"
            valid_cluster_map[label] = stable_id
            
            # Compute Metadata
            center_lat = group["latitude"].mean()
            center_lon = group["longitude"].mean()
            avg_mag = group["magnitude"].mean()
            count = len(group)
            
            # Extract representative region (from largest earthquake)
            largest_eq = group.loc[group["magnitude"].idxmax()]
            region = largest_eq.get("place", "Unknown Region")
            # Try to clean up region name (e.g. "10km SSW of X" -> "X")
            if " of " in region:
                region = region.split(" of ")[1]

            clusters_metadata[stable_id] = {
                "cluster_id": stable_id,
                "created_at": int(datetime.now().timestamp() * 1000),
                "centroid": {
                    "type": "Point",
                    "coordinates": [center_lon, center_lat]
                },
                "event_count": int(count),
                "avg_magnitude": float(avg_mag),
                "region": region,
                "start_time": int(group["time"].min()),
                "end_time": int(group["time"].max())
            }
            # print(f"[Clustering] Cluster {stable_id}: {count} events, Region: {region}")

        # Prepare bulk updates
        updates = []
        for idx, row in df.iterrows():
            label = row["cluster_id"]
            if label != -1:
                stable_id = valid_cluster_map[label]
                updates.append((row["id"], stable_id))
            else:
                 # Mark noise as null cluster_id
                updates.append((row["id"], None))
        
        # 6. Write to DB
        # Always clear old clusters first to prevent stale data accumulation
        await self.db.clear_clusters()
        
        # Also clear Neo4j clusters
        from db_neo4j import neo4j_handler
        neo4j_handler.clear_clusters()

        if updates:
            await self.db.update_earthquakes_with_cluster_id(updates)
            
        if clusters_metadata:
            await self.db.update_clusters(list(clusters_metadata.values()))
            # Update Neo4j with new clusters
            neo4j_handler.sync_clusters(list(clusters_metadata.values()))
            # Update spatial relationships in graph
            neo4j_handler.create_near_relationships()
            
        print(f"[Clustering] Completed. Found {len(clusters_metadata)} clusters.")
        return len(clusters_metadata)
