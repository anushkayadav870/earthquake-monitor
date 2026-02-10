import asyncio
import websockets
import json

async def receive_events():
    uri = "ws://localhost:8000/ws"
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Waiting for earthquakes (this might take 30s)...")
            while True:
                message = await websocket.recv()
                print(f"\n[LIVE EVENT RECEIVED]: {message[:100]}...") # Print first 100 chars
                data = json.loads(message)
                print(f"Location: {data['properties']['place']}")
                print(f"Magnitude: {data['properties']['mag']}")
    except Exception as e:
        print(f"Connection error (Is the backend running?): {e}")

if __name__ == "__main__":
    asyncio.run(receive_events())
