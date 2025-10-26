# Flood Risk Routing Optimization

## System Purpose
**SafePathZamboanga is a FLOOD DISASTER RISK ANALYSIS system**, not a navigation app like Google Maps.

### Core Feature: 3 Routes with Different Flood Risk Levels
- 🟢 **Green Route (SAFE)**: Avoids flooded roads - for emergency vehicles, evacuation
- 🟠 **Orange Route (MANAGEABLE)**: Moderate flood exposure - for cautious travel
- 🔴 **Red Route (PRONE)**: Shortest path regardless of flood risk - shows dangerous areas

---

## Critical Balance: Speed vs Flood Risk Diversity

### Problem with High Heuristic Weight
When `HEURISTIC_WEIGHT = 15.0` (previous setting):
- A* becomes **greedy best-first search** - rushes straight to goal
- **Ignores flood penalties** - all 3 routes become identical
- Fast (5-20 seconds) but **defeats the purpose** of the system

### Solution: Moderate Heuristic Weight
Current setting: `HEURISTIC_WEIGHT = 3.0`
- A* **explores alternative paths** to avoid flooded roads
- **Respects flood risk penalties** - creates distinct routes
- Balanced performance: **15-45 seconds** per route calculation
- **Preserves the core feature** of flood risk analysis

---

## Flood Risk Penalties (Updated)

### Safe Route (Green) - `risk_profile="safe"`
```python
flood_factor = 15.0 if is_flooded else 1.0
```
- **15x penalty** for flooded roads
- Forces route to take significant detours around flood zones
- Best for emergency response and evacuation planning

### Manageable Route (Orange) - `risk_profile="manageable"`
```python
flood_factor = 4.0 if is_flooded else 1.0
```
- **4x penalty** for flooded roads
- Balances flood avoidance with route efficiency
- Suitable for cautious travel during flood season

### Prone Route (Red) - `risk_profile="prone"`
```python
flood_factor = 1.0 if is_flooded else 1.0
```
- **No penalty** for flooded roads
- Shows the shortest path regardless of safety
- Highlights dangerous areas that should be avoided

---

## A* Algorithm Parameters (Optimized for Flood Analysis)

### Performance Settings
```python
max_iterations = 25000           # Allow exploration of flood-safe alternatives
max_stagnant_iterations = 1500   # Don't give up too quickly
max_detour_factor = 3.0          # Allow detours to avoid flooded roads
neighbor_limit = 25              # Explore enough alternatives
HEURISTIC_WEIGHT = 3.0           # CRITICAL: Moderate weight for path diversity
```

### Why These Settings?
- **Higher iteration limits**: Need time to find flood-safe detours
- **Larger detour factor**: Flood avoidance requires going around hazards
- **More neighbor exploration**: Consider multiple flood-safe alternatives
- **Lower heuristic weight**: Don't rush to goal - explore safer paths

---

## Expected Performance

### Route Calculation Time
- **Safe route**: 20-60 seconds (most exploration needed)
- **Manageable route**: 15-45 seconds (moderate exploration)
- **Prone route**: 10-30 seconds (minimal exploration)

### Route Differentiation
✅ **All 3 routes should be DIFFERENT**
- Green avoids flooded areas (longer path)
- Orange balances safety and efficiency (medium path)
- Red takes shortest route (may cross flood zones)

---

## Transportation Mode Integration

Each transportation mode (car/motorcycle/walking) gets **3 distinct flood risk routes**:
- Walking: 9 routes total (3 modes × 3 risk levels)
- All routes respect both mode restrictions AND flood risk

### Example: Walking + Safe Route
- Blocks highways (transportation mode filter)
- Avoids flooded roads (15x penalty)
- Result: Safest pedestrian route during floods

---

## Key Takeaway

**This system is NOT about finding the fastest route.**

It's about showing people:
1. ✅ **Where floods are** (red route shows dangerous areas)
2. ✅ **How to avoid them** (green route shows safe alternatives)
3. ✅ **The trade-offs** (orange route shows moderate options)

**Performance is secondary to flood risk analysis accuracy.**

30-60 seconds to calculate flood-safe evacuation routes is acceptable for disaster management.

---

## Testing Checklist

After these changes, verify:
- [ ] All 3 routes are **visibly different** paths
- [ ] Green route **clearly avoids** flooded areas (check map overlay)
- [ ] Red route takes **shortest path** (may cross flood zones)
- [ ] Orange route is **between** green and red
- [ ] Route calculation completes in **15-60 seconds**
- [ ] Backend logs show different `risk_profile` values
- [ ] Map displays correct color coding (green/orange/red)

---

## File Modified
`SafePathZC/backend/services/local_routing.py`

**Key Changes:**
1. Reduced `HEURISTIC_WEIGHT` from 15.0 → 3.0
2. Increased flood penalties: safe 5.5x → 15.0x, manageable 3.0x → 4.0x
3. Increased exploration limits: iterations 10K → 25K, stagnant 500 → 1500
4. Increased neighbor exploration: 15 → 25 connections per node
5. Increased detour tolerance: 2.5x → 3.0x

**Result:** Flood risk routes should now be **distinct and meaningful** for disaster analysis.
