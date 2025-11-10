# 📝 Simple Explanation: Where Does the Data Come From?

## The Big Picture

Your flood analysis system combines data from **3 different sources** every 6 hours:

---

## 🌐 Data Source 1: OpenStreetMap (Roads)

**What it provides:**

- Road locations (GPS coordinates)
- Road names ("Veterans Avenue", "RT Lim Boulevard")
- Road types (primary, secondary, residential)

**Example:**

```
Road: Veterans Avenue
Coordinates:
  Point 1: Latitude 6.9210, Longitude 122.0790
  Point 2: Latitude 6.9215, Longitude 122.0795
  Point 3: Latitude 6.9220, Longitude 122.0800
  ... (234 points total)
```

**Why we use it:**

- ✅ Always up-to-date (community edits in real-time)
- ✅ Covers entire Zamboanga City
- ✅ Free forever
- ✅ No API key needed

---

## 🏔️ Data Source 2: Open-Elevation (Height Above Sea Level)

**What it provides:**

- Elevation for each GPS coordinate
- Data from NASA satellites (SRTM 30m resolution)

**Example:**

```
Coordinate: 6.9210, 122.0790
Elevation: 3.2 meters above sea level

Coordinate: 6.9380, 122.0620 (Pasonanca)
Elevation: 45.8 meters above sea level
```

**Why elevation matters:**

- Low elevation (< 5m) = **High flood risk** (water collects here)
- Medium elevation (5-20m) = **Moderate risk**
- High elevation (> 20m) = **Low flood risk** (water drains away)

---

## 🌧️ Data Source 3: Open-Meteo (Current Weather)

**What it provides:**

- Current rainfall amount
- Temperature
- Hourly forecast

**Example - Clear Day:**

```
Time: 2025-11-08 13:30
Rainfall: 0mm
Temperature: 28°C
Status: ☀️ Clear
```

**Example - Rainy Day:**

```
Time: 2025-11-08 15:45
Rainfall: 45mm
Temperature: 24°C
Status: ⛈️ Heavy rain
```

**Why rainfall matters:**

- No rain (0mm) = **Lower flood risk**
- Light rain (5-20mm) = **Moderate risk**
- Heavy rain (>50mm) = **High flood risk** (roads may flood)

---

## 🧮 How We Combine the Data

### Step-by-Step Process:

**1. Get a road from OpenStreetMap:**

```
Road: Veterans Avenue
Location: Downtown Zamboanga
Points: 234 GPS coordinates
```

**2. Get elevation for all points:**

```
Point 1: 3.2m elevation  (low)
Point 2: 3.5m elevation  (low)
Point 3: 2.8m elevation  (very low!)
Average: 3.2m  ← This road is LOW
```

**3. Get current weather:**

```
Current rainfall: 0mm  ← No rain right now
```

**4. Check distance to water:**

```
Nearest flood zone: Rio Hondo River
Distance: 250 meters  ← Pretty close!
```

**5. Calculate flood risk score:**

```
Elevation score:  +50 points (very low land)
Rainfall score:   +0 points  (no rain)
Water distance:   +15 points (close to river)
────────────────────────
Total Score:      65 points
Risk Level:       MEDIUM
Flooded?:         Yes (mark as potentially flooded)
```

**6. Save to GeoJSON file:**

```json
{
  "type": "Feature",
  "properties": {
    "name": "Veterans Avenue",
    "elevation_mean": 3.2,
    "rainfall_mm": 0,
    "flood_risk_score": 65,
    "flood_level": "medium",
    "flooded": "1"
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [[122.079, 6.921], [122.0795, 6.9215], ...]
  }
}
```

---

## 🔄 What Changes Every 6 Hours?

| Data           | Changes?    | Why?                                   |
| -------------- | ----------- | -------------------------------------- |
| **Roads**      | Rarely      | Only when OSM community adds new roads |
| **Elevation**  | Never       | Land doesn't change height             |
| **Rainfall**   | ✅ **YES!** | Weather changes constantly             |
| **Flood Risk** | ✅ **YES!** | Recalculated based on new rainfall     |

### Example Timeline:

**6:00 AM - Morning (No Rain)**

```
Veterans Avenue:
- Elevation: 3.2m (same)
- Rainfall: 0mm
- Flood Score: 65
- Status: MEDIUM RISK ⚠️
```

**12:00 PM - Noon (Heavy Rain Starts)**

```
Veterans Avenue:
- Elevation: 3.2m (same)
- Rainfall: 45mm  ← CHANGED!
- Flood Score: 105 ← INCREASED!
- Status: HIGH RISK ⛔
```

**6:00 PM - Evening (Rain Stopped)**

```
Veterans Avenue:
- Elevation: 3.2m (same)
- Rainfall: 2mm  ← CHANGED!
- Flood Score: 70 ← DECREASED!
- Status: MEDIUM RISK ⚠️
```

---

## 🎯 Real-World Example

Let's trace one complete update cycle:

### **12:00 PM Update Starts**

```
[12:00:05] Connecting to OpenStreetMap...
[12:00:10] ✓ Downloaded 10,461 roads
[12:00:15] ✓ Extracted 87,682 unique coordinates

[12:00:20] Connecting to Open-Elevation...
[12:00:25] ✓ Batch 1/877: Coordinates 1-100 (elevations received)
[12:00:27] ✓ Batch 2/877: Coordinates 101-200 (elevations received)
...
[12:14:50] ✓ Batch 877/877: Coordinates 87,601-87,682 (done!)

[12:14:55] Connecting to Open-Meteo...
[12:14:58] ✓ Current weather: 28°C, Rainfall: 0mm

[12:15:00] Calculating flood risk for 10,461 roads...
[12:15:05] ✓ Veterans Avenue: Score 65 (MEDIUM)
[12:15:05] ✓ RT Lim Blvd: Score 32 (LOW)
[12:15:05] ✓ Pasonanca Rd: Score 5 (SAFE)
...
[12:15:30] ✓ All roads analyzed

[12:15:35] Writing terrain_roads.geojson...
[12:15:40] ✓ File saved (6.65 MB)
[12:15:40] ✓ Update complete!

Summary:
- Total roads: 10,461
- Flooded roads: 234
- High risk: 45 roads
- Medium risk: 189 roads
- Current rainfall: 0mm
```

---

## 💡 Why This Matters for Your Panel Defense

**Panelist: "How do you know which roads are flooded?"**

**Your Answer:**

> "Our system combines three data sources:
>
> 1. **OpenStreetMap** gives us the road network for Zamboanga City - where all the roads are located
>
> 2. **Open-Elevation API** gives us the height of each road. Low elevation roads (under 5 meters) are at high risk because water collects there
>
> 3. **Open-Meteo API** gives us current rainfall. When we detect heavy rain (over 50mm), we increase the flood risk score for low-lying roads
>
> We run this analysis every 6 hours automatically, so our flood data is always current. Right now, the data is only [X] hours old, and it updates automatically at midnight, 6am, noon, and 6pm."

**Panelist: "Is this real-time data?"**

**Your Answer:**

> "The weather data is real-time - updated hourly by Open-Meteo. The road elevations come from NASA satellite data, which doesn't change. Our system combines them every 6 hours to give you the current flood risk based on today's weather conditions."

---

## 🔧 Technical Summary

**APIs Used:**

1. **OpenStreetMap Overpass API**

   - URL: `https://overpass-api.de/api/interpreter`
   - Cost: Free
   - Rate Limit: Fair use
   - Returns: Road network GeoJSON

2. **Open-Elevation API**

   - URL: `https://api.open-elevation.com/api/v1/lookup`
   - Cost: Free
   - Rate Limit: ~100 requests/second
   - Data Source: NASA SRTM (30m resolution)
   - Returns: Elevation in meters

3. **Open-Meteo API**
   - URL: `https://api.open-meteo.com/v1/forecast`
   - Cost: Free
   - Rate Limit: Unlimited
   - Update Frequency: Hourly
   - Returns: Current weather + forecast

**Total Cost: $0/month** ✅

**Update Frequency: Every 6 hours** ✅

**Manual Work Required: None** ✅

---

## 📊 File Size Breakdown

Your `terrain_roads.geojson` file contains:

```
File Size: 6.65 MB

Breakdown:
- Road geometries (coordinates): ~4.5 MB (67%)
- Road properties (names, types): ~1.2 MB (18%)
- Elevation data: ~0.6 MB (9%)
- Flood risk calculations: ~0.35 MB (6%)

Total features: 10,461 roads
Total coordinates: 87,682 GPS points
```

---

## ✅ Summary

**Question: Where does the data come from?**

**Answer:**

1. **Roads** → OpenStreetMap (community-maintained, always current)
2. **Elevations** → Open-Elevation API (NASA satellites)
3. **Rainfall** → Open-Meteo API (hourly weather updates)
4. **Flood Risk** → Calculated by our algorithm using all 3 sources

**Question: How often does it update?**

**Answer:** Every 6 hours automatically (12am, 6am, 12pm, 6pm)

**Question: What changes in each update?**

**Answer:** Rainfall amounts and flood risk scores change. Roads and elevations stay the same unless new roads are built.

**Question: Does it cost money?**

**Answer:** No! All three APIs are completely free.

That's the complete system! 🎉
