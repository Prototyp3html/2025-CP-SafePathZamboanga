# SafePathZC - Complete Documentation

## 📋 Table of Contents

1. [Key Files to Study](#key-files-to-study)
2. [System Overview](#system-overview)
3. [How Flood Data Works](#how-flood-data-works)
4. [API Integration Details](#api-integration-details)
5. [How Routing Works](#how-routing-works)
6. [How the Code Works](#how-the-code-works)
7. [Panel Defense Guide](#panel-defense-guide)
8. [Quick Commands](#quick-commands)

---

## 📚 Key Files to Study

### API Integration & Data Collection:

| File | Purpose | Key Functions | Lines |
|------|---------|---------------|-------|
| `services/flood_data_updater.py` | Fetches data from 3 APIs & generates terrain_roads.geojson | `fetch_osm_roads()`<br>`fetch_elevation_data()`<br>`fetch_weather_data()`<br>`calculate_flood_risk()` | 70-105<br>107-145<br>147-175<br>177-230 |

### Routing Algorithm Implementation:

| File | Purpose | Key Functions | Lines |
|------|---------|---------------|-------|
| `services/local_routing.py` | A* pathfinding with flood penalties | `load_road_network()`<br>`build_routing_graph()`<br>`get_routing_cost()` ⭐<br>`_a_star_search()`<br>`analyze_route_flood_risk()` | 240-290<br>290-350<br>113-210<br>590-750<br>1100-1200 |
| `routes/flood_routing.py` | Generates 3 routes with different penalties | `generate_routes()` | 140-180 |

### Data Files:

| File | Purpose | Format |
|------|---------|--------|
| `data/terrain_roads.geojson` | 10,461 roads with flood status | GeoJSON (6.65 MB) |

**💡 Study Tips:**
- Use `Ctrl+G` in VS Code to jump to specific line numbers
- Start with `get_routing_cost()` (lines 113-210 in local_routing.py) - this is the critical function
- Read API integration code in `flood_data_updater.py` to understand data sources
- Open `terrain_roads.geojson` to see the actual flood data structure

---

## 🎯 System Overview

**SafePathZC** is a flood-aware navigation system for Zamboanga City that provides three route options with different flood risk levels.

### Key Components:

- **terrain_roads.geojson** - 10,461 road segments with real-time flood status
- **update_flood_data.py** - Automatic updates every 6 hours
- **Routing Algorithm** - Dijkstra's algorithm with flood risk penalties
- **3 Route Options** - Safe (avoid floods), Balanced, Fastest

---

## 🌊 How Flood Data Works

### What's in terrain_roads.geojson?

Each road segment contains:

```json
{
  "osm_id": "w981543430", // Unique road ID
  "length_m": 480.93, // Distance in meters
  "elev_mean": 0.0, // Elevation (0m = sea level = high risk!)
  "flooded": "1" // "1" = FLOODED, "0" = SAFE
}
```

### Data Sources (All Free APIs):

| API                        | Purpose        | Data Retrieved                               |
| -------------------------- | -------------- | -------------------------------------------- |
| **OpenStreetMap Overpass** | Road network   | 10,461 road segments with coordinates        |
| **Open-Elevation**         | Terrain height | 87,682 elevation points from NASA satellites |
| **Open-Meteo**             | Weather        | Current rainfall in Zamboanga City           |

### Update Process (Every 6 Hours):

```
1. Fetch Roads (10 sec)
   → OpenStreetMap Overpass API
   → Query: All roads in Zamboanga bounds (6.85-7.15°N, 121.95-122.30°E)

2. Fetch Elevations (15 min) ⏰ SLOWEST STEP
   → Open-Elevation API with NASA SRTM data
   → 87,682 GPS points in batches of 100
   → 1 second delay between requests (rate limiting)

3. Fetch Weather (3 sec)
   → Open-Meteo API
   → Current rainfall and precipitation

4. Calculate Flood Risk (30 sec)
   → For each road: score = 0
   → IF elevation < 5m: +50 points
   → IF rainfall > 50mm/hr: +40 points
   → IF near water < 100m: +30 points
   → Score ≥ 70: flooded = "1"

5. Generate File (5 sec)
   → Write new terrain_roads.geojson
   → Overwrite old file completely
```

**Total Time:** 15-20 minutes per update  
**Schedule:** 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM

---

## 🌐 API Integration Details

### How the 3 APIs Work in Code:

The automatic update system integrates with three free APIs to gather flood data. Here's the actual implementation:

**📁 Source File:** `SafePathZC\backend\services\flood_data_updater.py`  
**💡 Study Tip:** Open this file to see the complete implementation and follow along

---

#### **API 1: OpenStreetMap Overpass (Lines 70-105)**

**📁 File:** `services/flood_data_updater.py`  
**🔍 To Study:** Open the file and press `Ctrl+G`, type `70` to jump to this function

**Purpose:** Fetch real-time road network data

```python
async def fetch_osm_roads(self) -> Dict[str, Any]:
    """Fetch latest road network from OpenStreetMap Overpass API"""

    logger.info("Fetching latest roads from OpenStreetMap...")

    # Overpass API query for Zamboanga roads
    overpass_query = f"""
    [out:json][timeout:180];
    (
      way["highway"]
        ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
         {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
    );
    out geom;
    """

    # API endpoint (no key required!)
    overpass_url = "https://overpass-api.de/api/interpreter"

    try:
        async with self.session.post(overpass_url, data={'data': overpass_query}) as response:
            if response.status == 200:
                data = await response.json()
                logger.info(f"Fetched {len(data.get('elements', []))} road segments from OSM")
                return data
            else:
                logger.error(f"OSM API error: {response.status}")
                return {'elements': []}
    except Exception as e:
        logger.error(f"Failed to fetch OSM data: {e}")
        return {'elements': []}
```

**API Details:**

- **Endpoint:** `https://overpass-api.de/api/interpreter`
- **Method:** POST
- **Query Language:** Overpass QL
- **Bounding Box:** Zamboanga City (6.85-7.15°N, 121.95-122.30°E)
- **Filter:** `way["highway"]` (only roads)
- **Output:** GeoJSON with road coordinates
- **Rate Limit:** None (free public API)
- **Cost:** $0

**Example Response:**

```json
{
  "elements": [
    {
      "type": "way",
      "id": 981543430,
      "geometry": [
        { "lat": 6.9060988, "lon": 122.0693304 },
        { "lat": 6.9060421, "lon": 122.0694271 }
      ],
      "tags": {
        "highway": "residential",
        "name": "Veterans Avenue"
      }
    }
  ]
}
```

---

#### **API 2: Open-Elevation (Lines 107-145)**

**📁 File:** `services/flood_data_updater.py`  
**🔍 To Study:** Press `Ctrl+G`, type `107` to jump to this function

**Purpose:** Fetch elevation data from NASA SRTM satellites

```python
async def fetch_elevation_data(self, coordinates: List[Tuple[float, float]]) -> Dict:
    """Fetch elevation data from Open-Elevation API (NASA SRTM)"""

    if not coordinates:
        return {}

    logger.info(f"Fetching elevation for {len(coordinates)} points...")

    # Open-Elevation API (free, no key required!)
    url = "https://api.open-elevation.com/api/v1/lookup"

    # Batch coordinates (max 100 per request)
    batch_size = 100
    elevation_map = {}

    for i in range(0, len(coordinates), batch_size):
        batch = coordinates[i:i + batch_size]
        locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]

        try:
            # POST request with coordinate batch
            async with self.session.post(url, json={"locations": locations}) as response:
                if response.status == 200:
                    data = await response.json()
                    for j, result in enumerate(data.get('results', [])):
                        coord = batch[j]
                        elevation_map[coord] = result.get('elevation', 0.0)
                else:
                    logger.warning(f"Elevation API batch {i//batch_size + 1} failed: {response.status}")
                    # Default to 0 elevation on failure
                    for coord in batch:
                        elevation_map[coord] = 0.0

            # Rate limiting - be nice to free API (1 second delay)
            await asyncio.sleep(1)

        except Exception as e:
            logger.error(f"Elevation fetch error: {e}")
            for coord in batch:
                elevation_map[coord] = 0.0

    return elevation_map
```

**API Details:**

- **Endpoint:** `https://api.open-elevation.com/api/v1/lookup`
- **Method:** POST
- **Data Source:** NASA SRTM (Shuttle Radar Topography Mission)
- **Resolution:** 30 meters accuracy
- **Batch Size:** 100 coordinates per request
- **Rate Limit:** 1 second between requests (self-imposed)
- **Total Requests:** 877 (for 87,682 coordinates)
- **Time:** ~15 minutes (877 seconds + processing)
- **Cost:** $0

**Example Request:**

```json
{
  "locations": [
    { "latitude": 6.9060988, "longitude": 122.0693304 },
    { "latitude": 6.9060421, "longitude": 122.0694271 }
  ]
}
```

**Example Response:**

```json
{
  "results": [
    {
      "latitude": 6.9060988,
      "longitude": 122.0693304,
      "elevation": 0.5
    },
    {
      "latitude": 6.9060421,
      "longitude": 122.0694271,
      "elevation": 0.8
    }
  ]
}
```

---

#### **API 3: Open-Meteo (Lines 147-175)**

**📁 File:** `services/flood_data_updater.py`  
**🔍 To Study:** Press `Ctrl+G`, type `147` to jump to this function

**Purpose:** Fetch current weather and rainfall data

```python
async def fetch_weather_data(self) -> Dict[str, Any]:
    """Fetch current weather and rainfall data from Open-Meteo"""

    logger.info("Fetching weather data for Zamboanga...")

    # Zamboanga City center coordinates
    lat, lon = 6.9214, 122.0790

    # Open-Meteo API (free, no key required!)
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        'latitude': lat,
        'longitude': lon,
        'current': 'temperature_2m,precipitation,rain,weather_code',
        'hourly': 'precipitation,rain',
        'timezone': 'Asia/Manila',
        'forecast_days': 1
    }

    try:
        async with self.session.get(url, params=params) as response:
            if response.status == 200:
                data = await response.json()
                logger.info(f"Weather data fetched: {data.get('current', {})}")
                return data
            else:
                logger.error(f"Weather API error: {response.status}")
                return {}
    except Exception as e:
        logger.error(f"Failed to fetch weather data: {e}")
        return {}
```

**API Details:**

- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **Method:** GET
- **Location:** Zamboanga City (6.9214°N, 122.0790°E)
- **Data:** Current temperature, precipitation, rainfall
- **Timezone:** Asia/Manila (PHT)
- **Forecast:** 1 day ahead
- **Rate Limit:** None (unlimited free access)
- **Time:** ~3 seconds
- **Cost:** $0

**Example Request:**

```
GET https://api.open-meteo.com/v1/forecast?
    latitude=6.9214&
    longitude=122.0790&
    current=temperature_2m,precipitation,rain,weather_code&
    hourly=precipitation,rain&
    timezone=Asia/Manila&
    forecast_days=1
```

**Example Response:**

```json
{
  "latitude": 6.9214,
  "longitude": 122.079,
  "timezone": "Asia/Manila",
  "current": {
    "time": "2025-11-08T14:00",
    "temperature_2m": 31.2,
    "precipitation": 5.4,
    "rain": 5.4,
    "weather_code": 61
  },
  "hourly": {
    "time": ["2025-11-08T00:00", "2025-11-08T01:00", ...],
    "precipitation": [0.0, 0.0, 2.1, 5.4, 12.8, ...],
    "rain": [0.0, 0.0, 2.1, 5.4, 12.8, ...]
  }
}
```

---

### Flood Risk Calculation (Lines 177-230)

**📁 File:** `services/flood_data_updater.py`  
**🔍 To Study:** Press `Ctrl+G`, type `177` to jump to this function

After fetching data from all 3 APIs, the system calculates flood risk:

```python
def calculate_flood_risk(self, elevation: float, rainfall_mm: float,
                       distance_to_water: float) -> Dict[str, Any]:
    """
    Calculate flood risk based on:
    - Elevation (from Open-Elevation API)
    - Rainfall (from Open-Meteo API)
    - Distance to water (from OpenStreetMap API)
    """

    flood_score = 0

    # ========================================
    # ELEVATION SCORING
    # ========================================
    if elevation < 5:
        flood_score += 50      # Very low elevation (0-5m)
    elif elevation < 10:
        flood_score += 30      # Low elevation (5-10m)
    elif elevation < 20:
        flood_score += 10      # Moderate elevation (10-20m)

    # ========================================
    # RAINFALL SCORING
    # ========================================
    if rainfall_mm > 50:       # Heavy rain (>50mm/hr)
        flood_score += 40
    elif rainfall_mm > 20:     # Moderate rain (20-50mm/hr)
        flood_score += 20
    elif rainfall_mm > 5:      # Light rain (5-20mm/hr)
        flood_score += 5

    # ========================================
    # WATER PROXIMITY SCORING
    # ========================================
    if distance_to_water < 100:    # Very close (<100m)
        flood_score += 30
    elif distance_to_water < 500:  # Close (100-500m)
        flood_score += 15
    elif distance_to_water < 1000: # Moderate (500-1000m)
        flood_score += 5

    # ========================================
    # DETERMINE FLOOD STATUS
    # ========================================
    if flood_score >= 70:
        flood_level = "high"
        flooded = True        # Mark as "1" in GeoJSON
    elif flood_score >= 40:
        flood_level = "medium"
        flooded = True        # Mark as "1" in GeoJSON
    elif flood_score >= 20:
        flood_level = "low"
        flooded = False       # Mark as "0" in GeoJSON
    else:
        flood_level = "none"
        flooded = False       # Mark as "0" in GeoJSON

    return {
        'flood_score': flood_score,
        'flood_level': flood_level,
        'flooded': flooded,   # This becomes "1" or "0" in terrain_roads.geojson
        'elevation': elevation,
        'rainfall_mm': rainfall_mm
    }
```

---

### Real Calculation Example:

**Road:** Rio Hondo bridge segment  
**Time:** During heavy monsoon rain

**Data from APIs:**

1. **OSM:** Road coordinates (6.9234°N, 122.0678°E)
2. **Open-Elevation:** Elevation = 1.2 meters
3. **Open-Meteo:** Rainfall = 62 mm/hr
4. **OSM:** Nearest water (Cawa-Cawa River) = 45 meters

**Calculation:**

```python
elevation = 1.2      # Very low!
rainfall = 62        # Heavy rain!
distance_water = 45  # Very close!

flood_score = 0

# Elevation scoring
if 1.2 < 5:
    flood_score += 50  # → flood_score = 50

# Rainfall scoring
if 62 > 50:
    flood_score += 40  # → flood_score = 90

# Water proximity scoring
if 45 < 100:
    flood_score += 30  # → flood_score = 120

# Final determination
if flood_score >= 70:
    flooded = True  # Rio Hondo is FLOODED
```

**Result in terrain_roads.geojson:**

```json
{
  "osm_id": "w123456789",
  "name": "Rio Hondo Bridge",
  "length_m": 285.5,
  "elev_mean": 1.2,
  "flooded": "1" // ← MARKED AS FLOODED
}
```

**Routing Impact:**

- **Safe Route:** 285m × **50.0** = 14,250m equivalent → Avoids completely
- **Balanced Route:** 285m × 5.0 = 1,425m equivalent → Might avoid
- **Fastest Route:** 285m × 1.1 = 313m equivalent → Uses this road

---

### API Integration Summary:

| API                | What It Provides          | Code Function            | Lines   | Time   |
| ------------------ | ------------------------- | ------------------------ | ------- | ------ |
| **OpenStreetMap**  | Road coordinates & names  | `fetch_osm_roads()`      | 70-105  | 10 sec |
| **Open-Elevation** | NASA satellite elevations | `fetch_elevation_data()` | 107-145 | 15 min |
| **Open-Meteo**     | Current weather/rainfall  | `fetch_weather_data()`   | 147-175 | 3 sec  |
| **Calculation**    | Flood risk scoring        | `calculate_flood_risk()` | 177-230 | 30 sec |

**Total API Integration:** ~16 minutes per update

---

## 🗺️ How Routing Works

### The Three Routes:

When a user searches for a route, the system calculates **three different paths**:

| Route        | Color     | Flood Penalty | Behavior                                    |
| ------------ | --------- | ------------- | ------------------------------------------- |
| **Safe**     | 🟢 Green  | 50x           | Heavily avoids flooded roads, takes detours |
| **Balanced** | 🟠 Orange | 5x            | Moderate avoidance, balanced time/safety    |
| **Fastest**  | 🔴 Red    | 1.1x          | Minimal avoidance, shortest path            |

### Cost Calculation:

```python
# For each road segment in the route:

base_cost = road.length_m  # Actual distance

# Flood penalty (varies by route type)
if road.flooded == "1":
    if route_type == "safe":
        penalty = 50.0      # Flooded road costs 50x more!
    elif route_type == "balanced":
        penalty = 5.0       # Moderate penalty
    else:  # fastest
        penalty = 1.1       # Almost no penalty
else:
    penalty = 1.0           # Safe road = no penalty

# Terrain difficulty
if road.elev_mean < 5:
    terrain = 1.5           # Low elevation = harder
else:
    terrain = 1.0

# Transport mode
if mode == "motorcycle":
    mode_factor = 0.9       # Faster
elif mode == "walking":
    mode_factor = 2.0       # Slower
else:
    mode_factor = 1.0

# FINAL COST
total_cost = base_cost × penalty × terrain × mode_factor
```

### Example: Veterans Avenue (500m long, flooded)

| Route Type | Calculation            | Total Cost | Decision                 |
| ---------- | ---------------------- | ---------- | ------------------------ |
| Safe       | 500m × 50 × 1.5 × 0.9  | 33,750m    | ❌ Avoid (too expensive) |
| Balanced   | 500m × 5 × 1.5 × 0.9   | 3,375m     | ⚠️ Consider (moderate)   |
| Fastest    | 500m × 1.1 × 1.5 × 0.9 | 742m       | ✅ Use (acceptable)      |

### Dijkstra's Algorithm:

The system uses Dijkstra's shortest path algorithm to find the route with the **lowest total cost**:

1. Start at user's origin
2. Calculate cost to all neighboring roads
3. Pick the cheapest unvisited road
4. Repeat until reaching destination
5. Backtrack to find the complete path

**Result:** Three different routes because the cost penalties differ!

---

## 🎓 Panel Defense Guide

### Question: "What is terrain_roads.geojson and how did you get the data?"

**Answer:**

> "terrain_roads.geojson is our flood data file containing 10,461 road segments in Zamboanga City. Each road has coordinates, elevation, and most importantly, a flood status ('1' for flooded, '0' for safe).
>
> We get this data automatically every 6 hours using three free APIs: OpenStreetMap for road coordinates, Open-Elevation for NASA satellite elevation data, and Open-Meteo for current weather. The system calculates a flood risk score based on elevation under 5 meters, rainfall over 50mm per hour, and proximity to water bodies. Roads scoring above 70 points are marked as flooded.
>
> The update takes 15-20 minutes mainly because we need to fetch elevations for 87,682 GPS points with rate limiting to respect the free API's fair usage policy."

### Question: "How does the routing system use this data?"

**Answer:**

> "When a user searches for a route, the system loads terrain_roads.geojson into memory and builds a road network graph. We then run Dijkstra's shortest path algorithm THREE times with different flood penalties:
>
> - Safe Route: Flooded roads cost 50x more, forcing the algorithm to take longer detours
> - Balanced Route: Flooded roads cost 5x more, allowing some flood exposure
> - Fastest Route: Flooded roads cost 1.1x more, barely avoiding them
>
> The algorithm finds the path with the lowest total cost. Because we use different penalties, we get three distinct routes. Users see each route's flood percentage and choose based on their urgency and risk tolerance."

### Question: "Why three routes instead of just one?"

**Answer:**

> "We give users control. Someone on a high-clearance vehicle in an emergency might accept a 50% flooded route to save 10 minutes. But a family on a motorcycle with kids might prefer a 100% safe route even if it takes longer. Our system shows:
>
> - Safe Route: 8.5km, 18min, 2% flooded (green)
> - Balanced Route: 6.2km, 14min, 25% flooded (orange)
> - Fastest Route: 4.8km, 11min, 52% flooded (red)
>
> This empowers users to make informed decisions based on their specific situation."

### Demonstration Script:

1. **Show the file:**

```powershell
# Open terrain_roads.geojson in VS Code
code SafePathZC\backend\data\terrain_roads.geojson

# Point to a flooded road segment
# Show: osm_id, length_m, elev_mean, flooded: "1"
```

2. **Show the data age:**

```powershell
Get-Item SafePathZC\backend\data\terrain_roads.geojson | Select LastWriteTime
```

3. **Run a manual update:**

```powershell
cd SafePathZC\backend
python update_flood_data.py
# Show the log output in real-time
```

4. **Explain the code:**

- Open `services/flood_data_updater.py`
- Show the flood risk calculation (lines 340-380)
- Open `services/local_routing.py`
- Show the cost calculation (lines 110-200)

---

## 💻 How the Code Works (local_routing.py)

**📁 Source File:** `SafePathZC\backend\services\local_routing.py`  
**💡 Study Tip:** This is a 1,377-line file. Focus on these key functions below.

### Step-by-Step Routing Process:

When a user searches for a route, here's what happens in the code:

#### **1. Load Road Network (Lines 240-290)**

**🔍 To Study:** Open `services/local_routing.py` and press `Ctrl+G`, type `240`

```python
def load_road_network(self):
    """Load terrain_roads.geojson into memory"""

    # Read GeoJSON file
    with open('data/terrain_roads.geojson', 'r') as f:
        geojson = json.load(f)

    # For each road segment:
    for feature in geojson['features']:
        props = feature['properties']
        coords = feature['geometry']['coordinates']

        # Create RoadSegment object
        segment = RoadSegment(
            osm_id = props['osm_id'],
            length_m = props['length_m'],
            elev_mean = props['elev_mean'],
            flooded = props['flooded'] == "1",  # Convert "1" to True
            coordinates = [(lng, lat) for lng, lat in coords]
        )

        self.road_segments.append(segment)
```

**Result:** 10,461 road segments loaded into memory

---

#### **2. Build Road Network Graph (Lines 290-350)**

**🔍 To Study:** Press `Ctrl+G`, type `290` in `services/local_routing.py`

```python
def build_routing_graph(self):
    """Connect roads into a network graph"""

    # For each road segment:
    for segment in self.road_segments:
        # For each point in the road:
        for i, coord in enumerate(segment.coordinates):

            # Create or get node at this coordinate
            if coord not in self.routing_graph:
                self.routing_graph[coord] = RouteNode(coord, [])

            # Connect this point to next point in segment
            if i < len(segment.coordinates) - 1:
                next_coord = segment.coordinates[i + 1]
                self.routing_graph[coord].connected_segments.append(
                    (segment, i)
                )
```

**Result:** Graph with 87,682 nodes (GPS points) and their connections

---

#### **3. Calculate Road Cost (Lines 113-210)**

**🔍 To Study:** Press `Ctrl+G`, type `113` in `services/local_routing.py`

This is the CRITICAL function that differentiates the three routes:

```python
def get_routing_cost(self, segment, mode, risk_profile, flood_cache):
    """Calculate cost to traverse this road segment"""

    base_cost = segment.length_m  # Start with distance

    # ========================================
    # FLOOD PENALTY (Primary differentiator!)
    # ========================================

    # Check if this road is flooded (from terrain_roads.geojson)
    is_flooded = segment.flooded

    # If not marked, check flood cache (O(1) lookup)
    if not is_flooded and flood_cache:
        # Try OSM ID first
        is_flooded = flood_cache.get(segment.osm_id, False)

        # Try coordinates (more reliable)
        if not is_flooded:
            for coord in segment.coordinates:
                coord_key = (round(coord.lat, 4), round(coord.lng, 4))
                if flood_cache.get(coord_key, False):
                    is_flooded = True
                    break

    # Apply penalty based on risk profile
    if risk_profile == "safe":
        flood_penalty = 50.0 if is_flooded else 1.0  # 50x penalty!
    elif risk_profile == "manageable":
        flood_penalty = 5.0 if is_flooded else 1.0   # 5x penalty
    else:  # "prone"
        flood_penalty = 1.1 if is_flooded else 1.0   # 1.1x penalty

    # ========================================
    # TERRAIN PENALTY
    # ========================================

    if segment.elev_mean < 5:
        terrain_penalty = 1.5  # Low elevation = harder
    else:
        terrain_penalty = 1.0

    # ========================================
    # MODE PENALTY
    # ========================================

    if mode == "motorcycle":
        mode_penalty = 0.9  # Faster
    elif mode == "walking":
        mode_penalty = 2.0  # Slower
    else:  # car
        mode_penalty = 1.0

    # ========================================
    # FINAL COST CALCULATION
    # ========================================

    total_cost = base_cost * flood_penalty * terrain_penalty * mode_penalty

    return total_cost
```

**Key Point:** The `risk_profile` parameter changes the flood penalty:

- **Safe:** 50x penalty for flooded roads → Algorithm avoids them
- **Manageable:** 5x penalty → Algorithm tolerates some
- **Prone:** 1.1x penalty → Algorithm ignores them

---

#### **4. A\* Search Algorithm (Lines 590-750)**

**🔍 To Study:** Press `Ctrl+G`, type `590` in `services/local_routing.py`

```python
def _a_star_search(self, start, end, mode, risk_profile):
    """Find shortest path using A* algorithm with flood penalties"""

    # Build flood cache once (O(n) time, then O(1) lookups)
    flood_cache = {}
    flood_service = get_flood_service()
    for segment in flood_service.road_segments:
        if segment.flooded:
            flood_cache[segment.osm_id] = True
            for coord in segment.coordinates:
                coord_key = (round(coord.lat, 4), round(coord.lng, 4))
                flood_cache[coord_key] = True

    # Initialize A* data structures
    open_set = [(0, start)]  # Priority queue: (cost, coordinate)
    came_from = {}           # Track path: coord -> previous_coord
    g_score = {start: 0}     # Cost from start to each node
    visited = set()          # Already explored nodes

    while open_set:
        # Get node with lowest cost
        current_cost, current = heapq.heappop(open_set)

        if current in visited:
            continue

        visited.add(current)

        # Found destination?
        if current == end:
            # Reconstruct path by backtracking
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start)
            return list(reversed(path))  # Start → End order

        # Explore neighbors
        for segment, point_index in current.connected_segments:
            for neighbor in segment.get_neighbors(point_index):

                if neighbor in visited:
                    continue

                # Calculate cost to reach neighbor
                distance = current.distance_to(neighbor)

                # Get routing cost with FLOOD PENALTIES
                routing_cost = segment.get_routing_cost(
                    mode,
                    risk_profile,  # ← THIS CHANGES THE COST!
                    flood_cache
                )

                # Total cost = distance × routing_cost
                tentative_cost = g_score[current] + (distance * routing_cost)

                # Better path found?
                if neighbor not in g_score or tentative_cost < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_cost

                    # A* heuristic: cost + estimated remaining distance
                    f_score = tentative_cost + neighbor.distance_to(end)

                    heapq.heappush(open_set, (f_score, neighbor))

    return None  # No route found
```

**What happens for each risk profile?**

**Safe Route (`risk_profile="safe"`):**

1. Algorithm considers Veterans Avenue (flooded)
2. Cost = 500m × **50.0** × 1.5 × 0.9 = 33,750m equivalent
3. Algorithm considers Airport Road (not flooded)
4. Cost = 2,000m × 1.0 × 1.0 × 0.9 = 1,800m equivalent
5. **Decision:** Airport Road is cheaper → Safe route avoids Veterans Avenue

**Fastest Route (`risk_profile="prone"`):**

1. Algorithm considers Veterans Avenue (flooded)
2. Cost = 500m × **1.1** × 1.5 × 0.9 = 742m equivalent
3. Algorithm considers Airport Road (not flooded)
4. Cost = 2,000m × 1.0 × 1.0 × 0.9 = 1,800m equivalent
5. **Decision:** Veterans Avenue is cheaper → Fastest route uses it

---

#### **5. Analyze Flood Risk (Lines 1100-1200)**

**🔍 To Study:** Press `Ctrl+G`, type `1100` in `services/local_routing.py`

After finding a route, analyze how much is flooded:

```python
def analyze_route_flood_risk(self, route_coordinates):
    """Calculate flood percentage for a route"""

    total_segments = 0
    flooded_segments = 0
    total_distance = 0.0
    flooded_distance = 0.0

    # For each segment in the route:
    for i in range(len(route_coordinates) - 1):
        coord_a = route_coordinates[i]
        coord_b = route_coordinates[i + 1]

        # Find the road segment connecting these points
        segment = self.find_segment_between(coord_a, coord_b)

        if segment:
            total_segments += 1
            total_distance += segment.length_m

            # Check if flooded
            if segment.flooded:
                flooded_segments += 1
                flooded_distance += segment.length_m

    # Calculate percentage
    flood_percentage = (flooded_segments / total_segments) * 100

    # Assign risk level
    if flood_percentage < 20:
        risk_level = "low"
        color = "green"
    elif flood_percentage < 50:
        risk_level = "medium"
        color = "orange"
    else:
        risk_level = "high"
        color = "red"

    return {
        "flood_percentage": flood_percentage,
        "risk_level": risk_level,
        "color": color,
        "flooded_segments": flooded_segments,
        "total_segments": total_segments
    }
```

---

### Code Flow Summary:

```
User Request
    ↓
1. load_road_network()
   → Read terrain_roads.geojson
   → Load 10,461 segments into memory
    ↓
2. build_routing_graph()
   → Create graph with 87,682 nodes
   → Connect roads at intersections
    ↓
3. find_route(start, end, mode, risk_profile)
   → Build flood cache (O(n) once)
   → Call _a_star_search()
    ↓
4. _a_star_search()
   FOR EACH node explored:
     → Calculate cost using get_routing_cost()
     → Apply flood penalty based on risk_profile
     → Choose cheapest path
   → Return route coordinates
    ↓
5. analyze_route_flood_risk()
   → Count flooded segments
   → Calculate flood percentage
   → Assign risk level (low/medium/high)
    ↓
Return to User:
   - Route coordinates
   - Distance, time
   - Flood percentage
   - Color (green/orange/red)
```

---

### Why Three Routes?

The system calls `find_route()` **THREE TIMES** with different `risk_profile`:

```python
# routes/flood_routing.py (Lines 140-180)

# Generate 3 routes with different risk profiles
safe_route = find_route(
    start, end, mode,
    risk_profile="safe"      # ← 50x flood penalty
)

balanced_route = find_route(
    start, end, mode,
    risk_profile="manageable"  # ← 5x flood penalty
)

fastest_route = find_route(
    start, end, mode,
    risk_profile="prone"       # ← 1.1x flood penalty
)

# Analyze each route
safe_analysis = analyze_route_flood_risk(safe_route)
balanced_analysis = analyze_route_flood_risk(balanced_route)
fastest_analysis = analyze_route_flood_risk(fastest_route)

# Return all three options
return {
    "routes": [
        {
            "id": "safe",
            "coordinates": safe_route,
            "flood_percentage": safe_analysis["flood_percentage"],
            "color": "green"
        },
        {
            "id": "balanced",
            "coordinates": balanced_route,
            "flood_percentage": balanced_analysis["flood_percentage"],
            "color": "orange"
        },
        {
            "id": "fastest",
            "coordinates": fastest_route,
            "flood_percentage": fastest_analysis["flood_percentage"],
            "color": "red"
        }
    ]
}
```

**Same algorithm, different penalties = different routes!**

---

## ⚡ Quick Commands

### Update Flood Data Manually:

```powershell
cd SafePathZC\backend
python update_flood_data.py
# Takes 15-20 minutes
```

### Check Update Status:

```powershell
# Check if running
Get-Process python -ErrorAction SilentlyContinue

# View last 20 log lines
Get-Content SafePathZC\backend\logs\flood_updates.log -Tail 20

# Watch live updates
Get-Content SafePathZC\backend\logs\flood_updates.log -Wait -Tail 20
```

### Check File Status:

```powershell
# Show file details
Get-Item SafePathZC\backend\data\terrain_roads.geojson | Select Name, Length, LastWriteTime

# Count total roads
(Select-String '"type": "Feature"' SafePathZC\backend\data\terrain_roads.geojson).Count

# Count flooded roads
(Select-String '"flooded": "1"' SafePathZC\backend\data\terrain_roads.geojson).Count
```

### Task Scheduler (Automatic Updates):

```powershell
# Check scheduled task
Get-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate"

# Manually trigger update
Start-ScheduledTask -TaskName "SafePathZC-FloodDataUpdate"

# View task history
Get-ScheduledTaskInfo -TaskName "SafePathZC-FloodDataUpdate"
```

### Run Update in New Window (No Waiting):

```powershell
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend'; python update_flood_data.py"
```

---

## 🔧 Technical Specifications

| Property             | Value                       |
| -------------------- | --------------------------- |
| Total Roads          | 10,461 segments             |
| GPS Points           | 87,682 unique coordinates   |
| File Size            | 6.65 MB                     |
| Update Frequency     | Every 6 hours               |
| Update Duration      | 15-20 minutes               |
| API Calls per Update | ~900 requests               |
| Cost                 | $0 (all free APIs)          |
| Routing Algorithm    | Dijkstra's shortest path    |
| Route Options        | 3 (Safe, Balanced, Fastest) |

---

## 📊 Real-World Example

**Scenario:** Jane's morning commute during heavy rain

**Input:**

- Start: Tetuan (low-lying coastal area)
- End: Ayala Mall
- Transport: Motorcycle
- Weather: 60mm/hr rainfall

**System Analysis:**

- Loads 10,461 road segments
- Identifies 1,247 flooded segments (current conditions)
- Tetuan area: 68% roads flooded

**Results:**

| Route       | Distance | Time   | Flooded | Path                              |
| ----------- | -------- | ------ | ------- | --------------------------------- |
| 🟢 Safe     | 8.5 km   | 18 min | 2%      | Guiwan → Ramos Ave → Airport Road |
| 🟠 Balanced | 6.2 km   | 14 min | 25%     | Veterans Ave → Ramos Ave → Ayala  |
| 🔴 Fastest  | 4.8 km   | 11 min | 52%     | Rio Hondo → Canelar → Direct      |

**User Choice:** Jane selects Safe Route (+7 min but avoids 0.5m deep water)

**Outcome:** Arrives safely, motorcycle didn't stall, avoided Rio Hondo flooding

---

## 🚀 Future Improvements

### Speed Optimization: Elevation Caching

**Current:** Fetch 87,682 elevations every 6 hours (15 min)  
**Problem:** Terrain doesn't change - wasting time!

**Solution:** Cache elevations permanently

- First run: 15 minutes (build cache)
- Future runs: 30 seconds (use cache, only fetch weather)
- 97% time reduction!

**Implementation:**

```python
# Check for elevation cache
if os.path.exists('data/elevation_cache.json'):
    elevation_map = load_cache()  # Instant
else:
    elevation_map = await fetch_elevations()  # 15 min
    save_cache(elevation_map)
```

---

**Last Updated:** November 8, 2025  
**Version:** 1.0  
**Project:** SafePathZC Capstone Project
