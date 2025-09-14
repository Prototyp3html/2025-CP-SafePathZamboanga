# Local OSRM Implementation for SafePathZC

This document explains how to set up and use the local OSRM (Open Source Routing Machine) server with your Zamboanga PBF file for accurate, local routing.

## Overview

The SafePathZC application now prioritizes local OSRM routing for the most accurate Zamboanga-specific routes. The routing fallback hierarchy is:

1. **Local OSRM** (Zamboanga PBF data) - Most accurate
2. **GraphHopper API** - Good fallback with API key
3. **Public OSRM** - Free fallback option

## Configuration

### Frontend Configuration (`.env`)

```env
# Backend API Configuration
VITE_BACKEND_URL=http://localhost:8000

# Local OSRM Configuration
VITE_USE_LOCAL_OSRM=true

# GraphHopper API Key (fallback)
VITE_GRAPHHOPPER_API_KEY=your_api_key_here
```

### Backend Configuration

The backend already has the local OSRM endpoint configured:

- Endpoint: `/osrm/route`
- Local OSRM Server: `http://localhost:5000`

## Setting Up Local OSRM in WSL

### Prerequisites

1. WSL2 with Ubuntu
2. Your Zamboanga PBF file
3. Docker (recommended) or manual OSRM installation

### Option 1: Docker Setup (Recommended)

```bash
# 1. Navigate to your data directory
cd /path/to/your/zamboanga/data

# 2. Extract and prepare the PBF file
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/zamboanga.osrm.pbf

# 3. Partition the data
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/zamboanga.osrm

# 4. Customize the data
docker run -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/zamboanga.osrm

# 5. Run the OSRM server
docker run -t -i -p 5000:5000 -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/zamboanga.osrm
```

### Option 2: Manual Installation

```bash
# Install dependencies
sudo apt update
sudo apt install build-essential git cmake pkg-config \
    libbz2-dev libxml2-dev libzip-dev libboost-all-dev \
    lua5.2 liblua5.2-dev libtbb-dev

# Clone and build OSRM
git clone https://github.com/Project-OSRM/osrm-backend.git
cd osrm-backend
mkdir -p build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build .

# Process your PBF file
./osrm-extract -p ../profiles/car.lua /path/to/zamboanga.osrm.pbf
./osrm-partition zamboanga.osrm
./osrm-customize zamboanga.osrm

# Run the server
./osrm-routed --algorithm mld zamboanga.osrm
```

## Testing the Implementation

### 1. Verify Local OSRM Server

```bash
# Test the local OSRM server directly
curl "http://localhost:5000/route/v1/driving/122.079,6.9214;122.085,6.9300?overview=full&geometries=geojson"
```

### 2. Test Backend Integration

```bash
# Test the backend OSRM endpoint
curl "http://localhost:8000/osrm/route?start=122.079,6.9214&end=122.085,6.9300&alternatives=true"
```

### 3. Monitor Frontend Logs

Open the browser console and look for routing logs:

```
🗺️ MapView Configuration:
    - Backend URL: http://localhost:8000
    - Use Local OSRM: true
    - Local OSRM endpoint: http://localhost:8000/osrm/route

🚀 Trying local OSRM first for Zamboanga-specific routing...
🗺️ Local OSRM Response: {...}
✅ Local OSRM Success: Got 45 waypoints for Zamboanga route
```

## API Endpoints

### Local OSRM Routes

```javascript
// Basic route
GET /osrm/route?start=lng,lat&end=lng,lat

// Route with waypoints
GET /osrm/route?start=lng,lat&end=lng,lat&waypoints=lng,lat;lng,lat

// Route with alternatives
GET /osrm/route?start=lng,lat&end=lng,lat&alternatives=true
```

### Response Format

```json
{
  "routes": [
    {
      "geometry": {
        "type": "LineString",
        "coordinates": [[lng, lat], ...]
      },
      "distance": 5420.3,
      "duration": 640.2
    }
  ],
  "source": "local_osrm",
  "osrm_version": "5.27.1",
  "total_routes": 1,
  "waypoints_used": 2
}
```

## Troubleshooting

### Local OSRM Not Working

1. **Check if OSRM server is running**:

   ```bash
   curl http://localhost:5000/route/v1/driving/122.079,6.9214;122.085,6.9300
   ```

2. **Disable local OSRM temporarily**:

   ```env
   VITE_USE_LOCAL_OSRM=false
   ```

3. **Check backend logs**:
   ```bash
   # Look for OSRM connection errors
   tail -f backend/logs/app.log
   ```

### Frontend Not Using Local OSRM

1. **Check environment variables**:

   ```javascript
   console.log(import.meta.env.VITE_USE_LOCAL_OSRM);
   console.log(import.meta.env.VITE_BACKEND_URL);
   ```

2. **Check browser console** for routing logs

3. **Verify backend connectivity**:
   ```bash
   curl http://localhost:8000/osrm/route?start=122.079,6.9214&end=122.085,6.9300
   ```

## Performance Benefits

Using local OSRM with Zamboanga PBF data provides:

- **Higher Accuracy**: Routes specific to Zamboanga's road network
- **Better Performance**: No external API calls or rate limits
- **Offline Capability**: Works without internet for routing
- **Detailed Local Knowledge**: Includes local roads not in global datasets
- **Consistent Availability**: No dependency on external services

## Development Notes

The implementation automatically falls back to external services if local OSRM is unavailable:

1. Local OSRM (Zamboanga PBF) ← **Primary**
2. GraphHopper API ← **Secondary**
3. Public OSRM ← **Tertiary**

This ensures the application continues working even if local OSRM is temporarily unavailable.
