#!/bin/bash

# SafePathZC Local OSRM Setup Script
# This script sets up a local OSRM routing server for Zamboanga City

echo "🏠 SafePathZC Local OSRM Setup"
echo "==============================="

# Create data directory
mkdir -p osrm-data
cd osrm-data

# Download Philippines OSM data if not exists
if [ ! -f "philippines-latest.osm.pbf" ]; then
    echo "📥 Downloading Philippines OSM data..."
    wget https://download.geofabrik.de/asia/philippines-latest.osm.pbf
else
    echo "✅ Philippines OSM data already exists"
fi

# Extract Zamboanga region (optional - for faster processing)
if [ ! -f "zamboanga.osm.pbf" ]; then
    echo "✂️ Extracting Zamboanga region..."
    # Zamboanga City bounding box: 121.8,6.7,122.3,7.1
    docker run --rm -v "$(pwd):/data" osrm/osrm-backend \
        osmium extract -b 121.8,6.7,122.3,7.1 /data/philippines-latest.osm.pbf -o /data/zamboanga.osm.pbf
else
    echo "✅ Zamboanga OSM data already exists"
fi

# Prepare OSRM data files
if [ ! -f "zamboanga.osrm" ]; then
    echo "🔧 Processing OSRM data..."
    
    # Extract
    echo "  - Extracting road network..."
    docker run --rm -t -v "$(pwd):/data" osrm/osrm-backend \
        osrm-extract -p /opt/car.lua /data/zamboanga.osrm.pbf
    
    # Partition
    echo "  - Creating partitions..."
    docker run --rm -t -v "$(pwd):/data" osrm/osrm-backend \
        osrm-partition /data/zamboanga.osrm
    
    # Customize
    echo "  - Customizing routing..."
    docker run --rm -t -v "$(pwd):/data" osrm/osrm-backend \
        osrm-customize /data/zamboanga.osrm
else
    echo "✅ OSRM data already processed"
fi

cd ..

echo ""
echo "🚀 Setup complete! To start the OSRM server:"
echo "   docker-compose up osrm-backend"
echo ""
echo "🌐 OSRM will be available at: http://localhost:5000"
echo "🗺️ Test route: http://localhost:5000/route/v1/driving/122.079,6.9214;122.08,6.92"
echo ""
echo "✅ Your SafePathZC app will now use LOCAL routing!"