from fastapi import FastAPI
import os

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from Earthquake Monitor Backend!"}

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mongo_uri": os.getenv("MONGO_URI"),
        "redis_host": os.getenv("REDIS_HOST"),
        "neo4j_uri": os.getenv("NEO4J_URI")
    }
