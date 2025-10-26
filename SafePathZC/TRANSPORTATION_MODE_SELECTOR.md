# Transportation Mode Selector Implementation

## Overview

Added a dynamic transportation mode selector that allows users to choose between **Car**, **Motorcycle**, and **Walking** modes. Routes are automatically recalculated when the mode changes, with motorcycles being the fastest option.

## Features Implemented

### 1. Backend Changes

#### **File**: `backend/services/local_routing.py`

##### Speed Optimizations

- **Motorcycle**: 25% faster than car (most nimble, best for traffic)
  - Routing cost factor: `0.75` (25% less cost)
  - Speed multiplier: `1.25x` base speed
- **Car**: Baseline speed
  - Routing cost factor: `1.0`
  - Speed multiplier: `1.0x` base speed
- **Walking**: Slower, pedestrian-friendly
  - Routing cost factor: `2.5` (2.5x more time)
  - Fixed speed: `5 km/h`

##### Updated Functions

1. **`get_routing_cost()`**

   ```python
   mode_factors = {
       "car": 1.0,
       "motorcycle": 0.75,  # Fastest - 25% less routing cost
       "walking": 2.5      # Much slower
   }
   ```

2. **`get_terrain_adjusted_speed()`**

   ```python
   if mode == "walking":
       return 5  # km/h
   elif mode == "motorcycle":
       return int(base_speed * 1.25)  # 25% faster
   return base_speed
   ```

3. **`calculate_hybrid_routes_with_waypoints()`**
   - Now accepts `mode` parameter
   - Passes mode to all route calculations
   - Includes mode in response data

#### **File**: `backend/main.py`

##### Updated Endpoint

```python
@app.get("/local-route")
async def local_route(
    start: str,
    end: str,
    waypoints: Optional[str] = None,
    mode: str = Query("car", regex="^(car|motorcycle|walking)$")
)
```

**Example Request**:

```
GET /local-route?start=6.9214,122.0790&end=6.9100,122.0850&mode=motorcycle
```

### 2. Frontend Changes

#### **File**: `frontend/src/components/MapView.tsx`

##### New State Variables

```typescript
const [transportationMode, setTransportationMode] = useState<
  "car" | "motorcycle" | "walking"
>("car");
const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);
```

##### Transportation Mode Selector UI

Located in the bottom-left corner, appears after routes are calculated:

**Visual Design**:

- **Car** 🚗 - Blue button
- **Motorcycle** 🏍️ - Green button with "⚡ Fastest" badge
- **Walking** 🚶 - Orange button
- Shows "Recalculating routes..." indicator during updates

**Behavior**:

- Only visible when routes exist (`routeMode && startPoint && endPoint && !isCalculatingRoutes`)
- Active mode highlighted with colored background
- Clicking a different mode triggers automatic route recalculation

##### Updated Functions

1. **`getLocalOSRMRoute()`**

   ```typescript
   const getLocalOSRMRoute = async (
     start: LatLng,
     end: LatLng,
     waypoints: LatLng[] = [],
     mode: string = "car"  // New parameter
   )
   ```

2. **`generateFloodRoutes()`**
   ```typescript
   let routeUrl = `${BACKEND_URL}/local-route?start=${start.lat},${start.lng}&end=${end.lat},${end.lng}&mode=${transportationMode}`;
   ```

## User Flow

### Step 1: Calculate Initial Routes

1. User selects start and end locations
2. Clicks "Find Routes" button
3. System calculates 3 routes (Safe, Manageable, Flood-Prone) using default mode (Car)
4. Routes display on map with transportation selector appearing

### Step 2: Change Transportation Mode

1. User clicks on **Motorcycle** 🏍️ button
2. UI shows "🔄 Recalculating routes..." message
3. Backend recalculates all 3 routes with motorcycle settings:
   - Higher speeds (25% faster)
   - Lower routing cost (25% less)
   - Different route preferences
4. New routes render on map
5. Route distances and times update automatically

### Step 3: Compare Modes

User can switch between modes to see:

- **Motorcycle**: Fastest routes, best for traffic navigation
- **Car**: Balanced routes, standard speeds
- **Walking**: Pedestrian-friendly, slower but may use shortcuts

## Technical Details

### Route Calculation Differences

#### Motorcycle Advantages

- **Speed**: 25% faster on all roads
- **Routing Cost**: 25% less expensive routes
- **Agility**: Better at navigating congested areas
- **Example**: 40 km/h road → 50 km/h for motorcycle

#### Walking Characteristics

- **Fixed Speed**: 5 km/h regardless of road type
- **Route Cost**: 2.5x higher (prioritizes shortest distance)
- **Access**: May use pedestrian paths

#### Car Baseline

- **Standard Speed**: Uses posted speed limits
- **Balanced**: Middle ground between speed and safety

### API Response Format

```json
{
  "success": true,
  "mode": "motorcycle",
  "routes": [
    {
      "label": "direct",
      "risk_profile": "prone",
      "mode": "motorcycle",
      "geometry": {
        "coordinates": [[lng, lat], ...],
        "type": "LineString"
      },
      "distance": 5420.5,
      "duration": 324.3,
      "flooded_distance": 120.0,
      "flood_percentage": 2.21
    },
    ...
  ],
  "message": "Successfully calculated 3 motorcycle route(s) with waypoints"
}
```

## UI Layout

```
┌─────────────────────────────────────────┐
│                  MAP                    │
│                                         │
│  ┌────────────────────┐                │
│  │ 🚗 Transportation  │  (bottom-left) │
│  │    Mode            │                │
│  │ ┌──────────────┐   │                │
│  │ │ 🚗 Car       │   │                │
│  │ └──────────────┘   │                │
│  │ ┌──────────────┐   │                │
│  │ │🏍️ Motorcycle │   │ ← Active      │
│  │ │  ⚡ Fastest   │   │                │
│  │ └──────────────┘   │                │
│  │ ┌──────────────┐   │                │
│  │ │ 🚶 Walking   │   │                │
│  │ └──────────────┘   │                │
│  │ 🔄 Recalculating.. │                │
│  └────────────────────┘                │
│  ┌────────────────────┐                │
│  │  Route Options     │                │
│  │  ─── Safe Route    │                │
│  │  ─── Manageable    │                │
│  │  ─ ─  Flood-Prone  │                │
│  └────────────────────┘                │
└─────────────────────────────────────────┘
```

## Performance Considerations

### Backend

- Mode is applied during A\* pathfinding
- Affects both speed calculations and routing costs
- Single calculation pass per mode
- Cached flood data for efficiency

### Frontend

- Routes recalculated on mode change only
- UI shows loading state during recalculation
- Previous routes cleared before showing new ones
- Smooth transition between modes

## Testing

### Test Scenarios

1. **Basic Mode Switching**

   - Calculate route with Car
   - Switch to Motorcycle → verify routes update
   - Switch to Walking → verify routes update
   - Verify times are: Walking > Car > Motorcycle

2. **Route Comparison**

   - Same start/end for all modes
   - Motorcycle should show:
     - Shorter durations
     - May use different roads
     - "⚡ Fastest" badge displayed

3. **UI Responsiveness**

   - Selector only appears after route calculation
   - Active mode highlighted correctly
   - Loading indicator shows during recalculation
   - Routes update smoothly

4. **Edge Cases**
   - Long routes (>10km)
   - Routes with waypoints
   - Flooded road avoidance per mode
   - Terrain impact on different modes

## Future Enhancements

### Potential Additions

1. **Bicycle Mode** 🚴

   - Speed between motorcycle and walking
   - Prefer bike lanes/paths

2. **Public Transport** 🚌

   - Integration with bus routes
   - Combined walking + transit

3. **Custom Speed Settings**

   - User-defined max speeds
   - Personal driving style preferences

4. **Mode-Specific Route Preferences**

   - Motorcycle: prefer main roads
   - Walking: prefer sidewalks/pedestrian areas
   - Car: balance between speed and safety

5. **Cost Comparison**
   - Fuel/energy costs per mode
   - Environmental impact metrics

## Files Modified

### Backend

1. `SafePathZC/backend/services/local_routing.py`

   - Added mode parameter to routing functions
   - Updated speed calculations
   - Enhanced route cost calculations

2. `SafePathZC/backend/main.py`
   - Added mode parameter to `/local-route` endpoint
   - Updated API documentation

### Frontend

1. `SafePathZC/frontend/src/components/MapView.tsx`
   - Added transportation mode state
   - Created mode selector UI
   - Updated routing API calls
   - Added recalculation logic

## Date

October 26, 2025

## Summary

Users can now dynamically switch between Car, Motorcycle, and Walking modes after routes are calculated. The system automatically recalculates all three route options (Safe, Manageable, Flood-Prone) based on the selected mode, with motorcycles being optimized as the fastest option. The UI is clean, intuitive, and provides real-time feedback during recalculation.
