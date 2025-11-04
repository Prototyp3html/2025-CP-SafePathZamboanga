# Deploy Your Custom OSRM to Railway

## What This Does
Deploy YOUR custom Zamboanga OSRM routing data (that you built with your osrm-data files) to Railway, so each transportation mode uses its own unique routing profile.

## Prerequisites
- ✅ You already have the OSRM data files built in `backend/osrm-data/`
- ✅ Railway account
- ✅ GitHub repository connected to Railway

## Option 1: Deploy All OSRM Services Separately (Full Solution)

This deploys 5 separate OSRM services on Railway, each with your custom data.

### Step 1: Copy OSRM Data Files

For each service, we need to copy the relevant `.osrm` files:

```powershell
# Create service directories and copy data
cd SafePathZC

# Driving service
mkdir osrm-services\driving\data
Copy-Item backend\osrm-data\zamboanga-driving.osrm* osrm-services\driving\data\

# Walking service
mkdir osrm-services\walking\data
Copy-Item backend\osrm-data\zamboanga-foot.osrm* osrm-services\walking\data\

# Bicycle service
mkdir osrm-services\bicycle\data
Copy-Item backend\osrm-data\zamboanga-bicycle.osrm* osrm-services\bicycle\data\

# Truck service
mkdir osrm-services\truck\data
Copy-Item backend\osrm-data\zamboanga-truck.osrm* osrm-services\truck\data\

# Jeepney service
mkdir osrm-services\jeepney\data
Copy-Item backend\osrm-data\zamboanga-jeepney.osrm* osrm-services\jeepney\data\
```

### Step 2: Create Dockerfiles

Create a Dockerfile in each service directory:

**`osrm-services/driving/Dockerfile`:**
```dockerfile
FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-driving.osrm", "--ip", "0.0.0.0", "--port", "5000"]
```

**`osrm-services/walking/Dockerfile`:**
```dockerfile
FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-foot.osrm", "--ip", "0.0.0.0", "--port", "5000"]
```

**`osrm-services/bicycle/Dockerfile`:**
```dockerfile
FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-bicycle.osrm", "--ip", "0.0.0.0", "--port", "5000"]
```

**`osrm-services/truck/Dockerfile`:**
```dockerfile
FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-truck.osrm", "--ip", "0.0.0.0", "--port", "5000"]
```

**`osrm-services/jeepney/Dockerfile`:**
```dockerfile
FROM osrm/osrm-backend
COPY data/ /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-jeepney.osrm", "--ip", "0.0.0.0", "--port", "5000"]
```

### Step 3: Push to GitHub

```bash
git add osrm-services/
git commit -m "Add OSRM service Dockerfiles for Railway deployment"
git push origin main
```

### Step 4: Deploy to Railway

For each service:

1. **Go to Railway Dashboard** → New → Deploy from GitHub Repo
2. **Select your repo** → Select Root Directory
3. **Set Build Context:**
   - Service 1: `osrm-services/driving`
   - Service 2: `osrm-services/walking`
   - Service 3: `osrm-services/bicycle`
   - Service 4: `osrm-services/truck`
   - Service 5: `osrm-services/jeepney`
4. Railway will automatically detect the Dockerfile
5. **Important**: Set memory limits (each service needs ~512MB-1GB)
6. Get the public URL for each service

### Step 5: Configure Backend Environment Variables

Once all services are deployed, add these to your Railway **backend** service:

```env
OSRM_DRIVING_URL=https://osrm-driving-production.up.railway.app
OSRM_WALKING_URL=https://osrm-walking-production.up.railway.app
OSRM_BICYCLE_URL=https://osrm-bicycle-production.up.railway.app
OSRM_TRUCK_URL=https://osrm-truck-production.up.railway.app
OSRM_JEEPNEY_URL=https://osrm-jeepney-production.up.railway.app
```

(Replace with your actual Railway URLs)

### Step 6: Test Deployment

Test each OSRM service:
```bash
# Test driving
curl "https://osrm-driving-production.up.railway.app/route/v1/driving/122.0790,6.9214;122.0850,6.9300?overview=false"

# Should return JSON with "Ok" code
```

## Option 2: Single Monorepo Deployment (Simpler)

Deploy all OSRM services from a single Railway project using monorepo setup.

### Create `railway.json` in root:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Then create 5 separate Railway services, each pointing to a different Dockerfile path.

## Cost Estimation

**Railway Free Tier:**
- $5 free credit/month
- Each OSRM service: ~$3-5/month
- 5 services = ~$15-25/month

**Railway Pro:**
- $20/month + usage
- Better for production

## File Size Check

Check your OSRM data file sizes:
```powershell
Get-ChildItem backend\osrm-data\zamboanga-*.osrm* | Measure-Object -Property Length -Sum | Select-Object @{Name="TotalMB";Expression={$_.Sum/1MB}}
```

If files are very large (>500MB each), Railway deployment may be slow or expensive.

## Troubleshooting

**"Service crashed on startup":**
- Check Railway logs
- Ensure `.osrm` files are properly copied
- Try using `--algorithm ch` instead of `mld`

**"Out of memory":**
- Increase Railway service memory limit
- Consider using smaller OSRM files

**"Files not found":**
- Verify Dockerfile COPY paths
- Check that all `.osrm.*` files are included (not just `.osrm`)

## Alternative: Use GitHub Releases

If OSRM files are too large for Git:
1. Upload to GitHub Releases as zip files
2. Download in Dockerfile during build:
```dockerfile
FROM osrm/osrm-backend
RUN wget https://github.com/youruser/yourrepo/releases/download/v1.0/driving-data.zip && \
    unzip driving-data.zip -d /data/
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "/data/zamboanga-driving.osrm", "--ip", "0.0.0.0", "--port", "5000"]
```

## Next Steps

1. Run the PowerShell commands to copy OSRM data files
2. Create the Dockerfiles in each service directory
3. Commit and push to GitHub
4. Deploy each service to Railway
5. Update backend environment variables with Railway URLs
6. Test your deployed app with different transportation modes!
