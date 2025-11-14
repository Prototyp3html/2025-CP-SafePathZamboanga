# Database-Powered Terrain System Setup Guide

## 🎯 **What This Upgrade Does**

Converts your SafePath system from **file-based** terrain storage to **PostgreSQL database** storage, making it **Railway-compatible** and production-ready.

### **Before (File-Based)** ❌

- Terrain data stored in `terrain_roads.geojson`
- **Lost on every Railway deployment**
- No historical data tracking
- Limited querying capabilities

### **After (Database-Powered)** ✅

- Terrain data stored in **PostgreSQL**
- **Survives Railway deployments**
- Historical flood tracking
- Advanced geographic queries
- Real-time statistics
- API endpoints for data access

---

## 🚀 **Railway Deployment Steps**

### **Step 1: Run Database Migration**

```bash
# In your backend directory
cd backend
python migrations/create_terrain_tables.py
```

This will:

- ✅ Create terrain database tables
- ✅ Migrate existing GeoJSON data (if any)
- ✅ Set up indexes for performance

### **Step 2: Push to Railway**

```bash
git add .
git commit -m "🚀 Upgrade to database-powered terrain system"
git push origin main
```

### **Step 3: Verify on Railway**

Railway will automatically:

- ✅ Deploy your updated code
- ✅ Start the background terrain updater
- ✅ Begin updating terrain data every 6 hours
- ✅ Store all data in PostgreSQL (persistent!)

---

## 📊 **New API Endpoints**

Your system now has powerful new APIs:

### **Get Roads in Area**

```
GET /api/terrain/roads/area?min_lat=6.9&max_lat=7.0&min_lon=122.0&max_lon=122.1
```

### **Find Nearby Roads**

```
GET /api/terrain/roads/nearby?lat=6.9119&lon=122.0790&radius_km=2.0
```

### **Get Flood-Prone Roads**

```
GET /api/terrain/flood-zones?min_risk_level=medium&format=geojson
```

### **Export GeoJSON**

```
GET /api/terrain/export/geojson?include_flood_data=true
```

### **Database Statistics**

```
GET /api/terrain/statistics
```

### **Manual Update Trigger**

```
POST /api/terrain/update/manual
```

---

## 🔄 **How the Auto-Update Works**

### **Every 6 Hours (12 AM, 6 AM, 12 PM, 6 PM):**

1. **Fetch Live Data** 📡

   - OpenStreetMap road network
   - Elevation data from APIs
   - Current weather conditions

2. **Analyze Flood Risk** 🌊

   - Calculate elevation statistics
   - Check proximity to known flood zones
   - Factor in current rainfall
   - Score terrain roughness

3. **Store in Database** 💾

   - PostgreSQL tables (persistent!)
   - Indexed for fast queries
   - Historical tracking

4. **Generate Legacy File** 📁
   - Creates `terrain_roads.geojson` for compatibility
   - Backwards compatible with existing code

---

## 🗄️ **Database Schema**

### **`terrain_road_segments`** - Main road data

- `osm_way_id` - OpenStreetMap identifier
- `road_name`, `highway_type` - Road information
- `geometry` - GeoJSON coordinates
- `avg_elevation`, `flood_risk_level` - Analysis results
- `last_updated` - Data freshness

### **`flood_zone_history`** - Historical flood records

- `zone_name`, `latitude`, `longitude` - Location
- `flood_level`, `rainfall_mm` - Flood data
- `recorded_at` - Timestamp

### **`terrain_data_updates`** - Update tracking

- `update_started`, `status` - Operation tracking
- `roads_processed`, `success_rate` - Statistics

---

## 💡 **Benefits Over File System**

### **🔒 Data Persistence**

- **Railway-safe**: Data survives deployments
- **No data loss** on server restarts
- **Continuous operation**

### **📈 Better Performance**

- **Indexed queries** for location-based searches
- **Partial updates** instead of full file rewrites
- **Concurrent access** without file locking

### **📊 Advanced Features**

- **Historical tracking** of flood conditions
- **Statistics and monitoring**
- **API access** to terrain data
- **Real-time updates** without file I/O

### **🔍 Better Debugging**

- **Update session tracking**
- **Error logging and statistics**
- **Performance metrics**

---

## 🔧 **Monitoring & Maintenance**

### **Check System Status**

```bash
# View database statistics
curl https://your-app.railway.app/api/terrain/statistics

# Check recent updates
curl https://your-app.railway.app/api/terrain/flood-history?days=7
```

### **Manual Data Update**

```bash
# Trigger immediate update
curl -X POST https://your-app.railway.app/api/terrain/update/manual
```

### **Database Health Check**

```python
# In your backend console
from services.terrain_database import TerrainDatabaseService

async def check_health():
    async with TerrainDatabaseService() as db:
        stats = await db.get_data_statistics()
        print(f"Total roads: {stats['total_road_segments']}")
        print(f"Flood-prone: {stats['flood_prone_percentage']:.1f}%")
        print(f"Last update: {stats['last_successful_update']}")

import asyncio
asyncio.run(check_health())
```

---

## 🐛 **Troubleshooting**

### **Migration Issues**

```bash
# If migration fails, run manually:
python -c "
from migrations.create_terrain_tables import main
main()
"
```

### **API Not Working**

- Check Railway logs: `railway logs`
- Verify database connection in Railway dashboard
- Ensure PostgreSQL addon is attached

### **No Data Updates**

- Check background scheduler in logs
- Verify API keys/endpoints are accessible
- Manual trigger: `POST /api/terrain/update/manual`

### **Performance Issues**

- Monitor database query performance
- Check if indexes are created properly
- Consider adding more geographic indexes

---

## ✅ **Success Verification**

After deployment, you should see:

1. **✅ Database Tables Created**

   ```
   ✅ Terrain database tables created successfully!
   📋 Created tables and columns:
      🗂️  Table: terrain_road_segments
      🗂️  Table: flood_zone_history
      🗂️  Table: terrain_data_updates
   ```

2. **✅ Auto-Updater Running**

   ```
   🔄 DATABASE Flood data auto-update scheduler started
   📅 Will update every 6 hours at: 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM
   💾 Using PostgreSQL database storage (Railway-compatible)
   ```

3. **✅ API Endpoints Working**

   - `/api/terrain/statistics` returns data
   - `/api/terrain/roads/area` returns road segments
   - Legacy `/api/terrain/terrain_roads.geojson` still works

4. **✅ Data Persistence**
   - Deploy again → data still there!
   - No more "terrain file lost" issues

---

## 🎉 **You're Done!**

Your SafePath system is now **production-ready** with:

- ✅ **Railway-compatible** database storage
- ✅ **Automatic terrain updates** every 6 hours
- ✅ **Advanced API endpoints** for data access
- ✅ **Historical flood tracking**
- ✅ **Performance-optimized** queries
- ✅ **Backward compatibility** maintained

The system will now **automatically maintain fresh terrain data** without any manual intervention, and **all data will persist** through Railway deployments! 🚀
