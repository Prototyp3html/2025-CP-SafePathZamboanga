"""
Rebuild OSRM with zcroadmap.geojson data
This ensures OSRM uses the same roads as our GeoJSON files with proper road hierarchy

IMPORTANT: Run this script when:
1. You've updated zcroadmap.geojson with new roads
2. OSRM is producing weird routes (dead ends, unnecessary detours)
3. After initial setup

This script will:
- Convert zcroadmap.geojson to OSM format (preserving road types, speeds, lanes, etc.)
- Build OSRM routing data with proper road hierarchy
- This takes 2-5 minutes to complete

After running this, restart the OSRM container: docker-compose restart osrm-driving
"""
import json
import subprocess
import os
from pathlib import Path

print("=" * 70)
print("REBUILDING OSRM WITH ZCROADMAP.GEOJSON")
print("This will create high-quality routing data with proper road hierarchy")
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
    
    # Add tags - preserve as many OSM tags as possible for better routing
    highway = properties.get('highway', 'unclassified')
    osm_xml.append(f'    <tag k="highway" v="{highway}"/>')
    
    # Name
    if properties.get('name'):
        name = properties['name'].replace('"', '&quot;').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        osm_xml.append(f'    <tag k="name" v="{name}"/>')
    
    # Oneway
    if properties.get('oneway'):
        osm_xml.append(f'    <tag k="oneway" v="yes"/>')
    
    # Parse other_tags string to extract important routing properties
    other_tags = properties.get('other_tags', '')
    tags_parsed = {}
    
    if other_tags:
        # other_tags format: "key1"=>"value1","key2"=>"value2"
        # Extract: maxspeed, lanes, surface, ref (road number)
        try:
            # Simple parsing of other_tags
            import re
            tag_pattern = r'"([^"]+)"=>"([^"]+)"'
            tag_matches = re.findall(tag_pattern, other_tags)
            
            for key, value in tag_matches:
                # Include important tags for routing quality
                if key in ['maxspeed', 'lanes', 'surface', 'ref', 'junction', 'designation']:
                    value_escaped = value.replace('"', '&quot;').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    osm_xml.append(f'    <tag k="{key}" v="{value_escaped}"/>')
                    tags_parsed[key] = value
        except:
            pass  # If parsing fails, skip other_tags
    
    # Set default maxspeed based on highway type if not specified
    if 'maxspeed' not in tags_parsed:
        speed_defaults = {
            'motorway': '100',
            'trunk': '80',
            'primary': '60',
            'secondary': '50',
            'tertiary': '40',
            'unclassified': '30',
            'residential': '25'
        }
        if highway in speed_defaults:
            osm_xml.append(f'    <tag k="maxspeed" v="{speed_defaults[highway]}"/>')
    
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
print(f"\n📊 Data created:")
print(f"  • {len(node_coords)} road nodes")
print(f"  • {way_id-1} road segments")
print(f"  • Road hierarchy preserved (primary > secondary > tertiary > residential)")
print(f"  • Speed limits, lanes, and surfaces included")
print(f"\n🔄 Next step: Restart OSRM container")
print(f"\n   Run in PowerShell:")
print(f"   cd SafePathZC")
print(f"   docker-compose restart osrm-driving")
print(f"\n   This will reload OSRM with the new road data.")
print(f"   Wait ~30 seconds for OSRM to start, then test routing!")
print(f"\n✨ Benefits of rebuilt OSRM:")
print(f"  • Prefers major roads (highways, primary roads)")
print(f"  • Avoids dead-end streets")
print(f"  • Better route quality overall")
print(f"  • Matches your GeoJSON data exactly")
print(f"\n" + "=" * 70)
