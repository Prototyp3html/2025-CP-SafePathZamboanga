# Panel Defense - Quick Reference Card

## 🎯 ONE-PAGE SUMMARY FOR DEMONSTRATION

---

## 📚 KEY FILES TO STUDY

| What                  | File                             | Key Lines | What It Does                                     |
| --------------------- | -------------------------------- | --------- | ------------------------------------------------ |
| **API Integration**   | `services/flood_data_updater.py` | 70-230    | Fetches data from 3 APIs & calculates flood risk |
| **Routing Algorithm** | `services/local_routing.py`      | 113-750   | A\* pathfinding with flood penalties             |
| **Route Generation**  | `routes/flood_routing.py`        | 140-180   | Generates 3 routes with different penalties      |
| **Flood Data**        | `data/terrain_roads.geojson`     | —         | 10,461 roads with flood status                   |

**💡 Study Tip:** Open files and use `Ctrl+G` to jump to specific line numbers

---

## SYSTEM OVERVIEW

**SafePathZC** = Flood-aware navigation for Zamboanga City

- **10,461 roads** with real-time flood status
- **3 route options:** Safe (avoid floods), Balanced, Fastest
- **Updates:** Every 6 hours (12am, 6am, 12pm, 6pm)
- **Cost:** $0 (all free APIs)

---

## KEY FILE: terrain_roads.geojson

```json
{
  "osm_id": "w981543430",
  "length_m": 480.93,
  "elev_mean": 0.0, // 0m = sea level = high risk!
  "flooded": "1" // "1" = FLOODED, "0" = SAFE ⚠️
}
```

---

## DATA SOURCES (3 Free APIs)

| API            | Data              | Time      |
| -------------- | ----------------- | --------- |
| OpenStreetMap  | 10,461 roads      | 10 sec    |
| Open-Elevation | 87,682 elevations | 15 min ⏰ |
| Open-Meteo     | Current rainfall  | 3 sec     |

**Total Update Time:** 15-20 minutes  
**Why slow?** 877 API calls with 1-second delays (rate limiting)

---

## FLOOD RISK CALCULATION

```
For each road:
  score = 0
  IF elevation < 5m:      score += 50
  IF rainfall > 50mm/hr:  score += 40
  IF near water < 100m:   score += 30

  IF score >= 70: flooded = "1"
```

**Example:** Rio Hondo during rain

- Elevation: 1.2m → +50 points
- Rainfall: 60mm/hr → +40 points
- Near river: 50m → +30 points
- **Total: 120 = FLOODED**

---

## 🌐 API INTEGRATION CODE

**📁 Source File:** `SafePathZC\backend\services\flood_data_updater.py`  
**💡 To Demonstrate:** Open this file during panel defense to show the API code

### Where the 3 APIs Are Called (flood_data_updater.py)

#### **1. OpenStreetMap Overpass API (Lines 70-105)**

**🔍 To Study:** Press `Ctrl+G`, type `70` to jump to this code

```python
overpass_query = """
  [out:json][timeout:180];
  (way["highway"](6.85,121.95,7.15,122.30););
  out geom;
"""
async with session.post("https://overpass-api.de/api/interpreter",
                        data={'data': overpass_query}) as response:
    road_data = await response.json()
    # Returns 10,461 road segments with coordinates
```

- **Time:** 10 seconds
- **No API key needed!**

#### **2. Open-Elevation API (Lines 107-145)**

**🔍 To Study:** Press `Ctrl+G`, type `107` to jump to this code

```python
url = "https://api.open-elevation.com/api/v1/lookup"
batch_size = 100  # Process 100 coordinates at a time

for i in range(0, len(coordinates), batch_size):
    batch = coordinates[i:i+100]
    locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]

    async with session.post(url, json={"locations": locations}) as response:
        elevation_data = await response.json()

    await asyncio.sleep(1)  # Rate limiting - be nice to free API!
```

- **Time:** 15 minutes (877 batches × 1 second delay)
- **No API key needed!**

#### **3. Open-Meteo Weather API (Lines 147-175)**

**🔍 To Study:** Press `Ctrl+G`, type `147` to jump to this code

```python
url = "https://api.open-meteo.com/v1/forecast"
params = {
    'latitude': 6.9214,    # Zamboanga City
    'longitude': 122.0790,
    'current': 'temperature_2m,precipitation,rain,weather_code',
    'timezone': 'Asia/Manila'
}

async with session.get(url, params=params) as response:
    weather_data = await response.json()
    rainfall_mm = weather_data['current']['rain']
```

- **Time:** 3 seconds
- **No API key needed!**

#### **Flood Risk Calculation (Lines 177-230)**

**🔍 To Study:** Press `Ctrl+G`, type `177` to jump to this code

```python
def calculate_flood_risk(elevation, rainfall_mm, distance_to_water):
    flood_score = 0

    # Elevation scoring
    if elevation < 5:      flood_score += 50  # Very low
    elif elevation < 10:   flood_score += 30  # Low

    # Rainfall scoring
    if rainfall_mm > 50:   flood_score += 40  # Heavy rain
    elif rainfall_mm > 20: flood_score += 20  # Moderate

    # Water proximity scoring
    if distance_to_water < 100:  flood_score += 30  # Very close
    elif distance_to_water < 500: flood_score += 15  # Close

    # Determine flood status
    if flood_score >= 70:
        return {'flooded': True, 'flood_level': 'high'}  # Mark as "1"
    else:
        return {'flooded': False, 'flood_level': 'low'}  # Mark as "0"
```

**To show panelists the code:**

```powershell
code SafePathZC\backend\services\flood_data_updater.py
# Jump to line 70 (Ctrl+G) to see OpenStreetMap API
# Jump to line 107 to see elevation API with batching
# Jump to line 147 to see weather API
# Jump to line 177 to see flood calculation algorithm
```

---

## ROUTING ALGORITHM

**Dijkstra's Algorithm** with flood penalties:

```python
cost = distance × flood_penalty × terrain × mode

Flood Penalties:
  Safe Route:    50x (heavily avoid floods)
  Balanced:      5x  (moderate avoidance)
  Fastest:       1.1x (minimal avoidance)
```

**Example:** Veterans Ave (500m, flooded)

| Route    | Cost Calculation   | Total       | Decision |
| -------- | ------------------ | ----------- | -------- |
| Safe     | 500 × 50 = 25,000m | ❌ Avoid    |
| Balanced | 500 × 5 = 2,500m   | ⚠️ Consider |
| Fastest  | 500 × 1.1 = 550m   | ✅ Use      |

---

## DEMONSTRATION COMMANDS

### Show File Details:

```powershell
Get-Item SafePathZC\backend\data\terrain_roads.geojson | Select Name, LastWriteTime, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}
```

### Count Roads:

```powershell
# Total roads
(Select-String '"type": "Feature"' SafePathZC\backend\data\terrain_roads.geojson).Count

# Flooded roads
(Select-String '"flooded": "1"' SafePathZC\backend\data\terrain_roads.geojson).Count
```

### Run Update:

```powershell
cd SafePathZC\backend
python update_flood_data.py
```

### Check Status:

```powershell
Get-Process python -ErrorAction SilentlyContinue
Get-Content SafePathZC\backend\logs\flood_updates.log -Tail 10
```

---

## PANELIST Q&A SCRIPT

### Q: "How do you know which roads are flooded?"

**A:** "We use three free APIs updated every 6 hours. OpenStreetMap gives us road coordinates, NASA satellites via Open-Elevation give us elevation data, and Open-Meteo gives us current weather. We calculate a flood risk score - if a road is below 5 meters elevation, near a river, and it's raining heavily, it gets marked as flooded."

### Q: "How does the routing work?"

**A:** "We use Dijkstra's shortest path algorithm but with flood penalties. For the Safe Route, we multiply flooded road costs by 50, so a 500-meter flooded road effectively costs 25,000 meters. The algorithm naturally avoids expensive roads. We run it three times with different penalties to give users three route options: Safe, Balanced, and Fastest."

### Q: "Why not just one route?"

**A:** "User choice. Someone in an emergency with a high-clearance vehicle might take a risky route to save 10 minutes. But a family on a motorcycle prefers safety. We show flood percentages so users can decide based on their situation."

### Q: "Show me the data."

**A:** _(Open terrain_roads.geojson, search for "flooded": "1")_  
"Here's Veterans Avenue: elevation 0 meters (sea level), length 481 meters, flooded status '1'. When calculating the Safe Route, this road costs 24,050 meters equivalent, so the algorithm avoids it and finds alternatives."

### Q: "Is it accurate?"

**A:** "Within 6 hours, yes. We use NASA satellite data accurate to 30 meters, real-time weather, and community-verified OpenStreetMap data. Known flood-prone areas like Rio Hondo and Tetuan are correctly identified. The system updates at midnight, 6am, noon, and 6pm to stay current."

---

## KEY TALKING POINTS

✅ **Real-time data** from 3 free APIs  
✅ **10,461 roads** in Zamboanga City  
✅ **3 route options** - user empowerment  
✅ **Smart algorithm** - Dijkstra with flood penalties  
✅ **Auto-updates** every 6 hours  
✅ **$0 cost** - sustainable solution  
✅ **15-20 min updates** - elevation fetching bottleneck  
✅ **Panel-ready** - can demonstrate live

---

## REAL-WORLD SCENARIO

**User:** Jane, morning commute, Tetuan to Ayala Mall, motorcycle, heavy rain

**System Output:**

- 🟢 Safe: 8.5km, 18min, 2% flooded (takes Guiwan coastal road)
- 🟠 Balanced: 6.2km, 14min, 25% flooded (uses Veterans Ave)
- 🔴 Fastest: 4.8km, 11min, 52% flooded (direct through Rio Hondo)

**Jane's Choice:** Safe Route (+7 min but dry roads)  
**Result:** Arrived safely, avoided 0.5m deep water

---

## 💻 CODE WALKTHROUGH (5-Minute Version)

**📁 Source File:** `SafePathZC\backend\services\local_routing.py`  
**💡 To Demonstrate:** Open this file during panel defense

### The Critical Function: `get_routing_cost()`

**📍 Location:** `services/local_routing.py` (Lines 113-210)  
**🔍 To Study:** Press `Ctrl+G`, type `113` to jump to this function

```python
def get_routing_cost(segment, mode, risk_profile):
    """This function determines if the algorithm avoids or uses a road"""

    base_cost = segment.length_m  # Actual distance (e.g., 500m)

    # Check if road is flooded (from terrain_roads.geojson)
    is_flooded = segment.flooded  # True or False

    # Apply penalty based on user's chosen risk profile
    if risk_profile == "safe":
        penalty = 50.0 if is_flooded else 1.0  # 50x for flooded!
    elif risk_profile == "manageable":
        penalty = 5.0 if is_flooded else 1.0
    else:  # "prone"
        penalty = 1.1 if is_flooded else 1.0

    return base_cost * penalty  # Final cost
```

**Example:** Veterans Avenue (500m, flooded)

- Safe: 500m × 50 = **25,000m** → Too expensive, avoid!
- Manageable: 500m × 5 = **2,500m** → Consider
- Fastest: 500m × 1.1 = **550m** → Use it

---

### The Routing Algorithm: A\* Search

**📍 Location:** `services/local_routing.py` (Lines 590-750)  
**🔍 To Study:** Press `Ctrl+G`, type `590` to jump to this function

```python
def find_route(start, end, risk_profile):
    """A* algorithm finds cheapest path"""

    open_set = [start]  # Nodes to explore
    g_score = {start: 0}  # Cost to reach each node

    while open_set:
        current = pop_cheapest_node(open_set)

        if current == end:
            return reconstruct_path()  # Found destination!

        # Explore neighbors
        for neighbor in current.neighbors:
            # Calculate cost with flood penalties
            segment_cost = get_routing_cost(
                segment,
                mode,
                risk_profile  # ← This changes everything!
            )

            new_cost = g_score[current] + segment_cost

            if new_cost < g_score[neighbor]:
                g_score[neighbor] = new_cost
                open_set.append(neighbor)

    return None  # No route found
```

**Key Insight:** Same algorithm, different `risk_profile` → Different routes!

---

### How to Generate 3 Routes

**📍 Location:** `routes/flood_routing.py` (Lines 140-180)  
**🔍 To Study:** Open `routes/flood_routing.py` and press `Ctrl+G`, type `140`

```python
# Call the SAME algorithm 3 times with different penalties

route_1 = find_route(start, end, "safe")       # 50x penalty
route_2 = find_route(start, end, "manageable") # 5x penalty
route_3 = find_route(start, end, "prone")      # 1.1x penalty

# Result: 3 completely different paths!
```

---

### Panel Demonstration Script:

**1. Show the cost function:**

```powershell
code SafePathZC\backend\services\local_routing.py
# Go to line 113 (get_routing_cost function)
```

**2. Explain to panelists:**

> "This is the core of our routing system. When the algorithm considers a road segment, it checks if it's flooded from our terrain_roads.geojson file. If the user selected 'Safe Route', we multiply the cost by 50 - making that road 50 times more expensive. The A\* algorithm naturally finds the cheapest total path, so it avoids expensive flooded roads.
>
> We run this same algorithm three times with different penalty multipliers: 50x for Safe, 5x for Balanced, and 1.1x for Fastest. That's how we generate three distinct route options from the same road network."

**3. Show the A\* algorithm:**

```powershell
# Scroll to line 590 (_a_star_search function)
```

**4. Show the 3-route generation:**

```powershell
code SafePathZC\backend\routes\flood_routing.py
# Go to line 140 (get_flood_aware_routes function)
```

---

## FILE LOCATIONS

- **Data:** `SafePathZC\backend\data\terrain_roads.geojson`
- **Update Script:** `SafePathZC\backend\update_flood_data.py`
- **Updater Code:** `SafePathZC\backend\services\flood_data_updater.py`
- **Routing Code:** `SafePathZC\backend\services\local_routing.py`
- **Logs:** `SafePathZC\backend\logs\flood_updates.log`

---

## TECHNICAL SPECS

| Metric      | Value     |
| ----------- | --------- |
| Roads       | 10,461    |
| GPS Points  | 87,682    |
| File Size   | 6.65 MB   |
| Update Time | 15-20 min |
| API Calls   | ~900      |
| Cost        | $0        |

---

**PRINT THIS FOR YOUR DEFENSE!**

**Last Updated:** November 8, 2025  
**Full Documentation:** See COMPLETE_GUIDE.md
