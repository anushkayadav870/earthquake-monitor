# Earthquake Monitor - Master Verification Plan

This document outlines the steps to verify all backend features across Phases 1–5.

## Phase 1: Core MVP (Live Monitoring)
**Features**: Live Feed, Redis Pipeline, Real-Time Alerts, Basic Filters.

### 1.1 Live Feed & Redis Verification
*   **Action**: Ensure producer/worker are running.
*   **Command**: `curl -s "http://localhost:8000/earthquakes?limit=1"`
*   **Success**: Returns JSON list with latest earthquakes.

### 1.2 Basic Filters
*   **Action**: Filter by Magnitude > 4.0.
*   **Command**: `curl -s "http://localhost:8000/earthquakes?mag_min=4.0"`
*   **Success**: Returns only earthquakes with `magnitude >= 4.0`.

---

## Phase 2: Visualization & Exploration
**Features**: Heatmaps, Timelapse Data, Advanced Filters, Detail Context.

### 2.1 Heatmap Endpoint
*   **Action**: Get aggregated grid data.
*   **Command**: `curl -s "http://localhost:8000/earthquakes/heatmap?start_time=0&end_time=9999999999999"`
*   **Success**: Returns list of `{lat, lon, intensity}` objects.

### 2.2 Advanced Filters (Depth & BBox)
*   **Action**: Filter by Depth > 30km.
*   **Command**: `curl -s "http://localhost:8000/earthquakes?depth_min=30"`
*   **Success**: Returns earthquakes with `depth >= 30`.

### 2.3 Detail Context (Neo4j)
*   **Action**: Fetch full details for a specific event.
*   **Command**: `curl -s "http://localhost:8000/earthquakes/{EVENT_ID}"` (Replace `{EVENT_ID}` with actual ID)
*   **Success**: JSON includes `"context": { ... }` object.

---

## Phase 3: Analytics & Intelligence
**Features**: Mag Dist, Trends, Depth vs Mag.

### 3.1 Magnitude Distribution
*   **Action**: Get counts per magnitude range.
*   **Command**: `curl -s "http://localhost:8000/analytics/magnitude-distribution"`
*   **Success**: Returns `[{ "_id": 1.0, "count": 5 }, ...]`.

### 3.2 Magnitude Trends
*   **Action**: Get daily counts.
*   **Command**: `curl -s "http://localhost:8000/analytics/magnitude-trends"`
*   **Success**: Returns `[{ "_id": "2024-03-15", "count": 12 }, ...]`.

### 3.3 Depth vs Magnitude
*   **Action**: Get scatter plot data.
*   **Command**: `curl -s "http://localhost:8000/analytics/depth-vs-magnitude"`
*   **Success**: Returns `[{ "depth": 10, "magnitude": 2.5 }, ...]`.

---

## Phase 4: Graph & Relationship Insights
**Features**: Cascades, Aftershocks (Logic handled in Neo4j during ingestion).

### 4.1 Cascade/Aftershock Verification
*   **Action**: Verify `_link_aftershocks` logic works.
*   **Method**: This is verified via the **Detail Endpoint** context.
*   **Command**: `curl -s "http://localhost:8000/earthquakes/{EVENT_ID}"`
*   **Check**: Look for data in `"context"` field. If empty, it means no aftershocks found for that specific event, but the endpoint works.

---

## Phase 5: Risk Scoring & Prediction
**Features**: Regional Risk Scores, Unusual Activity.

### 5.1 Risk Scores
*   **Action**: Get calculated risk scores.
*   **Command**: `curl -s "http://localhost:8000/analytics/risk-scores"`
*   **Success**: Returns `[{ "region": "California", "risk_score": 85.5 }, ...]`.

### 5.2 Unusual Activity Detection
*   **Action**: Detect anomaly regions.
*   **Command**: `curl -s "http://localhost:8000/analytics/unusual-activity"`
*   **Success**: Returns regions with significantly higher recent activity.
