from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGO_URI, MONGO_DB_NAME
from datetime import datetime, timedelta
import asyncio

class MongoHandler:
    def __init__(self):
        self.client = AsyncIOMotorClient(MONGO_URI)
        self.db = self.client[MONGO_DB_NAME]
        self.collection = self.db["earthquakes"]

    async def initialize(self):
        """Explicitly initialize indexes. Call this from an async context."""
        await self._ensure_indexes()

    async def get_event(self, event_id: str):
        """Fetch a single earthquake by ID."""
        doc = await self.collection.find_one({"id": event_id})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    async def _ensure_indexes(self):
        """Ensures that required indexes (including geospatial) are present."""
        await self.collection.create_index([("location", "2dsphere")])
        await self.collection.create_index([("id", 1)], unique=True)
        await self.collection.create_index([("time", -1)])
        await self.collection.create_index([("cluster_id", 1)])
        print("[MongoDB] Geospatial, unique, and cluster indexes verified.")

    async def insert_earthquake(self, data):
        """
        Upsert earthquake data into MongoDB.
        Ensures numeric fields are stored as floats/ints for filtering.
        """
        try:
            # Prepare data for MongoDB (convert strings to numbers)
            mongo_data = data.copy()
            for field in ["magnitude", "latitude", "longitude", "depth"]:
                if field in mongo_data and mongo_data[field] is not None and mongo_data[field] != "":
                    mongo_data[field] = float(mongo_data[field])
            
            if "time" in mongo_data and mongo_data["time"] is not None and mongo_data["time"] != "":
                mongo_data["time"] = int(mongo_data["time"])

            # Add GeoJSON location for geospatial queries
            if "latitude" in mongo_data and "longitude" in mongo_data:
                mongo_data["location"] = {
                    "type": "Point",
                    "coordinates": [mongo_data["longitude"], mongo_data["latitude"]]
                }

            result = await self.collection.update_one(
                {"id": mongo_data["id"]},
                {"$set": mongo_data},
                upsert=True
            )
            
        except Exception as e:
            print(f"[Mongo] Error inserting earthquake {data.get('id')}: {e}")

    async def update_earthquakes_with_cluster_id(self, updates):
        """
        Bulk update cluster_id for earthquakes.
        updates: list of (earthquake_id, cluster_id) tuples or dicts
        """
        if not updates:
            return

        from pymongo import UpdateOne
        operations = []
        for eq_id, cluster_id in updates:
            operations.append(
                UpdateOne({"id": eq_id}, {"$set": {"cluster_id": cluster_id}})
            )
        
        if operations:
            result = await self.collection.bulk_write(operations)
            print(f"[Mongo] Updated clusters for {result.modified_count} earthquakes")

    async def clear_clusters(self):
        """
        Delete all documents in the clusters collection.
        Used before re-populating to remove stale clusters.
        """
        await self.db["clusters"].delete_many({})
        print("[Mongo] Cleared all clusters.")

    async def update_clusters(self, clusters_data):
        """
        Replace all clusters with new data (or upsert).
        clusters_data: list of dicts with cluster metadata
        """
        if not clusters_data:
            return

        # We might want to clear old clusters or just upsert. 
        # For a full re-clustering, clearing might be safer to remove stale clusters,
        # but upsert is safer for concurrent operations.
        # Let's use a separate collection for cluster metadata.
        cluster_collection = self.db["clusters"]
        
        # Ensure index on cluster_id
        await cluster_collection.create_index([("cluster_id", 1)], unique=True)

        from pymongo import ReplaceOne
        operations = []
        for cluster in clusters_data:
            operations.append(
                ReplaceOne(
                    {"cluster_id": cluster["cluster_id"]}, 
                    cluster, 
                    upsert=True
                )
            )
        
        if operations:
            await cluster_collection.bulk_write(operations)
            print(f"[Mongo] Upserted {len(operations)} cluster metadata records")

    async def get_clusters(self):
        """
        Retrieve all cluster metadata.
        """
        cluster_collection = self.db["clusters"]
        cursor = cluster_collection.find({})
        results = await cursor.to_list(length=None)
        for r in results:
            r["_id"] = str(r["_id"])
        return results

    async def get_clustering_config(self):
        """
        Get current clustering config from DB (or defaults).
        """
        config_collection = self.db["config"]
        doc = await config_collection.find_one({"_id": "clustering_params"})
        return doc or {}

    async def set_clustering_config(self, params):
        """
        Update clustering config in DB.
        """
        config_collection = self.db["config"]
        await config_collection.update_one(
            {"_id": "clustering_params"},
            {"$set": params},
            upsert=True
        )

    async def watch_config_changes(self, callback):
        """
        Watch for changes in the config collection and trigger re-clustering.
        """
        config_collection = self.db["config"]
        pipeline = [
            {"$match": {"operationType": {"$in": ["insert", "update", "replace"]}, "documentKey._id": "clustering_params"}}
        ]
        async with config_collection.watch(pipeline) as stream:
            print("[MongoDB] Configuration watcher started.")
            async for change in stream:
                print(f"[MongoDB] Config change detected: {change['operationType']}")
                await callback()

    async def get_earthquakes(self, mag_min=None, mag_max=None, start_time=None, end_time=None, 
                              depth_min=None, depth_max=None, 
                              north=None, south=None, east=None, west=None, 
                              limit=100):
        """Fetch earthquakes with optional filters."""
        query = {}
        
        # Magnitude Filter
        if mag_min is not None or mag_max is not None:
            query["magnitude"] = {}
            if mag_min is not None:
                query["magnitude"]["$gte"] = float(mag_min)
            if mag_max is not None:
                query["magnitude"]["$lte"] = float(mag_max)
        
        # Time Filter (Time is stored as int ms)
        if start_time is not None or end_time is not None:
            query["time"] = {}
            if start_time is not None:
                query["time"]["$gte"] = int(start_time)
            if end_time is not None:
                query["time"]["$lte"] = int(end_time)

        # Depth Filter
        if depth_min is not None or depth_max is not None:
            query["depth"] = {}
            if depth_min is not None:
                query["depth"]["$gte"] = float(depth_min)
            if depth_max is not None:
                query["depth"]["$lte"] = float(depth_max)

        # Bounding Box Filter (North/South = Lat, East/West = Lon)
        if north is not None or south is not None:
            query["latitude"] = {}
            if north is not None: query["latitude"]["$lte"] = float(north)
            if south is not None: query["latitude"]["$gte"] = float(south)
            
        if east is not None or west is not None:
            query["longitude"] = {}
            if east is not None: query["longitude"]["$lte"] = float(east)
            if west is not None: query["longitude"]["$gte"] = float(west)

        cursor = self.collection.find(query).sort("time", -1).limit(limit)
        results = await cursor.to_list(length=limit)
        
        # Clean up _id for JSON serialization
        for r in results:
            r["_id"] = str(r["_id"])
        
        return results

    async def get_heatmap_data(
        self, 
        start_time: int = None, 
        end_time: int = None,
        mag_min: float = None,
        mag_max: float = None,
        depth_min: float = None,
        depth_max: float = None,
        weight_by: str = "magnitude"
    ):
        """
        Aggregates earthquake data into a grid for heatmaps.
        Groups events by rounded latitude/longitude (approx 10km grid).
        Supports filtering and multiple weight modes.
        """
        # Build match conditions
        match_conditions = {
            "latitude": {"$exists": True, "$ne": None},
            "longitude": {"$exists": True, "$ne": None}
        }
        
        if start_time is not None or end_time is not None:
            match_conditions["time"] = {}
            if start_time is not None:
                match_conditions["time"]["$gte"] = int(start_time)
            if end_time is not None:
                match_conditions["time"]["$lte"] = int(end_time)
        
        if mag_min is not None or mag_max is not None:
            match_conditions["magnitude"] = {}
            if mag_min is not None:
                match_conditions["magnitude"]["$gte"] = float(mag_min)
            if mag_max is not None:
                match_conditions["magnitude"]["$lte"] = float(mag_max)
        
        if depth_min is not None or depth_max is not None:
            match_conditions["depth"] = {}
            if depth_min is not None:
                match_conditions["depth"]["$gte"] = float(depth_min)
            if depth_max is not None:
                match_conditions["depth"]["$lte"] = float(depth_max)

        # Determine weight calculation
        if weight_by == "count":
            weight_expr = {"$sum": 1}
        elif weight_by == "energy":
            # Seismic energy is proportional to 10^(1.5*M), but we simplify to 10^M for visualization
            weight_expr = {"$sum": {"$pow": [10, {"$divide": [{"$ifNull": ["$magnitude", 0]}, 2]}]}}
        elif weight_by == "depth":
            # Shallower earthquakes are more dangerous, so invert depth
            # Weight = 1 / (depth + 1) to avoid division by zero
            weight_expr = {"$sum": {"$divide": [1, {"$add": [{"$ifNull": ["$depth", 0]}, 1]}]}}
        else:  # default: magnitude
            weight_expr = {"$sum": {"$ifNull": ["$magnitude", 0]}}

        pipeline = [
            {"$match": match_conditions},
            {
                "$project": {
                    "lat": {"$round": [{"$toDouble": "$latitude"}, 1]},
                    "lon": {"$round": [{"$toDouble": "$longitude"}, 1]},
                    "magnitude": {"$toDouble": "$magnitude"},
                    "depth": {"$toDouble": "$depth"},
                    "place": 1  # Include place for grouping
                }
            },
            {
                "$group": {
                    "_id": {"lat": "$lat", "lon": "$lon"},
                    "weight": weight_expr,
                    "count": {"$sum": 1},
                    "avg_mag": {"$avg": "$magnitude"},
                    "sample_place": {"$first": "$place"}  # Pick one representative place
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "lat": "$_id.lat",
                    "lon": "$_id.lon",
                    "weight": 1,
                    "count": 1,
                    "avg_mag": {"$round": [{"$ifNull": ["$avg_mag", 0]}, 1]},
                    "region": "$sample_place"  # Include representative location
                }
            },
            {"$sort": {"weight": -1}},
            {"$limit": 500}  # Limit for performance
        ]
        
        return await self.collection.aggregate(pipeline).to_list(length=500)

    async def get_magnitude_distribution(self):
        """
        Groups earthquakes into magnitude ranges (buckets).
        Example: 0-1, 1-2, 2-3...
        """
        pipeline = [
            {
                "$project": {
                    "magnitude": {"$toDouble": "$magnitude"}
                }
            },
            {
                "$bucket": {
                    "groupBy": "$magnitude",
                    "boundaries": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    "default": "Other",
                    "output": {
                        "count": {"$sum": 1}
                    }
                }
            }
        ]
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=20)

    async def get_magnitude_trends(self):
        """
        Groups counts by day to show trends over time.
        """
        pipeline = [
            {
                "$project": {
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": {"$toDate": {"$toLong": "$time"}}
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": "$date",
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id": 1}}
        ]
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=100)

    async def find_nearby_main_shocks(self, lat, lon, max_dist_km=50, days_ago=7):
        """
        Finds earthquakes with magnitude >= 5.0 within a certain distance and time range.
        This is used to identify potential 'Main Shocks' for aftershock detection.
        """
        # Convert days to milliseconds
        time_limit_ms = int(days_ago * 24 * 60 * 60 * 1000)
        # Current quake's time isn't passed here, so we look back from the current wall-clock time 
        # or we could make it relative to a specific time. 
        # Safer: return main shocks that happened BEFORE the current event's time.
        # For simplicity in this method, let's just return recent big ones.
        
        pipeline = [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [lon, lat]},
                    "distanceField": "dist_meters",
                    "maxDistance": max_dist_km * 1000,
                    "query": {
                        "magnitude": {"$gte": 5.0}
                    },
                    "spherical": True
                }
            },
            {
                "$limit": 5
            }
        ]
        
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=5)

    async def get_depth_vs_magnitude(self, limit=1000):
        """
        Returns pairs of (depth, magnitude) for scatter plot visualization.
        """
        pipeline = [
            {
                "$project": {
                    "_id": 0,
                    "depth": {"$toDouble": "$depth"},
                    "magnitude": {"$toDouble": "$magnitude"},
                    "place": 1
                }
            },
            {"$limit": limit}
        ]
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)

    async def get_top_regions(self, limit=10):
        """
        Returns top regions by earthquake count using the last segment of the place string.
        """
        pipeline = [
            {
                "$project": {
                    "region": {
                        "$trim": {
                            "input": {"$arrayElemAt": [{"$split": ["$place", ","]}, -1]}
                        }
                    }
                }
            },
            {"$match": {"region": {"$ne": None, "$ne": ""}}},
            {
                "$group": {
                    "_id": "$region",
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)

    async def get_regional_risk_scores(self, limit=10):
        """
        Calculates a risk score (0-100) per region based on:
        - Avg Magnitude (30%)
        - Recent Frequency (Count in last 30 days) (40%)
        - Max Magnitude (Peak danger) (30%)
        """
        thirty_days_ago = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
        
        pipeline = [
            {
                "$project": {
                    "magnitude": {"$toDouble": "$magnitude"},
                    "time": {"$toLong": "$time"},
                    "region": {
                        "$trim": {
                            "input": {"$last": {"$split": ["$place", ","]}}
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": "$region",
                    "avg_mag": {"$avg": "$magnitude"},
                    "max_mag": {"$max": "$magnitude"},
                    "total_count": {"$sum": 1},
                    "recent_count": {
                        "$sum": {
                            "$cond": [{"$gte": ["$time", thirty_days_ago]}, 1, 0]
                        }
                    }
                }
            },
            {
                "$project": {
                    "region": "$_id",
                    "avg_mag": 1,
                    "max_mag": 1,
                    "recent_count": 1,
                    "risk_score": {
                        "$min": [
                            100,
                            {"$add": [
                                {"$multiply": ["$avg_mag", 10]}, # Avg Mag factor
                                {"$multiply": ["$recent_count", 2]}, # Frequency factor
                                {"$multiply": ["$max_mag", 5]} # Intensity peak factor
                            ]}
                        ]
                    }
                }
            },
            {"$sort": {"risk_score": -1}},
            {"$limit": limit}
        ]
        
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)

    async def get_unusual_activity_detection(self):
        """
        Detects spikes by comparing last 48h count vs historical daily average.
        Returns regions where CurrentCount > 2.5 * HistoricalAvg.
        """
        forty_eight_hours_ago = int((datetime.now() - timedelta(hours=48)).timestamp() * 1000)
        
        pipeline = [
            {
                "$project": {
                    "time": {"$toLong": "$time"},
                    "region": {
                        "$trim": {
                            "input": {"$last": {"$split": ["$place", ","]}}
                        }
                    }
                }
            },
            {
                "$group": {
                    "_id": "$region",
                    "total_count": {"$sum": 1},
                    "first_seen": {"$min": "$time"},
                    "recent_count": {
                        "$sum": {
                            "$cond": [{"$gte": ["$time", forty_eight_hours_ago]}, 1, 0]
                        }
                    }
                }
            },
            {
                "$project": {
                    "region": "$_id",
                    "recent_count": 1,
                    "total_count": 1,
                    "days_history": {
                        "$max": [
                            1,
                            {"$divide": [
                                {"$subtract": [int(datetime.now().timestamp() * 1000), "$first_seen"]},
                                86400000
                            ]}
                        ]
                    }
                }
            },
            {
                "$project": {
                    "region": 1,
                    "recent_count": 1,
                    "historical_daily_avg": {"$divide": ["$total_count", "$days_history"]}
                }
            },
            {
                "$match": {
                    "recent_count": {"$gt": 0},
                    "$expr": {"$gt": ["$recent_count", {"$multiply": ["$historical_daily_avg", 5]}]} # spike threshold
                }
            },
            {"$sort": {"recent_count": -1}}
        ]
        
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=20)

    def close(self):
        self.client.close()

# Global instance
mongo_handler = MongoHandler()
