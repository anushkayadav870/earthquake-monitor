from db_neo4j import neo4j_handler
import json

def verify_neo4j_analytics():
    print("=== Neo4j Advanced Analytics Verification (Phase 4) ===")
    
    # 1. Verify Aftershock Sequences
    print("\n1. Testing Aftershock Detection...")
    aftershocks = neo4j_handler.get_aftershock_sequences(limit=5)
    if aftershocks:
        print(f"SUCCESS: Found {len(aftershocks)} aftershock relationships.")
        for i, seq in enumerate(aftershocks):
            main = seq['main_shock']
            after = seq['aftershock']
            print(f"  [{i+1}] Main: {main['magnitude']} ({main['place']}) -> After: {after['magnitude']} ({after['place']})")
    else:
        print("INFO: No aftershock sequences found in graph yet (requires relevant data).")

    # 2. Verify Cascade Events
    print("\n2. Testing Cascade Event Detection (Cross-Fault Triggering)...")
    cascades = neo4j_handler.get_cascade_events(limit=5)
    if cascades:
        print(f"SUCCESS: Found {len(cascades)} potential cascade events.")
        for i, cas in enumerate(cascades):
            trig = cas['triggering_event']
            trigd = cas['triggered_event']
            details = cas['details']
            print(f"  [{i+1}] Triggered: {details['from_fault']} -> {details['to_fault']}")
            print(f"      Event: {trig['magnitude']} ({trig['place']}) -> {trigd['magnitude']} ({trigd['place']})")
    else:
        print("INFO: No cascade events detected in graph yet.")

    print("\nVerification Complete.")

if __name__ == "__main__":
    try:
        verify_neo4j_analytics()
    finally:
        neo4j_handler.close()
