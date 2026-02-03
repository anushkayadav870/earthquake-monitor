import requests
import json

BASE_URL = "http://localhost:8000"

def test_endpoint(endpoint):
    print(f"Testing {endpoint}...")
    try:
        response = requests.get(f"{BASE_URL}{endpoint}")
        if response.status_code == 200:
            print(f"SUCCESS: {endpoint} returned 200")
            data = response.json()
            print(f"Count: {len(data)}")
            if len(data) > 0:
                print("Sample data:")
                print(json.dumps(data[0], indent=2))
        else:
            print(f"FAILED: {endpoint} returned {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_endpoint("/analytics/aftershocks")
    print("-" * 20)
    test_endpoint("/analytics/cascades")
