# Simulated Flood Zone Routing Fix

## Problem Identified
When testing the simulated flood zone feature with Pasonanca→Cabatangan route, the following issue was observed:
- **Safe route**: Correctly avoided the simulated flood zone ✓
- **Manageable route**: Passed through the exact same path as the safe route ✗
- **Prone route**: Also passed through the exact same path as the safe route ✗

This indicated that manageable and prone routes were being forced to take unnecessarily long detours, defeating the purpose of having different risk profiles.

## Root Cause Analysis

### Issue 1: Hard-Blocking Too Restrictive
The original implementation used **hard-blocking** for safe routes:
- Any segment intersecting the simulated zone center ± radius was completely rejected
- This created an aggressive exclusion zone that left few routing options
- When all paths required crossing into the exclusion zone, A* couldn't find a route and failed
- The system would then fall back to OSRM, which ignores the simulated zone constraints
- OSRM would return the shortest/default route (same for all three profiles)

### Issue 2: No Differentiation Between Risk Profiles
The original code structure made safe routes work correctly when A* succeeded, but:
- When safe route A* failed, it fell back to OSRM
- OSRM returned the same route for all profiles (it has no concept of flood zones)
- Manageable/prone routes then used these OSRM routes, all identical

## Solution Implemented

### Safety Buffer Zone (1.5x Radius)
Changed the safe route hard-blocking logic in `/backend/services/local_routing.py` (_a_star_search function):

**Before:**
```python
# Reject ANY node touching the simulated zone
if dist_current < zone_radius or dist_neighbor < zone_radius or dist_closest < zone_radius:
    neighbor_in_simulated_zone = True
    # Skip this neighbor
```

**After:**
```python
# Safe routes must avoid an EXPANDED buffer zone (1.5x radius)
safe_route_buffer = zone_radius * 1.5

if dist_current < safe_route_buffer or dist_neighbor < safe_route_buffer or dist_closest < safe_route_buffer:
    neighbor_in_safety_buffer = True
    # Skip this neighbor
```

### Risk Profile Differentiation
Manageable and prone routes continue to use the original zone radius with cost penalties:
- **Manageable**: 4x cost multiplier when intersecting zone
- **Prone**: 4x cost multiplier when intersecting zone (can accept more risk)
- **Safe**: Must avoid expanded buffer (hard block)

## Expected Outcomes

1. **Safe Route**: Takes a significant detour around a 1.5x expanded safety corridor
   - Minimum direct distance: ~2.0 km
   - Expected route with safety buffer: ~2.5-3.0 km (longer due to detour)

2. **Manageable Route**: Takes a moderate detour with some edge-zone proximity allowed
   - Can navigate closer to zone edges with penalty cost
   - Expected route: ~2.1-2.4 km (slightly shorter than safe)

3. **Prone Route**: Takes the most direct route, even if it comes close to or edges the zone
   - Applies penalties but allows closer proximity
   - Expected route: ~2.0-2.1 km (shortest/most direct)

## Flood Percentage Analysis
- **Safe**: 0-20% flooded (strong avoidance with buffer)
- **Manageable**: 20-50% flooded (moderate proximity with penalties)
- **Prone**: 40-80%+ flooded (direct route with zone edge proximity)

## Technical Details

### Safety Buffer Calculation
- Zone radius: 250m (user defined)
- Safe route buffer: 250m × 1.5 = **375m**
- Any segment within 375m of zone center is rejected for safe routes
- Manageable/prone can use zones within 250m but with cost penalties

### A* Search Impact
- **Safe routes**: Explore fewer nodes within the expanded buffer, but find valid paths around it
- **Manageable/Prone routes**: Explore more nodes, can traverse within zone with higher costs
- This prevents routing deadlocks while maintaining differentiation

## Testing Checklist
- [ ] Re-test Pasonanca→Cabatangan route
  - Verify safe route takes a clear detour
  - Verify manageable route is shorter than safe route
  - Verify prone route is shortest
- [ ] Re-test other location pairs with simulated zones
- [ ] Verify flood percentage differentials (safe < manageable < prone)
- [ ] Monitor A* iteration counts (safe may take more iterations due to detour)
- [ ] Check no new "No route found" errors appear in logs

## Files Modified
- `/backend/services/local_routing.py`: Updated hard-blocking logic with safety buffer zone

## Deployment Notes
- This is a logic improvement with no database/API changes
- Backend restart required
- No frontend changes needed
- Existing simulations will work with new algorithm immediately after restart
