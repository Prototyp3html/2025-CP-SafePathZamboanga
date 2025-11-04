# Railway OSRM Deployment Guide

## Problem
Your deployed app on Railway doesn't have the OSRM routing containers, so all transportation modes (car, motorcycle, walking, bicycle, truck, public transport) are using the same driving routes.

## Solution: Deploy OSRM Services to Railway

### Step 1: Deploy OSRM-Driving Service
1. Go to Railway Dashboard → New Service → Docker Image
2. Use image: `osrm/osrm-backend`
3. Set service name: `osrm-driving`
4. Add volume mount: Upload your `osrm-data` folder
5. Set command: `osrm-routed --algorithm mld /data/zamboanga-driving.osrm`
6. Expose port: 5000
7. Get the public URL (e.g., `https://osrm-driving-production.up.railway.app`)

### Step 2: Deploy OSRM-Walking Service
1. Create another service: `osrm-walking`
2. Same image: `osrm/osrm-backend`
3. Command: `osrm-routed --algorithm mld /data/zamboanga-foot.osrm`
4. Port: 5000 (Railway will map it externally)
5. Get public URL

### Step 3: Deploy OSRM-Bicycle Service
1. Create service: `osrm-bicycle`
2. Command: `osrm-routed --algorithm mld /data/zamboanga-bicycle.osrm`
3. Get public URL

### Step 4: Deploy OSRM-Truck Service
1. Create service: `osrm-truck`
2. Command: `osrm-routed --algorithm mld /data/zamboanga-truck.osrm`
3. Get public URL

### Step 5: Deploy OSRM-Jeepney Service
1. Create service: `osrm-jeepney`
2. Command: `osrm-routed --algorithm mld /data/zamboanga-jeepney.osrm`
3. Get public URL

### Step 6: Update Backend Environment Variables
In your Railway backend service, add these environment variables:
```
OSRM_DRIVING_URL=https://osrm-driving-production.up.railway.app
OSRM_WALKING_URL=https://osrm-walking-production.up.railway.app
OSRM_BICYCLE_URL=https://osrm-bicycle-production.up.railway.app
OSRM_TRUCK_URL=https://osrm-truck-production.up.railway.app
OSRM_JEEPNEY_URL=https://osrm-jeepney-production.up.railway.app
```

### Step 7: Verify Deployment
Test each OSRM service:
```bash
# Test driving
curl "https://osrm-driving-production.up.railway.app/route/v1/driving/122.0790,6.9214;122.0850,6.9300?overview=false"

# Test walking
curl "https://osrm-walking-production.up.railway.app/route/v1/foot/122.0790,6.9214;122.0850,6.9300?overview=false"

# Test bicycle
curl "https://osrm-bicycle-production.up.railway.app/route/v1/bicycle/122.0790,6.9214;122.0850,6.9300?overview=false"
```

## Alternative: Use Public OSRM (Not Recommended for Production)
If you can't deploy OSRM to Railway, temporarily use public OSRM:

```env
OSRM_DRIVING_URL=https://router.project-osrm.org
OSRM_WALKING_URL=https://router.project-osrm.org
OSRM_BICYCLE_URL=https://router.project-osrm.org
```

**⚠️ Warning**: Public OSRM uses global data and won't have your custom Zamboanga profiles.

## Cost Estimation
Railway free tier has limitations:
- Each OSRM service needs ~512MB RAM
- 5 services = ~2.5GB RAM total
- May require Railway Pro plan ($20/month)

## Alternative: Single OSRM with Multiple Profiles
To save resources, you can create a single OSRM service that handles all profiles by:
1. Creating a custom Docker image that runs all profiles on different ports
2. Using OSRM multi-profile routing
3. But this is more complex to set up

## Files Needed
You need to upload these OSRM data files to Railway volumes:
- zamboanga-driving.osrm (+ all .osrm.* files)
- zamboanga-foot.osrm (+ all .osrm.* files)
- zamboanga-bicycle.osrm (+ all .osrm.* files)
- zamboanga-truck.osrm (+ all .osrm.* files)
- zamboanga-jeepney.osrm (+ all .osrm.* files)

Total size: Check your `osrm-data` folder size.
