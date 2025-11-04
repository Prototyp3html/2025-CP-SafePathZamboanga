# Deploy All 5 Transportation Modes to Railway

✅ **Correct Dockerfiles are ready in `osrm-services/` directory!**

## Quick Deployment Guide

### Step 1: Go to Railway Dashboard
Visit: https://railway.app/dashboard

### Step 2: Create 5 New Services

For each transportation mode, create a separate service:

#### Service 1: OSRM Driving (Cars, Motorcycles)
1. Click **"+ New"** → **"GitHub Repo"**
2. Select: `Prototyp3html/2025-CP-SafePathZamboanga`
3. Click **"Add variables"** later
4. **Configure:**
   - Service Name: `osrm-driving`
   - Root Directory: `SafePathZC/osrm-services/driving`
   - Click **"Deploy"**
5. After deployment, go to **Settings** → **Networking** → **Generate Domain**
6. Copy the URL (e.g., `https://osrm-driving-production.up.railway.app`)

#### Service 2: OSRM Walking (Pedestrians)
1. Click **"+ New"** → **"GitHub Repo"**
2. Select: `Prototyp3html/2025-CP-SafePathZamboanga`
3. **Configure:**
   - Service Name: `osrm-walking`
   - Root Directory: `SafePathZC/osrm-services/walking`
   - Click **"Deploy"**
4. Generate Domain, copy URL

#### Service 3: OSRM Bicycle
1. Click **"+ New"** → **"GitHub Repo"**
2. Select: `Prototyp3html/2025-CP-SafePathZamboanga`
3. **Configure:**
   - Service Name: `osrm-bicycle`
   - Root Directory: `SafePathZC/osrm-services/bicycle`
   - Click **"Deploy"**
4. Generate Domain, copy URL

#### Service 4: OSRM Truck
1. Click **"+ New"** → **"GitHub Repo"**
2. Select: `Prototyp3html/2025-CP-SafePathZamboanga`
3. **Configure:**
   - Service Name: `osrm-truck`
   - Root Directory: `SafePathZC/osrm-services/truck`
   - Click **"Deploy"**
4. Generate Domain, copy URL

#### Service 5: OSRM Jeepney (Public Transport)
1. Click **"+ New"** → **"GitHub Repo"**
2. Select: `Prototyp3html/2025-CP-SafePathZamboanga`
3. **Configure:**
   - Service Name: `osrm-jeepney`
   - Root Directory: `SafePathZC/osrm-services/jeepney`
   - Click **"Deploy"**
4. Generate Domain, copy URL

### Step 3: Configure Backend Environment Variables

Go to your **Backend Service** in Railway → **Variables** → Add these:

```bash
OSRM_DRIVING_URL=https://osrm-driving-production.up.railway.app
OSRM_WALKING_URL=https://osrm-walking-production.up.railway.app
OSRM_BICYCLE_URL=https://osrm-bicycle-production.up.railway.app
OSRM_TRUCK_URL=https://osrm-truck-production.up.railway.app
OSRM_JEEPNEY_URL=https://osrm-jeepney-production.up.railway.app
```

**⚠️ Replace the URLs with your actual Railway URLs!**

### Step 4: Restart Backend

After adding the environment variables:
1. Go to your backend service
2. Click **"Redeploy"** or **"Restart"**

### Step 5: Test Each Transportation Mode

Visit your deployed site: https://safepath-zamboanga-city.vercel.app

Try routing with:
- 🚗 Car (should use driving profile)
- 🚶 Walking (should use foot profile)
- 🚲 Bicycle (should use bicycle profile)
- 🚚 Truck (should use truck profile)
- 🚌 Jeepney/Public Transport (should use jeepney profile)

**Each mode should now show DIFFERENT routes!** ✅

---

## Expected Costs

Railway pricing (after free $5 credit):

| Service | RAM | Cost/Month |
|---------|-----|------------|
| OSRM Driving | 512MB | ~$5-7 |
| OSRM Walking | 512MB | ~$5-7 |
| OSRM Bicycle | 512MB | ~$5-7 |
| OSRM Truck | 512MB | ~$5-7 |
| OSRM Jeepney | 512MB | ~$5-7 |
| **Total OSRM** | **2.5GB** | **~$25-35** |
| Backend API | 256MB | ~$5-10 |
| PostgreSQL | 256MB | ~$5-10 |
| **GRAND TOTAL** | | **~$35-55/month** |

---

## Free Alternative (Temporary Solution)

If cost is an issue, use **free public OSRM** temporarily:

### Backend Environment Variables (Free):
```bash
OSRM_DRIVING_URL=https://router.project-osrm.org
OSRM_WALKING_URL=https://routing.openstreetmap.de/routed-foot
OSRM_BICYCLE_URL=https://routing.openstreetmap.de/routed-bike
OSRM_TRUCK_URL=https://router.project-osrm.org
OSRM_JEEPNEY_URL=https://router.project-osrm.org
```

**Pros:** Free, works immediately  
**Cons:** Generic worldwide routing, no Zamboanga customizations

---

## Troubleshooting

### Routes still identical?
1. Check Railway logs for OSRM services
2. Verify environment variables are set in backend
3. Test OSRM endpoints directly:
   ```bash
   curl "https://osrm-driving-production.up.railway.app/route/v1/driving/122.0790,6.9214;122.0854,6.9300"
   ```

### Service won't start?
1. Check Railway build logs
2. Verify Dockerfile exists in correct directory
3. Ensure all `.osrm*` files are in `data/` folder

### Out of memory errors?
1. Increase RAM: Railway Settings → Resources → 512MB → 1GB
2. Or deploy fewer services (just driving, walking, bicycle)

---

## Need Help?

Check Railway logs:
```bash
railway logs --service osrm-driving
```

Or contact Railway support: https://railway.app/help

**Good luck! 🚀**
