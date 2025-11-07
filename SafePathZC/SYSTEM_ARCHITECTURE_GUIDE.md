# SafePath Zamboanga - System Architecture & Feature Guide

## Table of Contents

1. [Overview](#overview)
2. [Route Finding System](#route-finding-system)
3. [Flood Analysis System](#flood-analysis-system)
4. [How Features Differ](#how-features-differ)
5. [Complete Flow Diagrams](#complete-flow-diagrams)

---

## Overview

SafePath Zamboanga uses a **hybrid routing approach** that combines:

- **OSRM** (Open Source Routing Machine) - Fast, real-world road routing
- **A\* Pathfinding** - Custom flood-aware route calculation
- **GeoJSON Data** - Local road network and flood risk data

### Key Data Sources

1. **`zcroadmap.geojson`** - Road network with hierarchy (primary, secondary roads)

   - Location: `backend/data/zcroadmap.geojson`
   - Used for: Route calculation, road connectivity

2. **`terrain_roads.geojson`** - Flood risk data for each road segment
   - Location: `backend/data/terrain_roads.geojson`
   - Used for: Flood analysis, risk assessment

---

## Route Finding System

### 1. Main Endpoint: Flood-Aware Routing

**File:** `backend/routes/flood_routing.py`

**Function:** `get_flood_aware_routes(request: FloodRouteRequest)`

- **Line:** ~130
- **Purpose:** Generate 3 distinct routes with different flood risk profiles

#### Request Flow:

```
User Request
    ↓
/api/routing/flood-routes (POST)
    ↓
get_flood_aware_routes()
    ↓
Strategy 1: OSRM Alternatives
    ↓
Strategy 2: Waypoint-Based Routes (OSRM)
    ↓
Strategy 2.5: A* Pathfinding (Local)  ← NEW!
    ↓
Strategy 3: Simple PostgreSQL Routing
    ↓
Strategy 4: Fallback Direct Routes
    ↓
Select 3 Best Routes (Safe, Manageable, Flood-Prone)
    ↓
Return to Frontend
```

---

### 2. Strategy 1: OSRM Alternatives

**File:** `backend/routes/flood_routing.py`
**Lines:** ~163-220

**What it does:**

- Sends request to OSRM server (localhost:5000)
- Gets 1-3 alternative routes
- Fast and follows real roads accurately

**Code snippet:**

```python
osrm_endpoint = get_osrm_endpoint_for_mode(request.transport_mode)
osrm_url = f"{osrm_endpoint}/{coords_str}"
response = await client.get(osrm_url, params={
    "overview": "full",
    "geometries": "geojson",
    "alternatives": "true"
})
```

**Transportation Modes:**

- File: `backend/services/transportation_modes.py`
- Function: `get_osrm_endpoint_for_mode(mode: str)`
- Maps modes to OSRM endpoints:
  - `car` → `http://localhost:5000/route/v1/driving`
  - `motorcycle` → `http://localhost:5001/route/v1/driving`
  - `walking` → `http://localhost:5002/route/v1/foot`
  - etc.

---

### 3. Strategy 2: Waypoint-Based Routes

**File:** `backend/routes/flood_routing.py`
**Function:** Part of `get_flood_aware_routes()` - Strategy 2 section
**Lines:** ~232-327

**What it does:**

- Creates artificial waypoints perpendicular to direct route
- Forces OSRM to generate alternative paths
- Uses offset factors: 3%, 5%, 8% of route distance

**Code snippet:**

```python
# Create waypoint with perpendicular offset
mid_lat = (request.start_lat + request.end_lat) / 2
mid_lng = (request.start_lng + request.end_lng) / 2

waypoint_lat = mid_lat + perp_y * distance * offset_factor
waypoint_lng = mid_lng + perp_x * distance * offset_factor
```

**Dead-End Detection:**

- **File:** `backend/routes/flood_routing.py`
- **Function:** `has_dead_end_segment(coordinates, threshold_m=400.0)`
- **Lines:** ~32-112
- Prevents routes that backtrack or loop unnecessarily

---

### 4. Strategy 2.5: A\* Pathfinding with Flood Penalties ⭐

**File:** `backend/routes/flood_routing.py`
**Lines:** ~329-408

**What it does:**

- Uses local A\* algorithm with custom flood avoidance
- Generates truly distinct routes based on risk tolerance
- Applies aggressive penalties to flooded roads

**Risk Profiles:**

| Profile        | Flood Penalty | Expected Result            | Color     |
| -------------- | ------------- | -------------------------- | --------- |
| **Safe**       | 50x           | <20% flooded, longer route | 🟢 Green  |
| **Manageable** | 5x            | 25-40% flooded, balanced   | 🟠 Orange |
| **Prone**      | 1.1x          | 40-60% flooded, shortest   | 🔴 Red    |

**Code snippet:**

```python
routing_service = get_routing_service()

for risk_profile in ['safe', 'manageable', 'prone']:
    route_coords = routing_service.calculate_route(
        start_coord,
        end_coord,
        mode=mode,
        risk_profile=risk_profile  # This applies the penalties!
    )
```

---

### 5. A\* Algorithm Implementation

**File:** `backend/services/local_routing.py`

#### Key Functions:

##### A. `calculate_route(start, end, mode, risk_profile)`

- **Lines:** ~498-540
- **Purpose:** Main entry point for route calculation
- **Process:**
  1. Find nearest road points to start/end
  2. Call A\* search with risk profile
  3. Return optimized path

##### B. `_a_star_search(start, end, mode, risk_profile)`

- **Lines:** ~542-701
- **Purpose:** Core A\* pathfinding algorithm
- **How it works:**

```
1. Build flood cache (coordinates + OSM IDs)
   └─ Lines: ~545-564

2. Initialize open set with start node
   └─ Line: ~566

3. Loop until destination found:
   ├─ Pop node with lowest f_score
   ├─ Check if reached destination
   ├─ Get neighbors from road network
   ├─ Calculate routing cost (with flood penalties)
   └─ Add neighbors to open set
   └─ Lines: ~581-685

4. Reconstruct path from came_from map
   └─ Lines: ~687-701
```

##### C. `get_routing_cost(mode, risk_profile, flood_lookup_cache)`

- **Lines:** ~113-194
- **Purpose:** Calculate cost of traversing a road segment
- **THIS IS WHERE FLOOD PENALTIES ARE APPLIED!**

**Cost Calculation Formula:**

```
total_cost = base_distance × flood_factor × terrain_factor × mode_factor × hierarchy_penalty
```

**Flood Factor Calculation:**

```python
# Lines: ~129-148
if risk_profile == "safe":
    flood_factor = 50.0 if is_flooded else 1.0  # AVOID FLOODS!
elif risk_profile == "manageable":
    flood_factor = 5.0 if is_flooded else 1.0   # Moderate avoidance
else:  # "prone"
    flood_factor = 1.1 if is_flooded else 1.0   # Almost no penalty
```

**Flood Detection:**

```python
# Lines: ~127-146
is_flooded = self.flooded  # From segment data

# Check flood cache (OSM ID match)
if not is_flooded and flood_lookup_cache and self.osm_id:
    is_flooded = flood_lookup_cache.get(self.osm_id, False)

# Check flood cache (coordinate match - more reliable!)
if not is_flooded and len(self.coordinates) > 0:
    for coord in self.coordinates:
        coord_key = (round(coord.lat, 4), round(coord.lng, 4))
        if flood_lookup_cache.get(coord_key, False):
            is_flooded = True
            break
```

---

## Flood Analysis System

### 1. Main Function: `analyze_route_flood_risk()`

**File:** `backend/services/local_routing.py`
**Lines:** ~1081-1240

**Purpose:** Analyze any route (from OSRM or A\*) for flood risk

#### Input:

```python
route_coordinates: List[Tuple[float, float]]  # [(lng, lat), ...]
buffer_meters: float = 50.0  # Search radius for nearby roads
weather_data: dict = None  # Current weather conditions
```

#### Output:

```python
{
    "flood_score": 45.2,           # 0-100 score
    "flooded_distance_m": 3200.5,  # Meters of flooded road
    "safe_distance_m": 3850.3,     # Meters of safe road
    "total_distance_m": 7050.8,    # Total distance
    "flooded_percentage": 45.4,    # Percentage flooded
    "risk_level": "high",          # low/moderate/high/severe
    "weather_impact": "moderate",  # Weather severity
    "weather_multiplier": 1.5      # Weather risk multiplier
}
```

---

### 2. Flood Analysis Process

#### Step 1: Weather Impact Assessment

**Lines:** ~1114-1143

```python
# Heavy rain increases flood risk
if precipitation_mm > 50:
    weather_multiplier = 2.5  # Extreme rain
elif precipitation_mm > 25:
    weather_multiplier = 2.0  # Heavy rain
elif precipitation_mm > 10:
    weather_multiplier = 1.5  # Moderate rain

# Strong winds add additional risk
if wind_kph > 60:
    weather_multiplier *= 1.3
```

#### Step 2: Segment Analysis

**Lines:** ~1145-1197

For each segment of the route:

1. Calculate segment distance
2. Find nearby road segments using **spatial index** (FAST O(1) lookup)
3. Check if any nearby segments are flooded
4. Accumulate flooded vs safe distance

**Code:**

```python
for i in range(len(route_coordinates) - 1):
    coord1 = Coordinate(lat=lat1, lng=lng1)
    coord2 = Coordinate(lat=lat2, lng=lng2)
    segment_distance = coord1.distance_to(coord2)

    # Fast spatial lookup
    midpoint = Coordinate(lat=(lat1 + lat2) / 2, lng=(lng1 + lng2) / 2)
    nearby_segments = service._get_nearby_roads_fast(midpoint, buffer_meters)

    # Check if flooded
    is_segment_flooded = any(seg.flooded for seg in nearby_segments)

    if is_segment_flooded:
        flooded_distance += segment_distance
    else:
        safe_distance += segment_distance
```

#### Step 3: Risk Level Determination

**Lines:** ~1199-1220

```python
if weather_impact in ["severe", "high"]:
    # Stricter thresholds during bad weather
    if flooded_percentage < 10:
        risk_level = "low"
    elif flooded_percentage < 30:
        risk_level = "moderate"
    else:
        risk_level = "high"
else:
    # Normal thresholds
    if flooded_percentage < 20:
        risk_level = "low"
    elif flooded_percentage < 50:
        risk_level = "moderate"
    else:
        risk_level = "high"
```

---

### 3. Spatial Index for Fast Lookups

**File:** `backend/services/local_routing.py`

#### A. Building the Index

**Function:** `_build_spatial_index()`
**Lines:** ~356-372

```python
def _build_spatial_index(self):
    self.spatial_grid.clear()

    for segment in self.road_segments:
        for coord in segment.coordinates:
            grid_x = int(coord.lng / self.grid_size)
            grid_y = int(coord.lat / self.grid_size)
            self.spatial_grid[(grid_x, grid_y)].append(segment)
```

- Divides map into grid cells (~111 meters each)
- Each cell stores list of road segments
- Enables O(1) lookup instead of O(n) search

#### B. Fast Lookup

**Function:** `_get_nearby_roads_fast(coord, buffer_meters)`
**Lines:** ~374-398

```python
def _get_nearby_roads_fast(self, coord, buffer_meters=50.0):
    grid_x = int(coord.lng / self.grid_size)
    grid_y = int(coord.lat / self.grid_size)

    # Calculate cells to check
    cells_to_check = max(1, int(buffer_meters / 111000 / self.grid_size) + 1)

    # Check nearby cells
    for dx in range(-cells_to_check, cells_to_check + 1):
        for dy in range(-cells_to_check, cells_to_check + 1):
            cell_key = (grid_x + dx, grid_y + dy)
            if cell_key in self.spatial_grid:
                # Add segments from this cell
```

**Performance:**

- Without index: O(n) - check ALL road segments
- With index: O(k) - check only nearby segments (k << n)
- Example: 11,675 total segments → ~50 nearby segments checked

---

## How Features Differ

### Route Calculation Methods

| Method               | Speed        | Accuracy | Flood Awareness            | Use Case              |
| -------------------- | ------------ | -------- | -------------------------- | --------------------- |
| **OSRM**             | ⚡ Very Fast | 🎯 High  | ❌ No (post-analysis only) | Quick standard routes |
| **A\* (Safe)**       | 🐌 Slow      | 🎯 High  | ✅ Yes (50x penalty)       | Flood-avoiding routes |
| **A\* (Manageable)** | 🐌 Slow      | 🎯 High  | ✅ Yes (5x penalty)        | Balanced routes       |
| **A\* (Prone)**      | 🐌 Slow      | 🎯 High  | ❌ Minimal (1.1x)          | Shortest routes       |

---

### Flood Detection Methods

#### Method 1: Direct Segment Data

**Location:** Road segment properties

```python
segment.flooded  # Boolean from GeoJSON
```

- Source: `terrain_roads.geojson`
- Most reliable but only available for terrain data

#### Method 2: OSM ID Matching

**Location:** `get_routing_cost()` - Line ~133

```python
if self.osm_id:
    is_flooded = flood_lookup_cache.get(self.osm_id, False)
```

- Fast lookup (O(1))
- May fail if OSM IDs differ between datasets

#### Method 3: Coordinate Matching ⭐ (Most Reliable)

**Location:** `get_routing_cost()` - Lines ~136-142

```python
for coord in self.coordinates:
    coord_key = (round(coord.lat, 4), round(coord.lng, 4))
    if flood_lookup_cache.get(coord_key, False):
        is_flooded = True
        break
```

- Works across different GeoJSON files
- Rounds to ~10m precision
- Slightly slower but more accurate

---

## Complete Flow Diagrams

### Frontend Request → Backend Response

```
┌─────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION (Frontend)                          │
│    File: frontend/src/components/MapView.tsx            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 2. ROUTE PLANNER MODAL                                   │
│    - User selects start/end points                      │
│    - Chooses transport mode (car/motorcycle/walking)    │
│    - Adds waypoints (optional)                          │
│    Lines: ~9900-10100                                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 3. API REQUEST                                           │
│    POST /api/routing/flood-routes                       │
│    Body: {                                               │
│      start_lat, start_lng,                              │
│      end_lat, end_lng,                                   │
│      transport_mode: "car",                             │
│      waypoints: [...],                                   │
│      weather_data: {...}                                 │
│    }                                                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 4. BACKEND ROUTING ENGINE                                │
│    File: backend/routes/flood_routing.py                │
│    Function: get_flood_aware_routes()                   │
│                                                          │
│    Strategy 1: OSRM Alternatives ────────┐              │
│    Strategy 2: Waypoint Routes ──────────┤              │
│    Strategy 2.5: A* with Flood Penalties ┼─→ all_routes │
│    Strategy 3: PostgreSQL Routing ───────┤              │
│    Strategy 4: Fallback Direct ──────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 5. FLOOD ANALYSIS                                        │
│    File: backend/services/local_routing.py              │
│    Function: analyze_route_flood_risk()                 │
│                                                          │
│    For each route:                                       │
│    ├─ Calculate segment distances                       │
│    ├─ Find nearby flooded roads (spatial index)         │
│    ├─ Apply weather multipliers                         │
│    └─ Determine risk level                              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 6. ROUTE SELECTION                                       │
│    File: backend/routes/flood_routing.py                │
│    Lines: ~580-640                                       │
│                                                          │
│    Sort by flood percentage:                             │
│    ├─ Safe: Lowest flood % (Green)                      │
│    ├─ Manageable: Middle flood % (Orange)               │
│    └─ Flood-prone: Highest flood % or shortest (Red)    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 7. RESPONSE                                              │
│    {                                                     │
│      routes: [                                           │
│        {                                                 │
│          label: "safe",                                  │
│          color: "#22c55e",                              │
│          geometry: { coordinates: [[lng,lat],...] },    │
│          distance: 7311,                                 │
│          duration: 601,                                  │
│          flood_percentage: 15.8,                        │
│          risk_level: "low"                              │
│        },                                                │
│        { ... }, // manageable                            │
│        { ... }  // flood-prone                           │
│      ]                                                   │
│    }                                                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│ 8. FRONTEND RENDERING                                    │
│    File: frontend/src/components/MapView.tsx            │
│                                                          │
│    - Draw routes on map with colors                     │
│    - Show route details modal                           │
│    - Display flood risk indicators                      │
│    - Enable route comparison                            │
└─────────────────────────────────────────────────────────┘
```

---

### A\* Pathfinding with Flood Penalties (Detailed)

```
START: calculate_route(start, end, mode="car", risk_profile="safe")
│
├─ 1. Find nearest road points
│     File: local_routing.py
│     Function: find_nearest_road_point()
│     Lines: ~467-497
│
├─ 2. Initialize A* search
│     Function: _a_star_search()
│     Lines: ~542-701
│     │
│     ├─ 2a. Build flood cache
│     │     Lines: ~545-564
│     │     ├─ Load terrain_roads.geojson
│     │     ├─ Index flooded segments by OSM ID
│     │     └─ Index flooded segments by coordinates
│     │
│     ├─ 2b. Initialize data structures
│     │     Lines: ~566-578
│     │     ├─ open_set: [(f_score, coordinate)]
│     │     ├─ came_from: {coord: previous_coord}
│     │     ├─ g_score: {coord: cost_from_start}
│     │     └─ f_score: {coord: g_score + heuristic}
│     │
│     └─ 2c. Main A* loop (up to 50,000 iterations)
│           Lines: ~581-685
│           │
│           FOR each iteration:
│           │
│           ├─ Pop node with lowest f_score
│           │   current_f, current = heapq.heappop(open_set)
│           │
│           ├─ Check if reached destination
│           │   if current == end:
│           │       reconstruct_path()
│           │       RETURN path
│           │
│           ├─ Get neighbors from routing graph
│           │   for segment, point_index in graph[current].connected_segments:
│           │
│           ├─ Calculate routing cost 🔥
│           │   routing_cost = segment.get_routing_cost(
│           │       mode="car",
│           │       risk_profile="safe",  ← THIS APPLIES PENALTIES!
│           │       flood_lookup_cache=flood_cache
│           │   )
│           │   │
│           │   └─→ get_routing_cost() function
│           │       Lines: ~113-194
│           │       │
│           │       ├─ Check if segment is flooded
│           │       │   ├─ self.flooded (from GeoJSON)
│           │       │   ├─ OSM ID lookup in cache
│           │       │   └─ Coordinate lookup in cache
│           │       │
│           │       ├─ Apply flood penalty based on risk_profile
│           │       │   if risk_profile == "safe":
│           │       │       flood_factor = 50.0 if flooded else 1.0
│           │       │   elif risk_profile == "manageable":
│           │       │       flood_factor = 5.0 if flooded else 1.0
│           │       │   else:  # prone
│           │       │       flood_factor = 1.1 if flooded else 1.0
│           │       │
│           │       ├─ Apply terrain difficulty
│           │       │   terrain_factor = elevation_factor * slope_factor
│           │       │
│           │       ├─ Apply road hierarchy penalty
│           │       │   ├─ Major roads (highway): 1.0x
│           │       │   ├─ Secondary roads: 1.2x
│           │       │   └─ Minor roads: 1.5x
│           │       │
│           │       └─ Calculate total cost
│           │           total_cost = distance × flood_factor ×
│           │                       terrain_factor × mode_factor ×
│           │                       hierarchy_penalty
│           │
│           ├─ Calculate tentative g_score
│           │   tentative_g = g_score[current] + routing_cost
│           │
│           ├─ If better path found:
│           │   └─ Update came_from, g_score, f_score
│           │       Add neighbor to open_set
│           │
│           └─ Continue to next iteration
│
├─ 3. Simplify path
│     Function: _simplify_path()
│     Lines: ~703-762
│     ├─ Use Douglas-Peucker algorithm
│     └─ Tolerance: 20 meters (preserves detail)
│
└─ 4. Return route coordinates
      Format: [Coordinate(lat, lng), ...]
```

---

## Key Configuration Values

### Flood Penalties (local_routing.py, Lines ~133-142)

```python
SAFE_PROFILE = 50.0x penalty for flooded roads
MANAGEABLE_PROFILE = 5.0x penalty for flooded roads
PRONE_PROFILE = 1.1x penalty for flooded roads
```

### Path Simplification (local_routing.py, Line ~624)

```python
TOLERANCE = 20.0 meters  # Douglas-Peucker simplification
```

### Spatial Grid (local_routing.py, Line ~240)

```python
GRID_SIZE = 0.001 degrees ≈ 111 meters per cell
```

### A\* Search Limits (local_routing.py, Lines ~563-565)

```python
MAX_ITERATIONS = 50,000
MAX_STAGNANT_ITERATIONS = 3,000
MAX_DETOUR_FACTOR = 2.5x direct distance
```

### Weather Multipliers (local_routing.py, Lines ~1114-1136)

```python
EXTREME_RAIN (>50mm) = 2.5x flood risk
HEAVY_RAIN (>25mm) = 2.0x flood risk
MODERATE_RAIN (>10mm) = 1.5x flood risk
LIGHT_RAIN (>5mm) = 1.2x flood risk

VERY_STRONG_WIND (>60kph) = 1.3x additional risk
STRONG_WIND (>40kph) = 1.15x additional risk
```

---

## Summary of Key Files

| File                                       | Purpose                          | Key Functions                                                                               |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `backend/routes/flood_routing.py`          | Main routing endpoint            | `get_flood_aware_routes()`                                                                  |
| `backend/services/local_routing.py`        | A\* pathfinding & flood analysis | `calculate_route()`, `_a_star_search()`, `get_routing_cost()`, `analyze_route_flood_risk()` |
| `backend/services/transportation_modes.py` | OSRM endpoint mapping            | `get_osrm_endpoint_for_mode()`                                                              |
| `backend/data/zcroadmap.geojson`           | Road network data                | Used by routing_service                                                                     |
| `backend/data/terrain_roads.geojson`       | Flood risk data                  | Used by flood_service                                                                       |
| `frontend/src/components/MapView.tsx`      | Map & route display              | Route rendering, modal display                                                              |

---

## How to Test & Debug

### 1. Enable Debug Logging

In `backend/services/local_routing.py`, change:

```python
logging.basicConfig(level=logging.DEBUG)  # Change from INFO to DEBUG
```

### 2. Check Route Generation

Look for these log messages:

```
INFO:routes.flood_routing:Strategy 2.5: Generating A* routes...
INFO:services.local_routing:Building flood cache from 11675 segments...
INFO:services.local_routing:Flood cache built: XXXXX flooded entries indexed
INFO:services.local_routing:A* Search: Direct distance XXXXm, Search boundary XXXXm
```

### 3. Verify Flood Penalties Are Applied

Check the final results:

```
INFO:routes.flood_routing:✓ Final routes selected from X candidates:
INFO:routes.flood_routing:  🟢 Safe:         15.2% flooded  ← Should be LOW
INFO:routes.flood_routing:  🟠 Manageable:   32.5% flooded  ← Should be MODERATE
INFO:routes.flood_routing:  🔴 Flood-prone:  48.7% flooded  ← Should be HIGH
```

If all three routes have similar flood percentages, the penalties aren't working!

---

## Performance Optimization Tips

### 1. Spatial Index

- Always use `_get_nearby_roads_fast()` instead of iterating all segments
- Pre-build spatial grid on service initialization
- File: `local_routing.py`, Lines ~356-398

### 2. Flood Cache

- Build once at start of A\* search
- Uses both OSM IDs and coordinates
- O(1) lookup during pathfinding
- File: `local_routing.py`, Lines ~545-564

### 3. Path Simplification

- Reduces points from 200+ to ~50
- Uses Douglas-Peucker algorithm
- Balance: 20m tolerance preserves detail while reducing size
- File: `local_routing.py`, Lines ~703-762

### 4. Early Termination

- Stop A\* if no improvement after 3,000 iterations
- Stop if route exceeds 2.5x direct distance
- File: `local_routing.py`, Lines ~563-565

---

## Common Issues & Solutions

### Issue 1: All routes have same flood percentage

**Cause:** Flood cache not matching routing segments
**Solution:** Coordinate-based matching (Lines ~136-142)

### Issue 2: A\* search times out

**Cause:** Start/end not on road network
**Solution:** Increase search radius in `find_nearest_road_point()` (Line ~484)

### Issue 3: Routes have dead-end segments

**Cause:** OSRM waypoints force detours
**Solution:** `has_dead_end_segment()` filter (Lines ~42-103)

### Issue 4: Routes too simplified

**Cause:** High tolerance in `_simplify_path()`
**Solution:** Reduce tolerance to 20m (Line ~624)

---

## Future Enhancements

1. **Real-time flood data integration**

   - Update `terrain_roads.geojson` with live data
   - Rebuild flood cache dynamically

2. **Machine learning for route prediction**

   - Train on historical route choices
   - Predict optimal routes based on user preferences

3. **Multi-modal transportation**

   - Combine walking + jeepney + motorcycle
   - Transfer points optimization

4. **Community-sourced flood reports**
   - Allow users to report flooded areas
   - Update flood data in real-time

---

**Last Updated:** November 8, 2025
**Version:** 1.0
**Author:** SafePath Development Team
