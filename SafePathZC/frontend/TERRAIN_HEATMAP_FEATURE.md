# 🗺️ Terrain 3-Way Toggle Feature

## Overview

The terrain button now cycles through **3 different views** instead of just showing/hiding terrain:

1. **Normal View** (Default) - Standard map without overlays
2. **Terrain View** - Topographic overlay showing elevation
3. **Slope Heatmap** - Color-coded roads by slope steepness

## How It Works

### User Experience:

**Button Location:** Top-right corner of the map (mountain icon button)

**Click Behavior:**
- **1st Click:** Normal → Terrain View (green background)
- **2nd Click:** Terrain → Slope Heatmap (orange background)  
- **3rd Click:** Slope Heatmap → Normal (white background)

### Visual Indicators:

| Mode | Button Text | Button Color | Icon |
|------|-------------|--------------|------|
| **Normal** | "Normal View" | White | 🏔️ Mountain |
| **Terrain** | "Terrain View" | Light Green (#e8f5e9) | 🏔️ Mountain |
| **Heatmap** | "Slope Heatmap" | Light Orange (#ffe0b2) | 🏔️ Mountain |

---

## Terrain View Mode

**Purpose:** Show elevation/topography overlay

**Visualization:**
- Uses OpenTopoMap tiles
- Semi-transparent overlay (60% opacity)
- Shows contour lines and elevation shading

**Legend:**
- 0-50m: Light green (Low/Coastal)
- 50-150m: Medium green (Plains)
- 150-300m: Yellow-green (Hills)
- 300-500m: Tan (Highlands)

---

## Slope Heatmap Mode 🔥

**Purpose:** Visualize road slope steepness based on elevation changes

### Color Coding:

| Slope | Color | Intensity | Description |
|-------|-------|-----------|-------------|
| **0-2%** | 🟢 Green | Flat | Very easy terrain |
| **2-5%** | 🟡 Chartreuse | Gentle | Easy terrain |
| **5-10%** | 🟡 Yellow | Moderate | Noticeable incline |
| **10-15%** | 🟠 Orange | Steep | Challenging climb |
| **15-25%** | 🔴 Orange-Red | Very Steep | Very difficult climb |
| **>25%** | 🔴 Red | Extreme | Dangerous steep terrain |

### Calculation Method:

```javascript
// Slope percentage calculation
const elevationGain = elevMax - elevMin; // meters
const length = roadLength; // meters
const slopePercent = (elevationGain / length) * 100;
const slopeAngle = Math.atan(elevationGain / length) * (180 / Math.PI);
```

### Interactive Features:

**Click on any road** to see detailed popup:
- Road name
- Slope percentage (e.g., "8.5%")
- Slope angle (e.g., "4.9°")
- Intensity level (e.g., "Moderate")
- Elevation gain (e.g., "12.3m over 145m")
- Elevation range (e.g., "45.2m - 57.5m")
- Description (e.g., "Noticeable incline")

---

## Technical Implementation

### State Management:

```typescript
// Old: Boolean toggle
const [showTerrainOverlay, setShowTerrainOverlay] = useState(false);

// New: 3-way toggle
const [terrainMode, setTerrainMode] = useState<"off" | "terrain" | "heatmap">("off");
```

### Mode Switching Logic:

```typescript
setTerrainMode((prev) => {
  if (prev === "off") return "terrain";
  if (prev === "terrain") return "heatmap";
  return "off"; // heatmap → off
});
```

### Key Functions:

1. **`createTerrainOverlay()`**
   - Creates topographic tile layer
   - Uses OpenTopoMap
   - 60% opacity overlay

2. **`createSlopeHeatmap()`** ⭐ NEW
   - Loads terrain_roads.geojson
   - Calculates slope for each segment
   - Color-codes based on steepness
   - Adds interactive popups

3. **`useEffect()` for mode handling**
   - Cleans up old overlays
   - Applies new overlay based on mode
   - Manages terrain/heatmap/off states

---

## Data Source

**File:** `backend/data/terrain_roads.geojson`

**Required Fields:**
```json
{
  "properties": {
    "name": "Veterans Avenue",
    "elev_min": 2.5,
    "elev_max": 15.8,
    "elev_mean": 9.1,
    "length_m": 481.3,
    "flooded": "0"
  }
}
```

**Data Points:**
- 10,461 road segments
- 87,682 elevation points
- NASA SRTM elevation data (30m accuracy)

---

## Use Cases

### For Users:

1. **Cyclists/Motorcyclists**
   - See steep hills before choosing route
   - Avoid exhausting climbs
   - Plan easier alternative routes

2. **Truck Drivers**
   - Identify steep gradients (engine strain)
   - Plan fuel consumption
   - Avoid dangerous steep descents

3. **Pedestrians**
   - Find flat walking routes
   - Avoid tiring uphill walks
   - Accessibility planning

4. **Emergency Vehicles**
   - Understand terrain challenges
   - Plan fastest routes considering slopes
   - Avoid steep flood-prone areas

### Real-World Examples:

**Scenario 1: Delivery Driver**
- Switches to Slope Heatmap
- Sees Veterans Ave has 12% slope (orange)
- Chooses alternative flat route (green)
- Saves fuel and time

**Scenario 2: Cyclist**
- Planning training ride
- Wants challenging hills
- Uses heatmap to find steep roads (red/orange)
- Creates workout route

**Scenario 3: Accessibility**
- Wheelchair user planning route
- Needs flat terrain only
- Filters for green roads (0-2% slope)
- Finds accessible path

---

## Panel Defense Talking Points

### For Capstone Presentation:

**Q: "What's the difference between Terrain and Heatmap mode?"**

**A:** "Terrain mode shows the overall topography of Zamboanga City - where the mountains, hills, and coastal areas are. Heatmap mode analyzes every single road segment to show how steep it is. For example, a road going uphill might be yellow or orange in heatmap mode, even if terrain mode shows the area as generally flat. It's the difference between seeing the landscape and analyzing the road difficulty."

**Q: "How do you calculate slope?"**

**A:** "We use the elevation data from terrain_roads.geojson. For each road, we take the elevation gain (highest point minus lowest point) and divide by the road length, then multiply by 100 to get percentage. For example, if a 100-meter road rises 5 meters, that's a 5% slope. We also calculate the angle using arctangent for more precise measurements."

**Q: "Why is this useful?"**

**A:** "Different users have different needs. Cyclists want to know about hills. Truck drivers need to avoid steep descents. Pedestrians and wheelchair users need flat routes. Emergency vehicles need to understand terrain challenges. The heatmap gives everyone the information they need at a glance."

**Q: "What's your data source?"**

**A:** "We get elevation data from NASA's SRTM satellites with 30-meter accuracy. We process 87,682 elevation points across 10,461 road segments in Zamboanga City. This data is updated every 6 hours via our automated system using three free APIs: OpenStreetMap, Open-Elevation, and Open-Meteo."

---

## Future Enhancements

### Potential Improvements:

1. **Filter by Slope**
   - Add slider to show only roads within slope range
   - E.g., "Show only roads with 0-5% slope"

2. **Slope-Based Routing**
   - Add "Flat Route" preference
   - Avoid steep hills in route calculation
   - Useful for cyclists, accessibility

3. **Custom Color Schemes**
   - Allow users to customize heatmap colors
   - High-contrast mode for accessibility
   - Colorblind-friendly palettes

4. **Export Slope Data**
   - Download slope analysis as CSV
   - Share heatmap as image
   - Generate elevation profile graphs

5. **Slope Warnings**
   - Alert users about steep segments in route
   - Show total elevation gain for route
   - Warn about dangerous descents

---

## Testing

### How to Test:

1. **Start Frontend:**
   ```powershell
   cd frontend
   npm run dev
   ```

2. **Open Map:**
   - Go to http://localhost:5173
   - Wait for map to load

3. **Test Toggle:**
   - Click terrain button (top-right)
   - Verify: Changes from "Normal View" to "Terrain View" (green bg)
   - Click again
   - Verify: Changes to "Slope Heatmap" (orange bg)
   - Click again
   - Verify: Returns to "Normal View" (white bg)

4. **Test Heatmap:**
   - Click to "Slope Heatmap" mode
   - Click on colored roads
   - Verify: Popup shows slope data
   - Check legend (bottom-left)
   - Verify: Shows slope percentages

5. **Test Cleanup:**
   - Click "Clear All" button
   - Verify: Returns to Normal View
   - Verify: All overlays removed

### Expected Behavior:

✅ Button cycles through 3 states  
✅ Background color changes per mode  
✅ Terrain overlay appears in Terrain View  
✅ Slope heatmap appears in Heatmap mode  
✅ Legend updates based on mode  
✅ Popups show detailed slope info  
✅ Clear All resets to Normal View  

---

## Code Files Modified

### Frontend Changes:

**File:** `frontend/src/components/MapView.tsx`

**Changes:**
1. Replaced `showTerrainOverlay` boolean with `terrainMode` enum
2. Updated button to cycle through 3 states
3. Added `createSlopeHeatmap()` function
4. Updated terrain overlay useEffect
5. Updated legend to show different info per mode
6. Updated Clear All button condition

**Lines Modified:** ~150 lines

---

## Deployment Notes

### Requirements:

- ✅ terrain_roads.geojson must have elev_min, elev_max, length_m fields
- ✅ Backend auto-update system running (generates geojson every 6 hours)
- ✅ Frontend build process (npm run build)
- ✅ Map tiles loading correctly (OpenTopoMap)

### No Backend Changes Required

This is a **frontend-only feature** using existing terrain data.

---

## Summary

🎯 **Before:** Simple on/off terrain toggle  
🎯 **After:** 3-way cycle: Normal → Terrain → Heatmap  

✨ **New Feature:** Slope-based heatmap showing road steepness  
📊 **Visualization:** Color-coded roads from green (flat) to red (extreme)  
🎨 **Interactive:** Click roads for detailed slope analysis  
🗺️ **Data-Driven:** Uses real NASA elevation data  

**Result:** Users can now see not just where mountains are, but exactly how steep each road is! 🚵‍♂️🚗
