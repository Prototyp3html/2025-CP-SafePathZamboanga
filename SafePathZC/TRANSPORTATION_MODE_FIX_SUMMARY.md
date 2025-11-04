# Transportation Mode Routing - FIXED!

## Problem Summary

**Issue**: In your deployed Railway app, all transportation modes (car, motorcycle, walking, bicycle, truck, public transport) were using the same driving routes. But on localhost with Docker, each mode had its own unique routes.

**Root Cause**: 
1. Your localhost Docker Compose runs 5 separate OSRM routing containers (driving, walking, bicycle, truck, jeepney)
2. Your Railway deployment does NOT have these OSRM containers running
3. The backend code was incorrectly falling back to driving for all modes when it detected production

## What I Fixed

### 1. Fixed Fallback Logic (`transportation_modes.py`)
**Before**: Code was falling back to driving mode when it detected ANY production environment or PORT variable
```python
is_production = os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("PORT") or not preferred_url.startswith("http://localhost:")
```

**After**: Code only falls back when BOTH conditions are true:
- Running on Railway (RAILWAY_ENVIRONMENT exists)
- AND no environment variable was set (URL is still localhost)
```python
is_railway = os.getenv("RAILWAY_ENVIRONMENT") is not None
is_localhost_url = preferred_url.startswith("http://localhost:")
if is_railway and is_localhost_url:
    # Fallback to driving
```

This means if you SET the environment variables on Railway, it will use them!

### 2. Restored Proper OSRM Profiles
Changed the profiles back to their correct values:
- **Walking**: `foot` profile (instead of `driving`)
- **Bicycle/Motorcycle**: `bicycle` profile (instead of `driving`)
- **Car/Truck/Jeepney**: `driving` profile (correct)

## How to Deploy the Fix

### Step 1: Commit and Push Changes
```bash
cd SafePathZC
git add backend/services/transportation_modes.py
git commit -m "Fix transportation mode routing for Railway deployment"
git push origin main
```

### Step 2: Add Environment Variables to Railway

Go to your Railway backend service → **Variables** tab → Add these:

```env
OSRM_DRIVING_URL=https://router.project-osrm.org
OSRM_WALKING_URL=https://routing.openstreetmap.de/routed-foot
OSRM_BICYCLE_URL=https://routing.openstreetmap.de/routed-bike
OSRM_TRUCK_URL=https://router.project-osrm.org
OSRM_JEEPNEY_URL=https://router.project-osrm.org
```

### Step 3: Redeploy Railway Backend

Railway should automatically redeploy when you push. If not:
1. Go to Railway Dashboard → Your Backend Service
2. Click "Deploy" → "Deploy Latest"
3. Wait for deployment to complete

### Step 4: Pull Changes on Vercel Frontend

Your Vercel frontend should auto-deploy when you push, but if not:
1. Go to Vercel Dashboard → Your Project
2. Click "Redeploy" to get latest frontend code

## Verify It's Working

### Test on Deployed Site
1. Go to your deployed app: https://safepath-zamboanga-city.vercel.app
2. Select different transportation modes (car, walking, bicycle)
3. Plan a route
4. **Routes should now be DIFFERENT for each mode!**
   - Walking: Shorter, more direct paths (pedestrian routes)
   - Bicycle: Can use smaller roads, bike paths
   - Car: Uses main roads and highways
   - Truck: Similar to car but avoids narrow streets

### Check Railway Logs
Look for these messages in Railway backend logs:
```
🚗 Using OSRM endpoint for 'walking': https://routing.openstreetmap.de/routed-foot/route/v1/foot
🚗 Using OSRM endpoint for 'bicycle': https://routing.openstreetmap.de/routed-bike/route/v1/bicycle
🚗 Using OSRM endpoint for 'car': https://router.project-osrm.org/route/v1/driving
```

If you see these, it's working! ✅

If you see fallback messages, the environment variables weren't set correctly. ❌

## Limitations of Public OSRM

**Note**: Using public OSRM services means:
- ✅ Routes will be different for each transportation mode
- ❌ Routes use GLOBAL OpenStreetMap data (not your custom Zamboanga profiles)
- ❌ Walking/bicycle routes may not match your local Docker routes exactly
- ❌ Subject to rate limits on public APIs
- ❌ Less control over routing profiles

## Long-Term Solution (Optional)

For production-quality routing with your custom Zamboanga profiles:

1. Deploy your own OSRM containers to Railway as separate services
2. Upload your `osrm-data` folder to Railway volumes
3. Set environment variables to point to your Railway OSRM services

See `RAILWAY_OSRM_DEPLOYMENT.md` for detailed instructions.

**Cost**: ~$20/month for Railway Pro (needed for 5 OSRM services + backend + database)

## Files Changed
- ✅ `backend/services/transportation_modes.py` - Fixed fallback logic and profiles
- ✅ `QUICK_FIX_RAILWAY_ENV.md` - Environment variable guide
- ✅ `RAILWAY_OSRM_DEPLOYMENT.md` - Long-term deployment guide
- ✅ `TRANSPORTATION_MODE_FIX_SUMMARY.md` - This file

## Testing Checklist
- [ ] Committed and pushed changes to GitHub
- [ ] Added environment variables to Railway backend
- [ ] Railway backend redeployed successfully
- [ ] Tested car mode on deployed site
- [ ] Tested walking mode on deployed site (different route than car)
- [ ] Tested bicycle mode on deployed site (different route than car)
- [ ] Checked Railway logs for correct OSRM endpoints
- [ ] Verified routes are visually different on map

## Questions?
If routes are still the same:
1. Check Railway backend logs for fallback messages
2. Verify environment variables are set correctly
3. Try redeploying manually
4. Clear browser cache and reload frontend
