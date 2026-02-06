# Frontend Build Plan - Earthquake Monitor UI

## Project Context
- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS
- **Map:** Leaflet (react-leaflet v4.2.1) — can switch to Mapbox later if needed
- **Real-time:** WebSocket via `/ws` endpoint
- **API:** REST endpoints for data + WebSocket for live updates

---

## ✅ COMPLETED FEATURES

### Phase 1 – Core MVP

#### 1. Map Rendering
- **Status:** ✅ **DONE**
- **Location:** `frontend-next/components/EarthquakeMap.tsx`
- **Features:**
  - Plot live earthquakes as CircleMarkers
  - Marker size scaled by magnitude
  - Color-coded by magnitude (red=6+, orange=5+, yellow=4+, green=3+, blue<3)
  - Full zoom/pan/drag functionality
  - OpenStreetMap tiles rendering
  - Responsive container sizing

#### 2. Live Data Feed Integration
- **Status:** ✅ **DONE**
- **Location:** 
  - `frontend-next/hooks/useWebSocket.ts` (WebSocket connection with auto-reconnect)
  - `frontend-next/components/LiveFeed.tsx` (event list display)
  - `frontend-next/lib/api.ts` (REST API client)
- **Features:**
  - WebSocket connection to `ws://localhost:8000/ws`
  - Auto-reconnect with exponential backoff
  - Real-time event list (latest 50 events)
  - Initial load from `/earthquakes/latest` REST endpoint
  - Magnitude, location, time display

#### 3. UI Layout & Navigation
- **Status:** ✅ **DONE**
- **Location:**
  - `frontend-next/app/layout.tsx` (root layout with Tailwind)
  - `frontend-next/app/page.tsx` (home with map + live feed sections)
- **Features:**
  - Responsive grid layout
  - Global Tailwind CSS configuration
  - Max-width container
  - Clean typography

#### 4. Layer Controls (Partial)
- **Status:** 🟡 **PARTIALLY DONE** (toggles exist, behavior needs refinement)
- **Location:** `frontend-next/components/EarthquakeMap.tsx` (lines ~350-380)
- **Features:**
  - Checkbox toggles for: Markers, Heatmap, Clusters
  - State management for visibility
  - **Issue:** Toggles may not properly remove layers (debugging logs added)

#### 5. Event Details Popup
- **Status:** ✅ **DONE**
- **Location:** `frontend-next/components/EarthquakeMap.tsx` (FloatingPopupOverlay component)
- **Features:**
  - Click marker → shows info card near marker location
  - Displays: Place, magnitude, depth, coordinates, time
  - Close button
  - Follows map pans/zooms
  - High z-index so it appears on top

---

## 🟡 IN PROGRESS / PARTIAL

### Phase 1 – Core MVP

#### 1. Heatmap Layer
- **Status:** 🟡 **PARTIAL** (fallback circles work, native heatmap needs leaflet-heat plugin)
- **Location:** `frontend-next/components/EarthquakeMap.tsx` (HeatmapLayer component, lines ~116-188)
- **What Works:**
  - Circle fallback renders intensity-based circles
  - Toggle on/off works (with debug logs)
  - Magnitude normalization (0-1 scale)
  - Color gradient
- **What Needs Fixing:**
  - Install `leaflet-heat` npm package for native heatmaps (optional, circles are OK for MVP)
  - Test with real earthquake data at scale

#### 2. Clustering Layer
- **Status:** 🟡 **PARTIAL** (logic implemented, toggle behavior needs verification)
- **Location:** `frontend-next/components/EarthquakeMap.tsx` (ClusteringLayer component, lines ~190-285)
- **What Works:**
  - Proximity-based grouping (0.5° grid cells)
  - Creates separate markers for single vs. multi-event clusters
  - Color-coded: blue=single, orange=multi
  - Click cluster → shows first event details
- **What Needs:**
  - Verify toggle on/off actually removes clusters
  - Test at scale (100+ events)
  - Visual refinement (cluster badge with count?)

---

## ❌ NOT STARTED / TODO

### Phase 1 – Core MVP

#### 1. Alerts UI
- **Status:** ❌ **TODO**
- **Requirement:** Display real-time alerts from WebSocket
- **Components to Build:**
  - `components/AlertsPanel.tsx` - Notifications drawer/sidebar
  - Alert severity indicators (red=high mag, orange=medium, yellow=low)
  - Close/dismiss alerts
  - Link to alert event on map
- **Backend Integration:**
  - Subscribe to `/ws` ALERT_CHANNEL messages
  - Extract `event` and `message` fields
  - Show toast/notification UI
- **Estimated Effort:** 2-3 hours

#### 2. Filter UI (Time Range & Magnitude Sliders)
- **Status:** ❌ **TODO**
- **Requirement:** Allow users to filter earthquakes
- **Components to Build:**
  - `components/FilterPanel.tsx` - Sidebar or top controls
  - Time range slider (date picker + range input)
  - Magnitude range slider (3.0 - 10.0)
  - Apply/Reset buttons
- **Backend Integration:**
  - Pass `start_time`, `end_time`, `min_magnitude`, `max_magnitude` to `/earthquakes/search` endpoint
  - Filter map markers in real-time
- **API Changes Needed:**
  - Create `/earthquakes/search?start_time=X&end_time=Y&min_mag=Z&max_mag=W` endpoint
- **Estimated Effort:** 3-4 hours

---

### Phase 2 – Visualization & Exploration

#### 1. Timelapse Playback Controls
- **Status:** ❌ **TODO**
- **Requirement:** Play through earthquake history with slider
- **Components to Build:**
  - `components/TimelapseControls.tsx` - Play/pause/speed slider
  - Timeline scrubber showing animation progress
  - Date range display
- **Backend Integration:**
  - New `/earthquakes/timeline?start=X&end=Y&step=3600` endpoint (return hourly aggregates)
  - Frontend fetches all time slices, animates through them
  - Clear old markers and add new ones per time slice
- **Estimated Effort:** 4-5 hours

#### 2. Proper Heatmap Layer (Mapbox or Leaflet-heat)
- **Status:** ❌ **TODO** (circle fallback exists)
- **Requirement:** Smooth heatmap visualization
- **Options:**
  - Option A: Install `leaflet-heat` plugin (lightweight, Leaflet-native)
  - Option B: Switch to Mapbox (more features, requires key)
- **Components to Build:**
  - Update HeatmapLayer component to use leaflet-heat
  - Backend aggregation: `/earthquakes/heatmap?zoom=5&bounds=...` for tile-based data
- **Estimated Effort:** 2-3 hours (if leaflet-heat), 6-8 hours (if Mapbox migration)

#### 3. Earthquake Detail Page
- **Status:** ❌ **TODO**
- **Requirement:** Full event metadata + relationships
- **Components to Build:**
  - `app/earthquake/[id]/page.tsx` - Detail page route
  - `components/EarthquakeDetail.tsx` - Event metadata display
  - `components/AftershockTimeline.tsx` - Related events timeline
  - `components/EventRelationships.tsx` - Fault/region links
- **Backend Integration:**
  - `/earthquakes/{id}` - full event details
  - `/earthquakes/{id}/aftershocks` - related aftershocks (from Neo4j)
  - `/earthquakes/{id}/relationships` - fault/region connections
- **Estimated Effort:** 5-6 hours

#### 4. Advanced Filters UI
- **Status:** ❌ **TODO**
- **Requirement:** Depth, region, advanced time/magnitude
- **Components to Build:**
  - `components/AdvancedFilterPanel.tsx` - Multi-filter form
  - Depth range slider
  - Region/country multi-select
  - Magnitude vs. depth scatter plot preview
  - Saved filter presets
- **Backend Integration:**
  - Extend `/earthquakes/search` with `min_depth`, `max_depth`, `regions` params
  - New `/earthquakes/regions` endpoint for region list
- **Estimated Effort:** 4-5 hours

---

### Phase 3 – Analytics & Intelligence

#### 1. Charts & Dashboards
- **Status:** ❌ **TODO**
- **Requirement:** Visualize earthquake trends
- **Components to Build:**
  - `app/analytics/page.tsx` - Dashboard page
  - `components/MagnitudeDistributionChart.tsx` (histogram)
  - `components/TrendAnalysisChart.tsx` (line chart over time)
  - `components/DepthVsMagnitudeChart.tsx` (scatter plot)
  - `components/TopRegionsChart.tsx` (bar chart)
- **Libraries:** 
  - Recharts or Chart.js for charting
- **Backend Integration:**
  - `/analytics/magnitude-distribution` - histogram data
  - `/analytics/trends?period=month` - time series
  - `/analytics/depth-magnitude` - scatter data
  - `/analytics/top-regions` - regional stats
- **Estimated Effort:** 6-8 hours

#### 2. Aftershock Visualization
- **Status:** ❌ **TODO**
- **Requirement:** Highlight main shocks and aftershocks
- **Components to Build:**
  - Update EarthquakeMap to show aftershock hierarchy
  - Marker styling: star for mainshock, smaller dots for aftershocks
  - Draw lines connecting aftershocks to mainshock
  - Toggle "Show Aftershocks" layer
- **Backend Integration:**
  - `/earthquakes/{id}/aftershocks` - returns related events
  - Already available in Neo4j relationships
- **Estimated Effort:** 3-4 hours

---

### Phase 4 – Graph & Relationship Insights

#### 1. Graph Visualizations (Fault Lines & Cascades)
- **Status:** ❌ **TODO**
- **Requirement:** Visualize Neo4j relationships
- **Components to Build:**
  - `app/graph/page.tsx` - Graph explorer page
  - `components/GraphViewer.tsx` - Interactive node-link graph
  - Libraries: D3.js or Cytoscape.js
- **Backend Integration:**
  - `/graph/nodes?type=fault|region|earthquake` - node list
  - `/graph/edges?source=fault_1&target=earthquake_2` - relationships
- **Estimated Effort:** 8-10 hours

---

### Phase 5 – Risk & Prediction Insights

#### 1. Risk Score UI
- **Status:** ❌ **TODO**
- **Requirement:** Display region risk scores
- **Components to Build:**
  - Risk score badges on map regions
  - `components/RiskScorePanel.tsx` - Detailed risk breakdown
  - Color gradient: green (low) → yellow → red (high)
- **Backend Integration:**
  - `/analytics/risk-score?region=california` - compute or fetch risk
  - Aggregate from historical data + recent activity
- **Estimated Effort:** 3-4 hours

#### 2. Prediction-Adjacent Alerts
- **Status:** ❌ **TODO**
- **Requirement:** Highlight unusual activity
- **Components to Build:**
  - Anomaly badges on unusual events
  - `components/AnomalyAlert.tsx` - Alert for statistical outliers
- **Backend Integration:**
  - `/analytics/anomalies` - detect unusual patterns
  - ML model integration (if available)
- **Estimated Effort:** 4-6 hours

---

## 📋 RECOMMENDED BUILD SEQUENCE

### **Week 1: Phase 1 Completion**
1. **Day 1-2:** Fix layer toggles (Markers, Heatmap, Clusters) ✅ 🟡
   - Debug why toggle state doesn't remove layers
   - Add test logging to verify state changes propagate
2. **Day 2:** Implement **Alerts UI** ❌
   - Create AlertsPanel component
   - Wire WebSocket ALERT_CHANNEL
3. **Day 3-4:** Implement **Filter UI** ❌
   - Time range + magnitude sliders
   - Connect to REST API with query params
4. **Day 5:** Polish & test Phase 1 ✅

### **Week 2: Phase 2 Foundation**
1. **Day 1:** Install `leaflet-heat` and upgrade HeatmapLayer ❌
2. **Day 2-3:** Build **Timelapse Controls** ❌
   - Play/pause/speed controls
   - Timeline animation loop
3. **Day 4-5:** Build **Earthquake Detail Page** ❌
   - Route: `/earthquake/[id]`
   - Display full metadata + aftershocks

### **Week 3-4: Phase 3 + Polish**
1. Analytics dashboard with charts
2. Aftershock visualization
3. Advanced filtering
4. Testing & optimization

---

## 🔄 ARCHITECTURE NOTES

### Current Tech Stack
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Map:** Leaflet + react-leaflet v4.2.1
- **State:** React hooks (useState, useEffect, useRef)
- **HTTP:** fetch API + custom axios wrapper
- **WebSocket:** Custom `useWebSocket` hook with auto-reconnect
- **Charts:** (TBD - Recharts recommended)

### File Structure Template
```
frontend-next/
├── app/
│   ├── layout.tsx          ✅ (root layout)
│   ├── page.tsx            ✅ (home - map + live feed)
│   ├── analytics/
│   │   └── page.tsx        ❌ (charts dashboard)
│   ├── graph/
│   │   └── page.tsx        ❌ (graph explorer)
│   └── earthquake/
│       └── [id]/
│           └── page.tsx    ❌ (detail page)
├── components/
│   ├── EarthquakeMap.tsx           ✅ (main map, 60% done)
│   ├── LiveFeed.tsx                ✅ (event list)
│   ├── AlertsPanel.tsx             ❌ (alerts)
│   ├── FilterPanel.tsx             ❌ (filters)
│   ├── AdvancedFilterPanel.tsx     ❌ (advanced)
│   ├── TimelapseControls.tsx       ❌ (playback)
│   ├── EarthquakeDetail.tsx        ❌ (detail view)
│   ├── AftershockTimeline.tsx      ❌ (aftershock list)
│   ├── MagnitudeDistributionChart.tsx  ❌
│   ├── TrendAnalysisChart.tsx      ❌
│   ├── DepthVsMagnitudeChart.tsx   ❌
│   ├── GraphViewer.tsx             ❌ (D3/Cytoscape)
│   └── RiskScorePanel.tsx          ❌
├── hooks/
│   ├── useWebSocket.ts    ✅ (WebSocket logic)
│   ├── useFilters.ts      ❌ (filter state)
│   └── useTimelapse.ts    ❌ (playback state)
├── lib/
│   ├── api.ts             ✅ (REST client)
│   └── constants.ts       ❌ (config)
└── styles/
    └── globals.css        ✅ (Tailwind)
```

---

## 🎯 SUCCESS CRITERIA

### Phase 1 (MVP) - Complete by Week 1
- ✅ Map renders with live data
- ✅ Layer toggles work reliably
- ⬜ Alerts panel displays real-time alerts
- ⬜ Filters allow time/magnitude selection
- ⬜ Event popup shows details

### Phase 2 (Exploration) - Complete by Week 2-3
- ⬜ Timelapse playback controls work
- ⬜ Heatmap layer renders smoothly
- ⬜ Detail page shows full earthquake data + aftershocks
- ⬜ Advanced filters available

### Phase 3+ (Analytics & Intelligence) - Ongoing
- ⬜ Charts dashboard with trends
- ⬜ Aftershock relationships highlighted
- ⬜ Risk scores displayed

---

## 🔗 BACKEND API ENDPOINTS NEEDED

### Already Implemented ✅
- `GET /earthquakes/latest?limit=N` - recent events
- `WebSocket /ws` - real-time event stream

### To Implement ❌
- `GET /earthquakes/search?start_time=X&end_time=Y&min_mag=Z&max_mag=W&min_depth=A&max_depth=B&regions=...` 
- `GET /earthquakes/{id}` - full event details
- `GET /earthquakes/{id}/aftershocks` - related events
- `GET /earthquakes/heatmap?zoom=Z&bounds=...` - aggregated heatmap data
- `GET /earthquakes/timeline?start=X&end=Y&step=3600` - time slices
- `GET /earthquakes/regions` - list of regions
- `GET /analytics/magnitude-distribution` - histogram
- `GET /analytics/trends?period=month` - time series
- `GET /analytics/depth-magnitude` - scatter data
- `GET /analytics/risk-score?region=...` - risk calculation
- `GET /graph/nodes?type=...` - Neo4j nodes
- `GET /graph/edges` - Neo4j relationships

---

## 📝 NEXT IMMEDIATE ACTIONS

1. **Debug layer toggles** (2-3 hours)
   - Verify useEffect dependencies in HeatmapLayer and ClusteringLayer
   - Add console logs to confirm state changes trigger layer removal
   - Fix any missing state propagation issues

2. **Build Alerts UI** (3-4 hours)
   - Create `components/AlertsPanel.tsx`
   - Subscribe to ALERT_CHANNEL via WebSocket
   - Display alerts in notification format

3. **Build Filter UI** (3-4 hours)
   - Create `components/FilterPanel.tsx` with sliders
   - Implement `/earthquakes/search` backend endpoint
   - Update map to apply filters

These 3 items complete Phase 1 MVP (~8-10 hours).

