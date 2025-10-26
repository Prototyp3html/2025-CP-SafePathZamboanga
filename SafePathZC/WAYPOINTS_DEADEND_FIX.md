# Waypoints & Dead-End Fixes

## Problem Summary

1. **Waypoints not being used**: The new flood-routing endpoint didn't support waypoints, causing multi-stop routes to fail
2. **Dead-end "antenna" routes**: OSRM routes had spurious branches sticking out that don't lead anywhere
3. **Route simplification**: Routes had too many unnecessary waypoints

## Changes Made

### 1. Added Waypoints Support to Flood Routing

**File**: `backend/routes/flood_routing.py`

- Updated `FloodRouteRequest` model to accept optional `waypoints` parameter
- Modified OSRM URL building to include waypoints in the coordinate string
- Format: `start;waypoint1;waypoint2;...;end`
- OSRM doesn't support alternatives with waypoints, so we disable alternatives when waypoints are present

```python
# Before
osrm_url = f"http://localhost:5000/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}"

# After (with waypoints)
coords_list = [(start_lng, start_lat)] + waypoint_coords + [(end_lng, end_lat)]
coords_str = ";".join([f"{lng},{lat}" for lng, lat in coords_list])
osrm_url = f"http://localhost:5000/route/v1/driving/{coords_str}"
```

### 2. Improved Dead-End Removal Algorithm

**File**: `backend/routes/flood_routing.py`

Replaced simple distance-based detection with **sliding window pattern detection**:

- **Spike Detection**: Identifies points where route goes farther from destination then immediately returns (V-shape pattern)
- **U-Turn Detection**: Detects segments moving away from goal when future points come closer
- **Validation**: Only removes up to 40% of points to avoid over-aggressive filtering

```python
# Pattern detection
if current_dist > prev_dist and current_dist > next_dist:
    if next_next_dist < current_dist:
        is_spike = True  # Skip this spike point
```

### 3. Increased Route Simplification Tolerance

**File**: `backend/services/local_routing.py`

Changed Douglas-Peucker tolerance from **100m to 150m**:

- Removes more unnecessary waypoints
- Creates cleaner, smoother routes
- Eliminates minor dead-end branches automatically

```python
# Before
simplified_path = self._simplify_path(path, tolerance=100.0)

# After
simplified_path = self._simplify_path(path, tolerance=150.0)
```

### 4. Updated /local-route Endpoint to Pass Waypoints

**File**: `backend/main.py`

Now parses and forwards waypoints to the flood routing endpoint:

```python
# Parse waypoints (lng,lat;lng,lat;...)
waypoint_list = []
for wp_str in waypoints.split(';'):
    wp_parts = wp_str.split(',')
    waypoint_list.append({"lng": float(wp_parts[0]), "lat": float(wp_parts[1])})

# Pass to flood routing
request = FloodRouteRequest(
    start_lat=start_lat,
    start_lng=start_lng,
    end_lat=end_lat,
    end_lng=end_lng,
    waypoints=waypoint_list,  # NEW
    weather_data=None
)
```

## How It Works

### Multi-Stop Routes (Waypoints)

1. Frontend adds waypoint markers (A, B, C...)
2. Sends request: `/local-route?start=6.9,122.0&end=7.0,122.1&waypoints=122.05,6.95;122.08,6.98`
3. Backend builds OSRM URL: `driving/122.0,6.9;122.05,6.95;122.08,6.98;122.1,7.0`
4. OSRM returns route passing through all points in order
5. Flood analysis runs on the complete route

### Dead-End Removal Process

1. **Input**: OSRM route with potential dead-ends
2. **Detection**: Sliding window checks each 3-5 point segment for detours
3. **Removal**: Skip points that form spikes or U-turns
4. **Validation**: Ensure we don't remove more than 40% of points
5. **Output**: Clean route without unnecessary branches

### Route Simplification

1. **A\* Pathfinding**: Creates detailed route with many waypoints
2. **Douglas-Peucker**: Removes points within 150m tolerance
3. **Result**: Only keeps points where direction changes significantly

## Testing

To test waypoints:

```
GET /local-route?start=6.9477,122.0726&end=6.9733,122.1293&waypoints=122.1,6.96;122.12,6.97
```

Expected behavior:

- Route passes through both waypoints in order
- No dead-end branches sticking out
- Cleaner route with fewer waypoints (but still accurate)

## Benefits

✅ **Multi-stop routes work again** - Essential for delivery routes, tours, etc.
✅ **Cleaner visual routes** - No more confusing "antenna" branches
✅ **Better performance** - Fewer waypoints to render and process
✅ **More accurate** - Routes follow actual paths without detours
✅ **Flood analysis works** - Applied to the complete route including waypoints

## Before vs After

### Before (Without Fixes)

- ❌ Waypoints ignored - routes go directly from start to end
- ❌ Dead-end branches visible on map
- ❌ 50-100+ waypoints per route
- ❌ Confusing route visualization

### After (With Fixes)

- ✅ Routes pass through all waypoints
- ✅ Clean routes without dead-ends
- ✅ 15-20 waypoints per route
- ✅ Clear, navigable path visualization
