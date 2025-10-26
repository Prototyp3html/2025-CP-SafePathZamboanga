"""
Rebuild OSRM with zcroadmap.geojson data
This ensures OSRM uses the same roads as our GeoJSON files
"""
import json
import subprocess
import os
from pathlib import Path

print("=" * 70)
print("REBUILDING OSRM WITH ZCROADMAP.GEOJSON")
print("=" * 70)

# Paths
GEOJSON_FILE = Path("data/zcroadmap.geojson")
OSM_OUTPUT = Path("osrm-data/zamboanga_roads.osm")
OSRM_BASE = Path("osrm-data/zamboanga_roads")

print(f"\n📋 Step 1: Converting {GEOJSON_FILE} to OSM format...")

# Load GeoJSON
with open(GEOJSON_FILE, 'r', encoding='utf-8') as f:
    geojson = json.load(f)

roads_count = len(geojson['features'])
print(f"  ✓ Loaded {roads_count} roads from zcroadmap.geojson")

# Create OSM XML
osm_xml = ['<?xml version="1.0" encoding="UTF-8"?>']
osm_xml.append('<osm version="0.6" generator="SafePathZC">')

node_id = 1
way_id = 1
node_coords = {}  # Track unique nodes

print(f"  Converting to OSM format...")

for feature in geojson['features']:
    if feature['geometry']['type'] != 'LineString':
        continue
    
    coords = feature['geometry']['coordinates']
    properties = feature['properties']
    
    # Create nodes for this way
    way_nodes = []
    for lng, lat in coords:
        # Round coordinates to avoid duplicate nodes
        coord_key = f"{round(lat, 6)},{round(lng, 6)}"
        
        if coord_key not in node_coords:
            node_coords[coord_key] = node_id
            osm_xml.append(f'  <node id="{node_id}" lat="{lat}" lon="{lng}" visible="true"/>')
            node_id += 1
        
        way_nodes.append(node_coords[coord_key])
    
    # Create way
    osm_xml.append(f'  <way id="{way_id}" visible="true">')
    for node in way_nodes:
        osm_xml.append(f'    <nd ref="{node}"/>')
    
    # Add tags
    highway = properties.get('highway', 'unclassified')
    osm_xml.append(f'    <tag k="highway" v="{highway}"/>')
    
    if properties.get('name'):
        name = properties['name'].replace('"', '&quot;').replace('&', '&amp;')
        osm_xml.append(f'    <tag k="name" v="{name}"/>')
    
    if properties.get('oneway'):
        osm_xml.append(f'    <tag k="oneway" v="yes"/>')
    
    osm_xml.append(f'  </way>')
    way_id += 1

osm_xml.append('</osm>')

# Write OSM file
os.makedirs(OSM_OUTPUT.parent, exist_ok=True)
with open(OSM_OUTPUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(osm_xml))

file_size = os.path.getsize(OSM_OUTPUT) / 1024 / 1024
print(f"  ✓ Created {OSM_OUTPUT} ({file_size:.1f} MB)")
print(f"  ✓ {len(node_coords)} nodes, {way_id-1} ways")

# Step 2: Run OSRM extract
print(f"\n🔧 Step 2: Running OSRM extract...")
print(f"  This will take 1-3 minutes...")

cmd = [
    "docker", "run", "-t", 
    "-v", f"{os.path.abspath('osrm-data')}:/data",
    "osrm/osrm-backend",
    "osrm-extract", "-p", "/opt/car.lua", 
    "/data/zamboanga_roads.osm"
]

result = subprocess.run(cmd, capture_output=True, text=True)

if result.returncode == 0:
    print(f"  ✓ OSRM extract completed")
else:
    print(f"  ✗ OSRM extract failed:")
    print(result.stderr)
    exit(1)

# Step 3: Run OSRM partition
print(f"\n🔀 Step 3: Running OSRM partition...")

cmd = [
    "docker", "run", "-t",
    "-v", f"{os.path.abspath('osrm-data')}:/data",
    "osrm/osrm-backend",
    "osrm-partition",
    "/data/zamboanga_roads.osrm"
]

result = subprocess.run(cmd, capture_output=True, text=True)

if result.returncode == 0:
    print(f"  ✓ OSRM partition completed")
else:
    print(f"  ✗ OSRM partition failed:")
    print(result.stderr)
    exit(1)

# Step 4: Run OSRM contract
print(f"\n🔗 Step 4: Running OSRM contract...")

cmd = [
    "docker", "run", "-t",
    "-v", f"{os.path.abspath('osrm-data')}:/data",
    "osrm/osrm-backend",
    "osrm-contract",
    "/data/zamboanga_roads.osrm"
]

result = subprocess.run(cmd, capture_output=True, text=True)

if result.returncode == 0:
    print(f"  ✓ OSRM contract completed")
else:
    print(f"  ✗ OSRM contract failed:")
    print(result.stderr)
    exit(1)

print(f"\n" + "=" * 70)
print(f"✅ SUCCESS! OSRM rebuilt with zcroadmap.geojson")
print(f"=" * 70)
print(f"\nNext steps:")
print(f"1. Stop the current OSRM container:")
print(f"   docker stop <container_id>")
print(f"2. Start OSRM with new data:")
print(f"   cd osrm-data")
print(f"   docker run -d -p 5000:5000 -v \"$PWD:/data\" osrm/osrm-backend osrm-routed --algorithm ch /data/zamboanga_roads.osrm")
print(f"3. Restart your backend")
print(f"\nNow OSRM will use the same roads as your GeoJSON! 🎉")
