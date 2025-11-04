# Quick Fix: Railway Environment Variables for Transportation Modes

## Problem
Transportation modes (car, motorcycle, walking, bicycle, etc.) all use the same routes in your deployed Railway app because the OSRM Docker containers are not running.

## Quick Fix: Add Railway Environment Variables

Go to your Railway backend service → Variables → Add these:

```env
# OSRM Routing Services (using public OSRM temporarily)
OSRM_DRIVING_URL=https://router.project-osrm.org
OSRM_WALKING_URL=https://routing.openstreetmap.de/routed-foot
OSRM_BICYCLE_URL=https://routing.openstreetmap.de/routed-bike
OSRM_TRUCK_URL=https://router.project-osrm.org
OSRM_JEEPNEY_URL=https://router.project-osrm.org
```

## What This Does

- **Car/Truck/Jeepney**: Use Project OSRM's public driving service
- **Walking**: Use OpenStreetMap Germany's foot routing service
- **Bicycle/Motorcycle**: Use OpenStreetMap Germany's bike routing service

⚠️ **Limitations**:
- Public services use **global OSM data**, not your custom Zamboanga profiles
- Routes may differ from your local Docker setup
- Walking/bicycle routes will be more generic
- Subject to rate limits on public APIs

## Better Long-Term Solution

Deploy your own OSRM containers to Railway (see RAILWAY_OSRM_DEPLOYMENT.md)

## Test After Setting Variables

1. Go to Railway backend → Deploy (redeploy with new environment variables)
2. Wait for deployment to complete
3. Test different transportation modes on your deployed frontend
4. Routes should now be different for car vs walking vs bicycle

## Verify It's Working

Check your Railway backend logs for:
```
🚗 Using OSRM endpoint for 'walking': https://routing.openstreetmap.de/routed-foot/route/v1/foot
🚗 Using OSRM endpoint for 'bicycle': https://routing.openstreetmap.de/routed-bike/route/v1/bicycle
🚗 Using OSRM endpoint for 'car': https://router.project-osrm.org/route/v1/driving
```

If you still see fallback messages, the environment variables weren't set correctly.
