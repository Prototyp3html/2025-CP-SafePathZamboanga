# ✅ SOLUTION: Deploy Your Custom OSRM to Railway

## Problem Solved
Your transportation modes now work in localhost (Docker) but not in deployment because Railway doesn't have your OSRM routing containers running.

## What I Created
✅ **5 OSRM service directories** ready for Railway deployment:
- `osrm-services/driving/` - Car/truck routing (27 files, ~21 MB)
- `osrm-services/walking/` - Pedestrian routing (27 files, ~21 MB)
- `osrm-services/bicycle/` - Bicycle/motorcycle routing (27 files, ~21 MB)
- `osrm-services/truck/` - Heavy vehicle routing (27 files, ~21 MB)
- `osrm-services/jeepney/` - Public transport routing (27 files, ~21 MB)

**Total size**: ~104 MB (your custom Zamboanga routing data)

Each directory contains:
- ✅ Dockerfile (configured to use YOUR custom OSRM data)
- ✅ data/ folder (with all your pre-built .osrm files)

## Quick Start: Deploy to Railway

### Step 1: Commit to GitHub
```bash
git add osrm-services/
git add backend/services/transportation_modes.py
git add DEPLOY_CUSTOM_OSRM_TO_RAILWAY.md
git commit -m "Add custom OSRM services for Railway deployment"
git push origin main
```

### Step 2: Deploy Each OSRM Service to Railway

**For EACH of the 5 services**, do this:

1. Go to **Railway Dashboard** → Click "New" → "GitHub Repo"
2. Select your repository: `2025-CP-SafePathZamboanga`
3. Click "Add Service"
4. **Configure the service:**
   - Name: `osrm-driving` (or walking, bicycle, truck, jeepney)
   - Root Directory: `SafePathZC/osrm-services/driving` (change for each service)
   - Railway will auto-detect the Dockerfile ✅
5. Click "Deploy"
6. Wait for build to complete (~2-3 minutes)
7. Go to Settings → **Generate Domain** (to get public URL)
8. Copy the URL (e.g., `https://osrm-driving-production.up.railway.app`)

**Repeat 5 times** for:
- `osrm-services/driving` → Get URL
- `osrm-services/walking` → Get URL
- `osrm-services/bicycle` → Get URL
- `osrm-services/truck` → Get URL
- `osrm-services/jeepney` → Get URL

### Step 3: Update Backend Environment Variables

Go to your **Railway backend service** → Variables → Add these:

```env
OSRM_DRIVING_URL=https://osrm-driving-production.up.railway.app
OSRM_WALKING_URL=https://osrm-walking-production.up.railway.app
OSRM_BICYCLE_URL=https://osrm-bicycle-production.up.railway.app
OSRM_TRUCK_URL=https://osrm-truck-production.up.railway.app
OSRM_JEEPNEY_URL=https://osrm-jeepney-production.up.railway.app
```

(Replace with your actual Railway URLs)

### Step 4: Redeploy Backend

Your backend should auto-redeploy. If not:
- Go to Railway backend service → Click "Deploy"

### Step 5: Test!

1. Go to your deployed app
2. Select "Walking" mode → Plan a route
3. Select "Bicycle" mode → Plan the same route
4. **Routes should be DIFFERENT!** ✅

## Verify It's Working

Check Railway backend logs for:
```
🚗 Using OSRM endpoint for 'walking': https://osrm-walking-production.up.railway.app/route/v1/foot
🚗 Using OSRM endpoint for 'bicycle': https://osrm-bicycle-production.up.railway.app/route/v1/bicycle
🚗 Using OSRM endpoint for 'car': https://osrm-driving-production.up.railway.app/route/v1/driving
```

## Cost Estimate

**Railway Pricing:**
- Each OSRM service: ~$3-5/month (512MB RAM, minimal CPU)
- 5 OSRM services: ~$15-25/month
- Backend service: ~$5/month
- Database service: ~$5/month
- **Total: ~$25-35/month**

Railway free tier gives $5 credit, so you'll need the **Hobby plan ($5/month)** or **Pro plan ($20/month)**.

## Test OSRM Endpoints

Once deployed, test each service:

```bash
# Test driving
curl "https://osrm-driving-production.up.railway.app/route/v1/driving/122.0790,6.9214;122.0850,6.9300?overview=false"

# Test walking
curl "https://osrm-walking-production.up.railway.app/route/v1/foot/122.0790,6.9214;122.0850,6.9300?overview=false"

# Test bicycle
curl "https://osrm-bicycle-production.up.railway.app/route/v1/bicycle/122.0790,6.9214;122.0850,6.9300?overview=false"
```

Should return JSON with `"code": "Ok"` ✅

## Troubleshooting

**"Service crashed on startup":**
- Check Railway logs
- Ensure root directory is correct: `SafePathZC/osrm-services/driving`
- Check that Dockerfile exists in that directory

**"Out of memory":**
- Increase Railway service memory to 1GB
- Settings → Resources → Memory → 1024 MB

**"Build failed - COPY failed":**
- Verify the `data/` directory exists with .osrm files
- Check Git pushed all files (not ignored by .gitignore)

**"Backend still using fallback":**
- Verify environment variables are set correctly on Railway backend
- Check for typos in URLs
- Redeploy backend service manually

## What You Get

With this setup, each transportation mode will use YOUR custom Zamboanga routing profiles:
- ✅ **Car**: Uses your driving profile (main roads, highways)
- ✅ **Walking**: Uses your foot profile (sidewalks, pedestrian paths)
- ✅ **Bicycle**: Uses your bicycle profile (bike lanes, smaller roads)
- ✅ **Motorcycle**: Uses bicycle profile (can navigate smaller roads)
- ✅ **Truck**: Uses driving profile (avoids narrow streets)
- ✅ **Public Transport**: Uses jeepney profile (main routes)

**No more generic public OSRM data!** 🎉

## Files Changed
- ✅ `backend/services/transportation_modes.py` - Fixed fallback logic
- ✅ `osrm-services/` - Created 5 OSRM service directories
- ✅ `setup-osrm-services.ps1` - Automated setup script
- ✅ `DEPLOY_CUSTOM_OSRM_TO_RAILWAY.md` - Detailed guide
- ✅ `RAILWAY_DEPLOYMENT_FINAL.md` - This file

## Questions?

If you need help:
1. Check Railway service logs for errors
2. Verify Dockerfile paths
3. Test OSRM endpoints with curl
4. Confirm environment variables are set
