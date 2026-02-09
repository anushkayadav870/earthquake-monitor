import requests
import json

API_BASE = "http://localhost:8000"

def test_heatmap_modes():
    modes = ["magnitude", "count", "energy", "depth"]
    
    for mode in modes:
        print(f"\nTesting mode: {mode}")
        url = f"{API_BASE}/earthquakes/heatmap?weight_by={mode}&start_time=0&end_time=9999999999999"
        try:
            response = requests.get(url)
            response.raise_for_status()
            data = response.json()
            
            print(f"Status: {response.status_code}")
            print(f"Results count: {len(data)}")
            if data:
                print(f"Sample point: {json.dumps(data[0], indent=2)}")
                assert "lat" in data[0]
                assert "lon" in data[0]
                assert "weight" in data[0]
            else:
                print("No data returned for this mode (might be empty DB)")
        except Exception as e:
            print(f"Error testing mode {mode}: {e}")

if __name__ == "__main__":
    # Ensure backend is running before testing
    try:
        requests.get(API_BASE)
        test_heatmap_modes()
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to {API_BASE}. Is the backend running?")
