import os
import config

print("--- DEBUG ENV VARS ---")
print(f"NEO4J_URI from env: {os.getenv('NEO4J_URI')}")
print(f"NEO4J_URI from config: {config.NEO4J_URI}")
print("--- END DEBUG ---")
