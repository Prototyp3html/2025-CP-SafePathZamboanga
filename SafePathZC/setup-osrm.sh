#!/bin/bash
# Quick OSRM Setup Script for Zamboanga City
# This will download Zamboanga data and set up OSRM Docker container

echo "🌟 Setting up local OSRM for Zamboanga City..."

# Create data directory
mkdir -p osrm-data
cd osrm-data

# Download Philippines OSM data (includes Zamboanga)
echo "📥 Downloading Philippines OSM data..."
wget https://download.geofabrik.de/asia/philippines-latest.osm.pbf

# Extract Zamboanga region (optional - for smaller data size)
echo "🗺️ Processing OSM data for OSRM..."

# Process the data for driving profile
echo "🚗 Setting up driving profile..."
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-extract -p /opt/car.lua /data/philippines-latest.osrm.pbf
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-partition /data/philippines-latest.osrm
docker run -t -v "${PWD}:/data" osrm/osrm-backend osrm-customize /data/philippines-latest.osrm

# Start OSRM server
echo "🚀 Starting OSRM server on port 5000..."
docker run -t -i -p 5000:5000 -v "${PWD}:/data" osrm/osrm-backend osrm-routed --algorithm mld /data/philippines-latest.osrm

echo "✅ OSRM server is running on http://localhost:5000"
echo "🔧 You can now enable VITE_USE_LOCAL_OSRM=true in frontend/.env"