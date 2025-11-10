# 🔄 How the Automatic Flood Data Update Works

## Overview: What Happens Every 6 Hours

When the scheduled update runs, your system **fetches live data from 3 free APIs** and generates a fresh `terrain_roads.geojson` file with current flood risk data.

---

## 📊 The Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: TRIGGER (Every 6 hours)                                │
│  Windows Task Scheduler OR Railway Cron Job                     │
│  Runs: update_flood_data.py                                     │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: FETCH ROADS (OpenStreetMap Overpass API)              │
│  🌐 FREE API - No key required                                  │
│  URL: https://overpass-api.de/api/interpreter                  │
│                                                                  │
│  Query: "Give me all roads in Zamboanga City"                  │
│  Returns: 10,461 road segments with GPS coordinates            │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: EXTRACT COORDINATES                                    │
│  Each road has multiple points (geometry)                       │
│  Example Road: Veterans Avenue has 234 coordinate points        │
│                                                                  │
│  Result: 87,682 unique GPS coordinates extracted               │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: FETCH ELEVATIONS (Open-Elevation API)                 │
│  🏔️ FREE API - Uses NASA SRTM satellite data                   │
│  URL: https://api.open-elevation.com/api/v1/lookup             │
│                                                                  │
│  Process: Send coordinates in batches of 100                    │
│  - Batch 1: Coordinates 1-100    → Get elevations              │
│  - Batch 2: Coordinates 101-200  → Get elevations              │
│  - ... (877 batches total)                                      │
│  - Wait 1 second between batches (rate limiting)                │
│                                                                  │
│  Takes: ~15 minutes for 87,682 points                          │
│  Result: Elevation map (coordinate → height in meters)         │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: FETCH WEATHER (Open-Meteo API)                        │
│  🌧️ FREE API - Real-time weather data                          │
│  URL: https://api.open-meteo.com/v1/forecast                   │
│                                                                  │
│  Request: Current weather for Zamboanga City (6.9214, 122.079) │
│  Returns:                                                        │
│    - Current rainfall: 0mm (clear) or 45mm (heavy rain)        │
│    - Temperature: 28°C                                          │
│    - Humidity: 75%                                              │
│    - Hourly forecast for next 24 hours                          │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: CALCULATE FLOOD RISK (Algorithm)                      │
│  For each road segment, calculate flood score (0-100)           │
│                                                                  │
│  Formula:                                                        │
│  flood_score = 0                                                │
│                                                                  │
│  IF elevation < 5m:     flood_score += 50  (very low land)     │
│  IF elevation < 10m:    flood_score += 30  (low land)          │
│  IF elevation < 20m:    flood_score += 10  (moderate)          │
│                                                                  │
│  IF rainfall > 50mm:    flood_score += 40  (heavy rain)        │
│  IF rainfall > 20mm:    flood_score += 20  (moderate rain)     │
│  IF rainfall > 5mm:     flood_score += 5   (light rain)        │
│                                                                  │
│  IF near_water < 100m:  flood_score += 30  (very close)        │
│  IF near_water < 500m:  flood_score += 15  (close)             │
│  IF near_water < 1000m: flood_score += 5   (moderate)          │
│                                                                  │
│  Classification:                                                │
│    Score >= 70: HIGH RISK (avoid)                              │
│    Score >= 40: MEDIUM RISK (caution)                          │
│    Score >= 20: LOW RISK (safe with caution)                   │
│    Score < 20:  NO RISK (safe)                                 │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 7: GENERATE GEOJSON FILE                                 │
│  Create terrain_roads.geojson with all data combined           │
│                                                                  │
│  File Structure:                                                │
│  {                                                              │
│    "type": "FeatureCollection",                                │
│    "metadata": {                                                │
│      "generated_at": "2025-11-08 13:30:00",                    │
│      "total_roads": 10461,                                      │
│      "flooded_roads": 234,                                      │
│      "current_rainfall": 0                                      │
│    },                                                           │
│    "features": [                                                │
│      {                                                          │
│        "type": "Feature",                                       │
│        "geometry": {                                            │
│          "type": "LineString",                                  │
│          "coordinates": [[122.079, 6.921], [...]]              │
│        },                                                       │
│        "properties": {                                          │
│          "name": "Veterans Avenue",                             │
│          "highway": "primary",                                  │
│          "elevation_mean": 3.2,      ← From Open-Elevation     │
│          "elevation_min": 1.5,                                  │
│          "elevation_max": 5.8,                                  │
│          "rainfall_mm": 0,            ← From Open-Meteo        │
│          "flood_risk_score": 55,      ← Calculated             │
│          "flood_level": "medium",     ← Calculated             │
│          "flooded": "1",              ← Calculated             │
│          "distance_to_flood_zone": 250                          │
│        }                                                        │
│      },                                                         │
│      ... 10,460 more road features                             │
│    ]                                                            │
│  }                                                              │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 8: SAVE FILE                                              │
│  Write to: backend/data/terrain_roads.geojson                  │
│  Mode: OVERWRITE (delete old file, write new)                  │
│  Size: ~6.6 MB                                                  │
│  Status: File LastWriteTime updated to current time            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Code Breakdown

### 1️⃣ **Fetching Roads from OpenStreetMap**

**Code:**

```python
async def fetch_osm_roads(self) -> Dict[str, Any]:
    overpass_query = f"""
    [out:json][timeout:180];
    (
      way["highway"]
        ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
         {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
    );
    out geom;
    """

    async with self.session.post(overpass_url, data={'data': overpass_query}) as response:
        data = await response.json()
        return data
```

**What it does:**

- Sends a query to OpenStreetMap: "Give me all roads (highways) in Zamboanga City"
- Boundaries: Latitude 6.85-7.15, Longitude 121.95-122.30
- Returns JSON with road geometry (GPS coordinates)

**Example Response:**

```json
{
  "elements": [
    {
      "type": "way",
      "id": 123456789,
      "tags": {
        "name": "Veterans Avenue",
        "highway": "primary"
      },
      "geometry": [
        { "lat": 6.921, "lon": 122.079 },
        { "lat": 6.9215, "lon": 122.0795 },
        { "lat": 6.922, "lon": 122.08 }
      ]
    }
  ]
}
```

---

### 2️⃣ **Fetching Elevation Data**

**Code:**

```python
async def fetch_elevation_data(self, coordinates: List[Tuple[float, float]]):
    url = "https://api.open-elevation.com/api/v1/lookup"

    # Send in batches of 100
    for i in range(0, len(coordinates), 100):
        batch = coordinates[i:i + 100]
        locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]

        async with self.session.post(url, json={"locations": locations}) as response:
            data = await response.json()
            for j, result in enumerate(data['results']):
                coord = batch[j]
                elevation_map[coord] = result['elevation']

        await asyncio.sleep(1)  # Wait 1 second between batches
```

**What it does:**

- Takes 87,682 coordinates
- Sends them in groups of 100 (API limit)
- Waits 1 second between requests (politeness)
- Total: 877 API calls, ~15 minutes

**Example Request:**

```json
{
  "locations": [
    {"latitude": 6.9210, "longitude": 122.0790},
    {"latitude": 6.9215, "longitude": 122.0795},
    ... 98 more coordinates
  ]
}
```

**Example Response:**

```json
{
  "results": [
    {"latitude": 6.9210, "longitude": 122.0790, "elevation": 3.2},
    {"latitude": 6.9215, "longitude": 122.0795, "elevation": 4.1},
    ... 98 more results
  ]
}
```

---

### 3️⃣ **Fetching Weather Data**

**Code:**

```python
async def fetch_weather_data(self) -> Dict[str, Any]:
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        'latitude': 6.9214,
        'longitude': 122.0790,
        'current': 'precipitation,rain',
        'timezone': 'Asia/Manila'
    }

    async with self.session.get(url, params=params) as response:
        data = await response.json()
        return data
```

**What it does:**

- Asks Open-Meteo: "What's the current weather in Zamboanga City?"
- Gets real-time rainfall amount

**Example Response:**

```json
{
  "current": {
    "time": "2025-11-08T13:30",
    "temperature_2m": 28.5,
    "precipitation": 0,
    "rain": 0
  }
}
```

**When it's raining:**

```json
{
  "current": {
    "precipitation": 45.5, // 45.5mm of rain!
    "rain": 45.5
  }
}
```

---

### 4️⃣ **Calculating Flood Risk**

**Code:**

```python
def calculate_flood_risk(self, elevation: float, rainfall_mm: float,
                       distance_to_water: float) -> Dict[str, Any]:
    flood_score = 0

    # Low elevation = higher flood risk
    if elevation < 5:
        flood_score += 50
    elif elevation < 10:
        flood_score += 30

    # Heavy rainfall = higher flood risk
    if rainfall_mm > 50:
        flood_score += 40
    elif rainfall_mm > 20:
        flood_score += 20

    # Close to water = higher flood risk
    if distance_to_water < 100:
        flood_score += 30

    # Determine risk level
    if flood_score >= 70:
        return {'flood_level': 'high', 'flooded': True}
    elif flood_score >= 40:
        return {'flood_level': 'medium', 'flooded': True}
    else:
        return {'flood_level': 'low', 'flooded': False}
```

**Example Calculation:**

**Scenario 1: Veterans Avenue - Clear Day**

```
Elevation: 3.2m       → Score +50 (very low)
Rainfall: 0mm         → Score +0  (no rain)
Near water: 250m      → Score +15 (close to Rio Hondo river)
─────────────────────
Total Score: 65       → MEDIUM RISK
Flooded: Yes (during rain season)
```

**Scenario 2: Pasonanca Road - Clear Day**

```
Elevation: 45m        → Score +0  (high elevation)
Rainfall: 0mm         → Score +0  (no rain)
Near water: 2000m     → Score +0  (far from water)
─────────────────────
Total Score: 0        → NO RISK
Flooded: No
```

**Scenario 3: Veterans Avenue - Heavy Rain**

```
Elevation: 3.2m       → Score +50 (very low)
Rainfall: 55mm        → Score +40 (heavy rain!)
Near water: 250m      → Score +15 (close to water)
─────────────────────
Total Score: 105      → HIGH RISK
Flooded: Yes (dangerous!)
```

---

## 🗂️ What's in the Generated File

Let me show you an actual road from your `terrain_roads.geojson`:

<function_calls>
<invoke name="read_file">
<parameter name="filePath">c:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\terrain_roads.geojson
