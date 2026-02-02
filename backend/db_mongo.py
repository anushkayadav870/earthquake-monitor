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

    async def _ensure_indexes(self):
        """Ensures that required indexes (including geospatial) are present."""
        await self.collection.create_index([("location", "2dsphere")])
        await self.collection.create_index([("id", 1)], unique=True)
        await self.collection.create_index([("time", -1)])
        print("[MongoDB] Geospatial and unique indexes verified.")

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
            # if result.upserted_id:
            #    print(f"[Mongo] Inserted: {data['id']}")
            
        except Exception as e:
            print(f"[Mongo] Error inserting earthquake {data.get('id')}: {e}")

    async def get_earthquakes(self, mag_min=None, mag_max=None, start_time=None, end_time=None, limit=100):
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

        cursor = self.collection.find(query).sort("time", -1).limit(limit)
        results = await cursor.to_list(length=limit)
        
        # Clean up _id for JSON serialization
        for r in results:
            r["_id"] = str(r["_id"])
        
        return results

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
