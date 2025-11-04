# Deploy OSRM Services to Railway

## 🚂 Step-by-Step Railway Deployment

Your backend is on Railway and needs access to OSRM routing services. Here's how to deploy them:

### **Option 1: Deploy All 5 OSRM Services (Recommended)**

#### 1. **Login to Railway**

```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login
railway login
```

#### 2. **Link to Your Project**

```bash
cd c:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC
railway link
# Select your existing project
```

#### 3. **Deploy OSRM Driving Service**

```bash
cd osrm-services/driving
railway up --service osrm-driving
```

After deployment, Railway will give you a URL like: `https://osrm-driving-production.up.railway.app`

#### 4. **Deploy OSRM Walking Service**

```bash
cd ../walking
railway up --service osrm-walking
```

#### 5. **Deploy OSRM Bicycle Service**

```bash
cd ../bicycle
railway up --service osrm-bicycle
```

#### 6. **Deploy OSRM Truck Service**

```bash
cd ../truck
railway up --service osrm-truck
```

#### 7. **Deploy OSRM Jeepney Service**

```bash
cd ../jeepney
railway up --service osrm-jeepney
```

### **Configure Environment Variables**

After deploying all services, go to your **backend service** in Railway Dashboard and add these environment variables:

```
OSRM_DRIVING_URL=https://osrm-driving-production.up.railway.app
OSRM_WALKING_URL=https://osrm-walking-production.up.railway.app
OSRM_BICYCLE_URL=https://osrm-bicycle-production.up.railway.app
OSRM_TRUCK_URL=https://osrm-truck-production.up.railway.app
OSRM_JEEPNEY_URL=https://osrm-jeepney-production.up.railway.app
```

Replace the URLs with your actual Railway deployment URLs.

---

## **Option 2: Deploy via Railway Dashboard (GUI Method)**

### **Step 1: Create New Services**

1. Go to https://railway.app/dashboard
2. Select your project
3. Click **"+ New Service"**
4. Choose **"Empty Service"**
5. Name it `osrm-driving`

### **Step 2: Connect GitHub Repo**

1. Go to service settings
2. Click **"Connect Repo"**
3. Select your repo: `Prototyp3html/2025-CP-SafePathZamboanga`
4. Set **Root Directory**: `SafePathZC/osrm-services/driving`
5. Railway will auto-detect the Dockerfile

### **Step 3: Configure Service**

1. Go to **Settings** → **Networking**
2. Click **"Generate Domain"** to get a public URL
3. Note the URL (e.g., `https://osrm-driving-production.up.railway.app`)

### **Step 4: Repeat for All Services**

Create 4 more services:

- `osrm-walking` (root: `SafePathZC/osrm-services/walking`)
- `osrm-bicycle` (root: `SafePathZC/osrm-services/bicycle`)
- `osrm-truck` (root: `SafePathZC/osrm-services/truck`)
- `osrm-jeepney` (root: `SafePathZC/osrm-services/jeepney`)

### **Step 5: Update Backend Environment Variables**

Go to your **backend service** → **Variables** and add:

```
OSRM_DRIVING_URL=https://osrm-driving-production.up.railway.app
OSRM_WALKING_URL=https://osrm-walking-production.up.railway.app
OSRM_BICYCLE_URL=https://osrm-bicycle-production.up.railway.app
OSRM_TRUCK_URL=https://osrm-truck-production.up.railway.app
OSRM_JEEPNEY_URL=https://osrm-jeepney-production.up.railway.app
```

---

## **Cost Estimate**

Railway Free Tier:

- **$5 free credit/month**
- **500 hours execution time**

Each OSRM service uses ~512MB RAM. Estimated cost:

- **5 OSRM services**: ~$20-30/month
- **1 Backend**: ~$5-10/month
- **1 Database**: ~$5-10/month
- **Total**: ~$30-50/month

---

## **Option 3: Free Alternative (Temporary Solution)**

If Railway costs are too high, use **free public OSRM** services temporarily:

### Update Backend Environment Variables:

```
OSRM_DRIVING_URL=https://router.project-osrm.org
OSRM_WALKING_URL=https://routing.openstreetmap.de/routed-foot
OSRM_BICYCLE_URL=https://routing.openstreetmap.de/routed-bike
OSRM_TRUCK_URL=https://router.project-osrm.org
OSRM_JEEPNEY_URL=https://router.project-osrm.org
```

**⚠️ Limitation**: Public OSRM doesn't have your custom Zamboanga profiles, so:

- ✅ Routes will work
- ❌ But truck/jeepney will use generic driving routes
- ❌ No custom Zamboanga road optimizations

---

## **Verification**

After deployment, test each service:

```bash
# Test driving
curl "https://osrm-driving-production.up.railway.app/route/v1/driving/122.0790,6.9214;122.0854,6.9300"

# Test walking
curl "https://osrm-walking-production.up.railway.app/route/v1/foot/122.0790,6.9214;122.0854,6.9300"
```

If you get JSON responses with routes, it's working! 🎉

---

## **Troubleshooting**

### Service won't start?

- Check Railway logs for errors
- Verify Dockerfile is correct
- Ensure OSRM data files are included (27 files per service)

### Routes still identical?

- Verify environment variables are set in backend service
- Check backend logs: Should say "Using Railway URL" not "Using localhost"
- Restart backend service after setting env vars

### Out of memory errors?

- Increase RAM allocation in Railway settings (512MB → 1GB)
- Or deploy fewer services (just driving + walking + bicycle)

---

## **Need Help?**

1. Check Railway logs: `railway logs`
2. Check backend logs for OSRM connection errors
3. Verify OSRM data files are in each `osrm-services/*/data/` directory

**Good luck! 🚀**
