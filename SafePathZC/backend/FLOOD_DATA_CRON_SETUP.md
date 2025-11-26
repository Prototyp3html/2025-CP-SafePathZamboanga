# Automatic Flood Data Update Configuration

## Overview

Your SafePath backend now includes automatic flood data updates every 6 hours. The system will:

1. ✅ Fetch latest road data from OpenStreetMap
2. ✅ Get real-time elevation from Open-Elevation API
3. ✅ Check current weather/rainfall from Open-Meteo
4. ✅ Calculate flood risks and generate updated `terrain_roads.geojson`
5. ✅ Categorize routes as: **Safe**, **Manageable**, or **Flood-Prone**

## Setup Options

### Option 1: Railway Premium Cron Jobs (Recommended if using Railway)

**Cost:** Included in Railway Premium ($20/month or more)

The `railway.toml` file is already configured with:

```toml
[[jobs]]
name = "flood-data-update"
startCommand = "curl -X POST https://$RAILWAY_DOMAIN/cron/flood-data-update -H 'X-Cron-Secret: $CRON_SECRET'"
schedule = "0 */6 * * *"  # Every 6 hours
```

**Steps:**

1. Upgrade your Railway project to Premium
2. Ensure `CRON_SECRET` is set in your Railway environment variables:
   - Go to Railway Dashboard → Your Project → Variables
   - Set `CRON_SECRET=safepath-flood-update-secret-key-2025` (or change to a secure value)
3. Deploy the updated code (already configured in `railway.toml`)
4. Railway will automatically run the job every 6 hours at 00:00, 06:00, 12:00, 18:00

---

### Option 2: EasyCron (Free External Service - Works with Any Host)

**Cost:** FREE (with rate limits) or $5/month for unlimited

This works even with Railway Free tier or any hosting provider.

**Steps:**

1. **Sign up for EasyCron:**

   - Visit: https://www.easycron.com
   - Create a free account

2. **Create a new cron job:**

   - **Cron Expression:** `0 */6 * * *` (Every 6 hours)
   - **URL to call:** `https://safepath-zc-production.up.railway.app/cron/flood-data-update`
   - **HTTP Method:** POST
   - **Headers:** Add custom header
     - Name: `X-Cron-Secret`
     - Value: `safepath-flood-update-secret-key-2025`

3. **Expected Response:**

   ```json
   {
     "status": "success",
     "message": "Flood data updated successfully",
     "timestamp": "2025-11-26T14:30:00.123456",
     "stats": {
       "total_roads": 2845,
       "flooded_roads": 127,
       "current_rainfall_mm": 2.5,
       "updated_file": "/app/data/terrain_roads.geojson"
     }
   }
   ```

4. **Monitor:** EasyCron will show execution logs and success/failure status

---

### Option 3: GitHub Actions (Free, Integrated with Your Repo)

**Cost:** FREE (included with GitHub)

**Steps:**

1. **Create `.github/workflows/flood-update-cron.yml`:**

   ```yaml
   name: Flood Data Update Cron

   on:
     schedule:
       - cron: "0 */6 * * *" # Every 6 hours UTC
     workflow_dispatch: # Manual trigger option

   jobs:
     update-flood-data:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger flood data update
           run: |
             curl -X POST \
               https://safepath-zc-production.up.railway.app/cron/flood-data-update \
               -H "X-Cron-Secret: ${{ secrets.CRON_SECRET }}" \
               -H "Content-Type: application/json"
   ```

2. **Add GitHub Secret:**

   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Create new secret: `CRON_SECRET=safepath-flood-update-secret-key-2025`

3. **GitHub will automatically run the job every 6 hours**

---

### Option 4: Google Cloud Scheduler (Free tier available)

**Cost:** Free for first 3 jobs

**Steps:**

1. **Go to Google Cloud Scheduler:** https://console.cloud.google.com/cloudscheduler
2. **Create a new job:**
   - Name: `safepath-flood-update`
   - Frequency: `0 */6 * * *` (every 6 hours)
   - Timezone: Select Asia/Manila (UTC+8)
   - Execution type: HTTP
   - URL: `https://safepath-zc-production.up.railway.app/cron/flood-data-update`
   - HTTP method: POST
   - Auth header: Add `X-Cron-Secret: safepath-flood-update-secret-key-2025`

---

## API Endpoint Details

### Trigger Flood Data Update

**Endpoint:** `POST /cron/flood-data-update`

**Required Headers:**

- `X-Cron-Secret: your-secret-key` (must match `CRON_SECRET` env variable)

**Response (Success):**

```json
{
  "status": "success",
  "message": "Flood data updated successfully",
  "timestamp": "2025-11-26T14:30:00.123456",
  "stats": {
    "total_roads": 2845,
    "flooded_roads": 127,
    "current_rainfall_mm": 2.5,
    "updated_file": "/app/data/terrain_roads.geojson"
  }
}
```

**Response (Error - Missing Secret):**

```json
{
  "detail": "Missing authorization header"
}
```

**Response (Error - Invalid Secret):**

```json
{
  "detail": "Invalid credentials"
}
```

---

### Health Check

**Endpoint:** `GET /cron/cron-health`

**Response:**

```json
{
  "status": "ok",
  "service": "SafePath Cron Jobs",
  "timestamp": "2025-11-26T14:30:00.123456",
  "last_cron_secret_set": true
}
```

---

## What Gets Updated

Every 6 hours, the system:

1. **Fetches Current Data:**

   - Latest road network from OpenStreetMap
   - Real-time elevation data for all roads
   - Current rainfall and weather conditions

2. **Calculates Flood Risk** based on:

   - **Terrain elevation** (lower = higher risk)
   - **Current rainfall** (more rain = higher risk)
   - **Distance to water bodies** (closer = higher risk)
   - **Known flood-prone zones** (historical data)

3. **Generates Three Route Categories:**

   ```
   Safe Routes: flood_score < 20
   ├─ No current flooding
   └─ Recommended for all users

   Manageable Routes: flood_score 20-39
   ├─ Low-to-medium flood risk
   └─ Recommended with caution

   Flood-Prone Routes: flood_score ≥ 40
   ├─ High flood risk
   └─ Not recommended during heavy rain
   ```

4. **Stores in:** `/app/data/terrain_roads.geojson`
   - This file is used by the routing engine
   - Frontend automatically uses updated data on next route calculation

---

## Monitoring

### Check Latest Update

```bash
# SSH into Railway backend
railway run bash

# View the update log
cat logs/flood_updates.log

# Check the generated file
ls -lah data/terrain_roads.geojson

# View file contents (first 50 lines)
head -50 data/terrain_roads.geojson
```

### Check via API

```bash
# Health check
curl https://safepath-zc-production.up.railway.app/cron/cron-health

# Trigger manual update (replace SECRET with your actual secret)
curl -X POST \
  https://safepath-zc-production.up.railway.app/cron/flood-data-update \
  -H "X-Cron-Secret: safepath-flood-update-secret-key-2025"
```

---

## Troubleshooting

### Cron job not running?

1. **Check if endpoint is accessible:**

   ```bash
   curl https://safepath-zc-production.up.railway.app/cron/cron-health
   ```

   Should return: `{"status":"ok",...}`

2. **Check CRON_SECRET is set:**

   ```bash
   # On Railway
   railway run echo $CRON_SECRET
   ```

3. **Check backend logs:**

   - Railway Dashboard → Your Project → Logs
   - Look for messages like "🚀 FLOOD DATA UPDATE CRON JOB TRIGGERED"

4. **Test manual trigger:**
   ```bash
   curl -X POST \
     https://safepath-zc-production.up.railway.app/cron/flood-data-update \
     -H "X-Cron-Secret: safepath-flood-update-secret-key-2025"
   ```

### Cron runs but data not updating?

1. **Check if APIs are accessible:**

   - OpenStreetMap Overpass API
   - Open-Elevation API
   - Open-Meteo Weather API

2. **Check file permissions:**

   ```bash
   ls -la data/
   ```

3. **Check logs for errors:**
   ```bash
   tail -100 logs/flood_updates.log
   ```

---

## Security Notes

1. **CRON_SECRET:** Change the default value in production

   - It should be a long, random string
   - Keep it secret - only for your cron service

2. **Railway Environment Variable:**

   - Store `CRON_SECRET` as an environment variable, not in code

3. **API Rate Limiting:**
   - Free APIs have rate limits
   - If you get 429 (Too Many Requests), add delays in the updater
   - Current setup uses 1-second delays between API calls

---

## Recommended Setup for Production

**Best combination:** Railway Premium Cron + EasyCron backup

- **Primary:** Railway Premium Cron (built-in, reliable)
- **Backup:** EasyCron (detects if Railway job fails, triggers manual update)

This ensures your flood data is always up-to-date even if one system fails.

---

## FAQ

**Q: Does this require manual terrain_roads.geojson updates?**
A: No! The cron job automatically updates it every 6 hours. No manual intervention needed.

**Q: What happens if a cron job fails?**
A: The system logs the error. You'll be notified by EasyCron/GitHub Actions/Railway. The next job will run normally in 6 hours.

**Q: Can I change the update frequency?**
A: Yes! Edit the cron expression:

- `0 */4 * * *` = Every 4 hours
- `0 0 * * *` = Once per day at midnight
- `0 12 * * *` = Once per day at noon

**Q: Will this slow down my main app?**
A: No. The cron job runs independently. If it takes 5-10 minutes, it doesn't affect user requests.

**Q: What if APIs are down?**
A: The system logs the error. Users still get routes using the last valid data (at most 6 hours old).

---

## Next Steps

1. ✅ Choose a setup option (Railway Premium, EasyCron, GitHub Actions, or Google Cloud Scheduler)
2. ✅ Set `CRON_SECRET` in your environment
3. ✅ Deploy the updated code with `cron.py` and updated `main.py`
4. ✅ Test the endpoint: `GET /cron/cron-health`
5. ✅ Verify first update runs successfully
6. ✅ Monitor logs to confirm recurring updates

Your flood data will now automatically stay fresh every 6 hours! 🌊
