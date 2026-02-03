import json
from datetime import datetime
from bson import ObjectId

class MongoJSONEncoder(json.JSONEncoder):
    """JSON encoder that converts MongoDB ObjectId to strings."""
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        return super().default(obj)

def format_timestamp(epoch_ms):
    """
    Converts epoch in milliseconds (e.g., 1770045297070)
    to a readable string: 'HH:MM:SS:mmm'
    """
    try:
        # Cast to float in case input is string
        seconds = float(epoch_ms) / 1000.0
        dt = datetime.fromtimestamp(seconds)
        # Format: Hour:Minute:Second:Microsecond -> Truncate micro to milli
        return dt.strftime('%H:%M:%S:%f')[:-3] 
    except Exception as e:
        print(f"Error formatting timestamp {epoch_ms}: {e}")
        return None
