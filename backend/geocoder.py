from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
import redis
import json
import time
from config import REDIS_URL

class GeocodingService:
    def __init__(self):
        # UserAgent is required by Nominatim
        self.geolocator = Nominatim(user_agent="earthquake_monitor_app")
        # Reuse existing Redis if possible, or create new client for simple sync use here
        # Using sync redis client for simplicity within this helper
        self.redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        self.cache_ttl = 86400 # 24 hour

    def get_exact_address(self, lat, lon):
        cache_key = f"geo:{lat},{lon}"
        
        # 1. Check Cache
        cached_address = self.redis_client.get(cache_key)
        if cached_address:
            # print(f"[Geocoder] Component hit: {lat},{lon}")
            return cached_address

        # 2. Query External API
        try:
            # Nominatim Policy: Limit to 1 req/sec
            time.sleep(1) 
            location = self.geolocator.reverse((lat, lon), language="en", exactly_one=True)
            
            if location:
                address = location.address
                # 3. Save to Cache
                self.redis_client.setex(cache_key, self.cache_ttl, address)
                print(f"[Geocoder] Fetched: {address}")
                return address
            
        except (GeocoderTimedOut, GeocoderServiceError) as e:
            print(f"[Geocoder] API Error: {e}")
        except Exception as e:
            print(f"[Geocoder] Unexpected Error: {e}")

        return None

# Global Instance
geocoder = GeocodingService()
