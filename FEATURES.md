# 🌟 Features & Filters Guide

This document provides a detailed breakdown of every feature implemented in the **Earthquake Monitor System** and exact instructions on how to use the powerful filtering engine.

---

## 1. 🔍 The Filtering Engine
The `/earthquakes` API is the core engine for exploring data. It supports combining multiple filters at once.

### Standard Filters
| Parameter | Description |
| :--- | :--- |
| `mag_min` | Find earthquakes **stronger** than this value (e.g., `5.0`). |
| `mag_max` | Find earthquakes **weaker** than this value. |
| `start_time` | Epoch timestamp (ms). Find events **after** this time. |
| `end_time` | Epoch timestamp (ms). Find events **before** this time. |

### Advanced Filters (New in Phase 2)
| Parameter | Description |
| :--- | :--- |
| `depth_min` | Filter by depth (km). Great for finding deep-focus quakes (>300km). |
| `depth_max` | Filter by shallow quakes (<10km). |
| `north` | Top latitude boundary (Bounding Box). |
| `south` | Bottom latitude boundary. |
| `east` | Right longitude boundary. |
| `west` | Left longitude boundary. |

**Example Query:**
*"Show me strong earthquakes (Mag > 5.0) that happened deep underground (>50km) in the California region."*
```bash
/earthquakes?mag_min=5.0&depth_min=50&north=42&south=32&east=-114&west=-125
```

---

## 2. 📊 Analytics Features
We perform complex mathematical analysis on the data instantly.

*   **Magnitude Distribution**: A histogram showing frequency of different earthquake sizes.
    *   *Endpoint*: `/analytics/magnitude-distribution`
*   **Magnitude Trends**: Daily counts to visualize if seismic activity is increasing or decreasing over time.
    *   *Endpoint*: `/analytics/magnitude-trends`
*   **Depth vs. Magnitude**: Scatter plot data to see if deeper earthquakes tend to be stronger.
    *   *Endpoint*: `/analytics/depth-vs-magnitude`

---

## 3. 🕸️ Graph Intelligence (Neo4j)
This is unique "AI-like" logic that finds hidden connections.

*   **⚠️ Aftershock Detection**:
    *   Automatically links a large "Main Shock" to smaller quakes that happen nearby within a short time window.
    *   *Feature*: Allows analysts to separate primary events from settling tremors.
*   **🔗 Cascade Events**:
    *   Detects if an earthquake on one fault line triggered another quake on a *different* nearby fault line.
    *   *Feature*: Critical for understanding stress transfer between faults.

---

## 4. 🧠 Risk & Anomalies
*   **Regional Risk Scoring**:
    *   We calculate a `0-100` score for major regions (e.g., California, Japan).
    *   *Formula*: Based on recent frequency + magnitude of events.
*   **Anomaly Level**:
    *   The system learns the "normal" activity level for a region.
    *   If current activity spikes >200% above normal, it flags it as "Unusual Activity".

---

## 5. 🗺️ Visualization specific
*   **Heatmap Data**:
    *   The system divides the world into a grid.
    *   It aggregates thousands of events into "intensity points" so you can visualize hot zones without crashing the browser with thousands of markers.
    *   *Endpoint*: `/earthquakes/heatmap`



To visualize the graph data, open your Neo4j Browser at http://localhost:7474 (Login: neo4j / Password: test1234).

Copy and paste these Cypher Queries into the top bar to see different visualizations:

1. 🕸️ See the "Whole Picture" (Limit to 100 nodes)
This shows earthquakes, faults, and cities all connected together.

MATCH (n) RETURN n LIMIT 100
2. ⚠️ Visualize Aftershock Clusters
See "Main Shocks" (center) connected to their smaller "Aftershocks" (surrounding).

MATCH (main:Earthquake)<-[r:PART_OF_SEQUENCE]-(after:Earthquake)
RETURN main, r, after
3. 🏙️ Earthquakes Near Cities
See which earthquakes happened close to populated areas.

MATCH (e:Earthquake)-[r:OCCURRED_NEAR]->(c:City)
RETURN e, r, c
LIMIT 50
4. 🌋 Earthquakes on Fault Zones
Visualize which Fault Zones are currently active.

MATCH (e:Earthquake)-[r:ON_FAULT]->(f:FaultZone)
RETURN e, r, f
LIMIT 50
5. 🔗 Cascade Events (Triggered Quakes)
See if one earthquake potentially triggered another one nearby.

MATCH p=(:Earthquake)-[:POSSIBLE_TRIGGERED_EVENT]->(:Earthquake)
RETURN p    