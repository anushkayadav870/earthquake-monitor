from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne, ReplaceOne
from config import MONGO_URI, MONGO_DB_NAME
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple, Any
import asyncio


class DatabaseConnection:
    """Manages MongoDB connection and database references"""
    
    def __init__(self, uri: str, db_name: str):
        self._client = AsyncIOMotorClient(uri)
        self._database = self._client[db_name]
        self._collections = {
            'earthquakes': self._database['earthquakes'],
            'clusters': self._database['clusters'],
            'config': self._database['config']
        }
    
    def get_collection(self, name: str):
        return self._collections.get(name, self._database[name])
    
    def disconnect(self):
        self._client.close()


class IndexManager:
    """Handles all index creation and management"""
    
    @staticmethod
    async def setup_indexes(collection):
        index_configs = [
            ([("location", "2dsphere")], {}),
            ([("id", 1)], {"unique": True}),
            ([("time", -1)], {}),
            ([("cluster_id", 1)], {})
        ]
        
        for keys, options in index_configs:
            await collection.create_index(keys, **options)
        
        print("[MongoDB] All indexes initialized successfully")
    
    @staticmethod
    async def setup_cluster_index(collection):
        await collection.create_index([("cluster_id", 1)], unique=True)


class DataTransformer:
    """Transforms and validates earthquake data"""
    
    @staticmethod
    def prepare_earthquake_data(raw_data: Dict) -> Dict:
        transformed = raw_data.copy()
        
        # Convert numeric fields
        numeric_fields = {
            'magnitude': float,
            'latitude': float,
            'longitude': float,
            'depth': float
        }
        
        for field, converter in numeric_fields.items():
            if field in transformed and transformed[field] not in (None, ""):
                transformed[field] = converter(transformed[field])
        
        # Convert timestamp
        if "time" in transformed and transformed[time] not in (None, ""):
            transformed["time"] = int(transformed["time"])
        
        # Create GeoJSON structure
        if "latitude" in transformed and "longitude" in transformed:
            transformed["location"] = {
                "type": "Point",
                "coordinates": [transformed["longitude"], transformed["latitude"]]
            }
        
        return transformed
    
    @staticmethod
    def clean_document_id(doc: Dict) -> Dict:
        if doc and "_id" in doc:
            doc["_id"] = str(doc["_id"])
        return doc
    
    @staticmethod
    def clean_documents(docs: List[Dict]) -> List[Dict]:
        return [DataTransformer.clean_document_id(doc) for doc in docs]


class QueryBuilder:
    """Builds MongoDB query filters"""
    
    @staticmethod
    def build_range_filter(field: str, min_val: Optional[float], max_val: Optional[float]) -> Dict:
        if min_val is None and max_val is None:
            return {}
        
        query = {}
        if min_val is not None:
            query["$gte"] = float(min_val)
        if max_val is not None:
            query["$lte"] = float(max_val)
        
        return {field: query} if query else {}
    
    @staticmethod
    def build_earthquake_query(
        mag_min=None, mag_max=None,
        start_time=None, end_time=None,
        depth_min=None, depth_max=None,
        north=None, south=None, east=None, west=None
    ) -> Dict:
        query = {}
        
        # Magnitude range
        mag_filter = QueryBuilder.build_range_filter("magnitude", mag_min, mag_max)
        query.update(mag_filter)
        
        # Time range
        if start_time is not None or end_time is not None:
            time_filter = {}
            if start_time is not None:
                time_filter["$gte"] = int(start_time)
            if end_time is not None:
                time_filter["$lte"] = int(end_time)
            query["time"] = time_filter
        
        # Depth range
        depth_filter = QueryBuilder.build_range_filter("depth", depth_min, depth_max)
        query.update(depth_filter)
        
        # Bounding box
        if north is not None or south is not None:
            lat_filter = {}
            if north is not None:
                lat_filter["$lte"] = float(north)
            if south is not None:
                lat_filter["$gte"] = float(south)
            query["latitude"] = lat_filter
        
        if east is not None or west is not None:
            lon_filter = {}
            if east is not None:
                lon_filter["$lte"] = float(east)
            if west is not None:
                lon_filter["$gte"] = float(west)
            query["longitude"] = lon_filter
        
        return query


class AggregationPipelines:
    """Contains all aggregation pipeline definitions"""
    
    @staticmethod
    def heatmap_pipeline(
        match_conditions: Dict,
        weight_by: str = "magnitude"
    ) -> List[Dict]:
        weight_expressions = {
            "count": {"$sum": 1},
            "energy": {"$sum": {"$pow": [10, {"$divide": [{"$ifNull": ["$magnitude", 0]}, 2]}]}},
            "depth": {"$sum": {"$divide": [1, {"$add": [{"$ifNull": ["$depth", 0]}, 1]}]}},
            "magnitude": {"$sum": {"$ifNull": ["$magnitude", 0]}}
        }
        
        weight_expr = weight_expressions.get(weight_by, weight_expressions["magnitude"])
        
        return [
            {"$match": match_conditions},
            {
                "$project": {
                    "lat": {"$round": [{"$toDouble": "$latitude"}, 1]},
                    "lon": {"$round": [{"$toDouble": "$longitude"}, 1]},
                    "magnitude": {"$toDouble": "$magnitude"},
                    "depth": {"$toDouble": "$depth"},
                    "place": 1
                }
            },
            {
                "$group": {
                    "_id": {"lat": "$lat", "lon": "$lon"},
                    "weight": weight_expr,
                    "count": {"$sum": 1},
                    "avg_mag": {"$avg": "$magnitude"},
                    "sample_place": {"$first": "$place"}
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
                    "region": "$sample_place"
                }
            },
            {"$sort": {"weight": -1}},
            {"$limit": 500}
        ]
    
    @staticmethod
    def magnitude_distribution_pipeline() -> List[Dict]:
        return [
            {"$project": {"magnitude": {"$toDouble": "$magnitude"}}},
            {
                "$bucket": {
                    "groupBy": "$magnitude",
                    "boundaries": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
                    "default": "Other",
                    "output": {"count": {"$sum": 1}}
                }
            }
        ]
    
    @staticmethod
    def daily_trends_pipeline() -> List[Dict]:
        return [
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
            {"$group": {"_id": "$date", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
    
    @staticmethod
    def nearby_mainshocks_pipeline(lat: float, lon: float, max_dist_km: int) -> List[Dict]:
        return [
            {
                "$geoNear": {
                    "near": {"type": "Point", "coordinates": [lon, lat]},
                    "distanceField": "dist_meters",
                    "maxDistance": max_dist_km * 1000,
                    "query": {"magnitude": {"$gte": 5.0}},
                    "spherical": True
                }
            },
            {"$limit": 5}
        ]
    
    @staticmethod
    def depth_magnitude_pipeline(limit: int) -> List[Dict]:
        return [
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
    
    @staticmethod
    def top_regions_pipeline(limit: int) -> List[Dict]:
        return [
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
            {"$group": {"_id": "$region", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
    
    @staticmethod
    def risk_scores_pipeline(thirty_days_ago_ms: int, limit: int) -> List[Dict]:
        return [
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
                            "$cond": [{"$gte": ["$time", thirty_days_ago_ms]}, 1, 0]
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
                                {"$multiply": ["$avg_mag", 10]},
                                {"$multiply": ["$recent_count", 2]},
                                {"$multiply": ["$max_mag", 5]}
                            ]}
                        ]
                    }
                }
            },
            {"$sort": {"risk_score": -1}},
            {"$limit": limit}
        ]
    
    @staticmethod
    def unusual_activity_pipeline(forty_eight_hours_ago_ms: int, current_time_ms: int) -> List[Dict]:
        return [
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
                            "$cond": [{"$gte": ["$time", forty_eight_hours_ago_ms]}, 1, 0]
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
                                {"$subtract": [current_time_ms, "$first_seen"]},
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
                    "$expr": {"$gt": ["$recent_count", {"$multiply": ["$historical_daily_avg", 5]}]}
                }
            },
            {"$sort": {"recent_count": -1}}
        ]


class EarthquakeRepository:
    """Handles earthquake-specific database operations"""
    
    def __init__(self, collection):
        self.collection = collection
    
    async def upsert(self, data: Dict) -> None:
        try:
            prepared_data = DataTransformer.prepare_earthquake_data(data)
            await self.collection.update_one(
                {"id": prepared_data["id"]},
                {"$set": prepared_data},
                upsert=True
            )
        except Exception as e:
            print(f"[Repo] Insert error for {data.get('id')}: {e}")
    
    async def find_by_id(self, event_id: str) -> Optional[Dict]:
        doc = await self.collection.find_one({"id": event_id})
        return DataTransformer.clean_document_id(doc)
    
    async def find_with_filters(
        self, query: Dict, sort_field: str = "time", 
        sort_order: int = -1, limit: int = 100
    ) -> List[Dict]:
        cursor = self.collection.find(query).sort(sort_field, sort_order).limit(limit)
        results = await cursor.to_list(length=limit)
        return DataTransformer.clean_documents(results)
    
    async def bulk_update_clusters(self, updates: List[Tuple[str, int]]) -> None:
        if not updates:
            return
        
        operations = [
            UpdateOne({"id": eq_id}, {"$set": {"cluster_id": cluster_id}})
            for eq_id, cluster_id in updates
        ]
        
        if operations:
            result = await self.collection.bulk_write(operations)
            print(f"[Repo] Cluster update: {result.modified_count} records")
    
    async def aggregate(self, pipeline: List[Dict], limit: int = 500) -> List[Dict]:
        cursor = self.collection.aggregate(pipeline)
        return await cursor.to_list(length=limit)


class ClusterRepository:
    """Handles cluster metadata operations"""
    
    def __init__(self, collection):
        self.collection = collection
    
    async def clear_all(self) -> None:
        await self.collection.delete_many({})
        print("[ClusterRepo] All clusters cleared")
    
    async def upsert_many(self, clusters: List[Dict]) -> None:
        if not clusters:
            return
        
        await IndexManager.setup_cluster_index(self.collection)
        
        operations = [
            ReplaceOne(
                {"cluster_id": cluster["cluster_id"]},
                cluster,
                upsert=True
            )
            for cluster in clusters
        ]
        
        if operations:
            await self.collection.bulk_write(operations)
            print(f"[ClusterRepo] Upserted {len(operations)} clusters")
    
    async def find_all(self) -> List[Dict]:
        cursor = self.collection.find({})
        results = await cursor.to_list(length=None)
        return DataTransformer.clean_documents(results)


class ConfigRepository:
    """Handles configuration storage and watching"""
    
    def __init__(self, collection):
        self.collection = collection
    
    async def get_clustering_params(self) -> Dict:
        doc = await self.collection.find_one({"_id": "clustering_params"})
        return doc or {}
    
    async def set_clustering_params(self, params: Dict) -> None:
        await self.collection.update_one(
            {"_id": "clustering_params"},
            {"$set": params},
            upsert=True
        )
    
    async def watch_changes(self, callback) -> None:
        pipeline = [
            {
                "$match": {
                    "operationType": {"$in": ["insert", "update", "replace"]},
                    "documentKey._id": "clustering_params"
                }
            }
        ]
        
        async with self.collection.watch(pipeline) as stream:
            print("[ConfigRepo] Change watcher started")
            async for change in stream:
                print(f"[ConfigRepo] Detected: {change['operationType']}")
                await callback()


class MongoHandler:
    """Main handler orchestrating all MongoDB operations"""
    
    def __init__(self):
        self.db_connection = DatabaseConnection(MONGO_URI, MONGO_DB_NAME)
        
        self.earthquake_repo = EarthquakeRepository(
            self.db_connection.get_collection('earthquakes')
        )
        self.cluster_repo = ClusterRepository(
            self.db_connection.get_collection('clusters')
        )
        self.config_repo = ConfigRepository(
            self.db_connection.get_collection('config')
        )
    
    async def initialize(self):
        """Setup indexes and prepare collections"""
        await IndexManager.setup_indexes(
            self.db_connection.get_collection('earthquakes')
        )
    
    # Earthquake operations
    async def get_event(self, event_id: str) -> Optional[Dict]:
        return await self.earthquake_repo.find_by_id(event_id)
    
    async def insert_earthquake(self, data: Dict) -> None:
        await self.earthquake_repo.upsert(data)
    
    async def get_earthquakes(
        self, mag_min=None, mag_max=None, start_time=None, end_time=None,
        depth_min=None, depth_max=None, north=None, south=None, 
        east=None, west=None, limit=100
    ) -> List[Dict]:
        query = QueryBuilder.build_earthquake_query(
            mag_min, mag_max, start_time, end_time,
            depth_min, depth_max, north, south, east, west
        )
        return await self.earthquake_repo.find_with_filters(query, limit=limit)
    
    async def update_earthquakes_with_cluster_id(self, updates: List[Tuple[str, int]]) -> None:
        await self.earthquake_repo.bulk_update_clusters(updates)
    
    # Cluster operations
    async def clear_clusters(self) -> None:
        await self.cluster_repo.clear_all()
    
    async def update_clusters(self, clusters_data: List[Dict]) -> None:
        await self.cluster_repo.upsert_many(clusters_data)
    
    async def get_clusters(self) -> List[Dict]:
        return await self.cluster_repo.find_all()
    
    # Configuration operations
    async def get_clustering_config(self) -> Dict:
        return await self.config_repo.get_clustering_params()
    
    async def set_clustering_config(self, params: Dict) -> None:
        await self.config_repo.set_clustering_params(params)
    
    async def watch_config_changes(self, callback) -> None:
        await self.config_repo.watch_changes(callback)
    
    # Analytics and aggregations
    async def get_heatmap_data(
        self, start_time: int = None, end_time: int = None,
        mag_min: float = None, mag_max: float = None,
        depth_min: float = None, depth_max: float = None,
        weight_by: str = "magnitude"
    ) -> List[Dict]:
        match_conditions = {
            "latitude": {"$exists": True, "$ne": None},
            "longitude": {"$exists": True, "$ne": None}
        }
        
        # Add time filter
        if start_time is not None or end_time is not None:
            time_filter = {}
            if start_time:
                time_filter["$gte"] = int(start_time)
            if end_time:
                time_filter["$lte"] = int(end_time)
            match_conditions["time"] = time_filter
        
        # Add magnitude filter
        mag_filter = QueryBuilder.build_range_filter("magnitude", mag_min, mag_max)
        if mag_filter:
            match_conditions.update(mag_filter)
        
        # Add depth filter
        depth_filter = QueryBuilder.build_range_filter("depth", depth_min, depth_max)
        if depth_filter:
            match_conditions.update(depth_filter)
        
        pipeline = AggregationPipelines.heatmap_pipeline(match_conditions, weight_by)
        return await self.earthquake_repo.aggregate(pipeline)
    
    async def get_magnitude_distribution(self) -> List[Dict]:
        pipeline = AggregationPipelines.magnitude_distribution_pipeline()
        return await self.earthquake_repo.aggregate(pipeline, limit=20)
    
    async def get_magnitude_trends(self) -> List[Dict]:
        pipeline = AggregationPipelines.daily_trends_pipeline()
        return await self.earthquake_repo.aggregate(pipeline, limit=100)
    
    async def find_nearby_main_shocks(
        self, lat: float, lon: float, max_dist_km: int = 50, days_ago: int = 7
    ) -> List[Dict]:
        pipeline = AggregationPipelines.nearby_mainshocks_pipeline(lat, lon, max_dist_km)
        return await self.earthquake_repo.aggregate(pipeline, limit=5)
    
    async def get_depth_vs_magnitude(self, limit: int = 1000) -> List[Dict]:
        pipeline = AggregationPipelines.depth_magnitude_pipeline(limit)
        return await self.earthquake_repo.aggregate(pipeline, limit=limit)
    
    async def get_top_regions(self, limit: int = 10) -> List[Dict]:
        pipeline = AggregationPipelines.top_regions_pipeline(limit)
        return await self.earthquake_repo.aggregate(pipeline, limit=limit)
    
    async def get_regional_risk_scores(self, limit: int = 10) -> List[Dict]:
        thirty_days_ago = int((datetime.now() - timedelta(days=30)).timestamp() * 1000)
        pipeline = AggregationPipelines.risk_scores_pipeline(thirty_days_ago, limit)
        return await self.earthquake_repo.aggregate(pipeline, limit=limit)
    
    async def get_unusual_activity_detection(self) -> List[Dict]:
        forty_eight_hours_ago = int((datetime.now() - timedelta(hours=48)).timestamp() * 1000)
        current_time = int(datetime.now().timestamp() * 1000)
        pipeline = AggregationPipelines.unusual_activity_pipeline(
            forty_eight_hours_ago, current_time
        )
        return await self.earthquake_repo.aggregate(pipeline, limit=20)
    
    def close(self):
        self.db_connection.disconnect()


# Global instance
mongo_handler = MongoHandler()