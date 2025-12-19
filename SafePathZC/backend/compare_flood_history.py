#!/usr/bin/env python3
"""Compare historical flood data with current status"""

import json
from pathlib import Path
from datetime import datetime

# Load historical flooded cache
cache_file = Path(__file__).parent / "data" / "cache" / "flooded_history.json"
terrain_file = Path(__file__).parent / "data" / "terrain_roads.geojson"

print("\n" + "="*70)
print("FLOOD STATUS COMPARISON: Historical vs Current")
print("="*70)

# Load cache
if cache_file.exists():
    with open(cache_file, 'r') as f:
        cache_data = json.load(f)
    historical_flooded = set(cache_data.get('flooded_roads', []))
else:
    historical_flooded = set()

print(f"\n📚 Historical Data:")
print(f"   Total roads ever flooded (cache): {len(historical_flooded)}")

# Load current terrain data
with open(terrain_file, 'r') as f:
    terrain_data = json.load(f)

current_flooded = set()
for feature in terrain_data.get('features', []):
    props = feature.get('properties', {})
    if props.get('flooded') == '1' or props.get('flooded') == 1:
        road_id = props.get('road_id', props.get('osm_id'))
        current_flooded.add(road_id)

print(f"\n🌊 Current Status (with 0.0mm rainfall):")
print(f"   Total roads currently flooded: {len(current_flooded)}")

# Analysis
still_flooded = historical_flooded & current_flooded
dried_out = historical_flooded - current_flooded
newly_flooded = current_flooded - historical_flooded

print(f"\n📊 Comparison Results:")
print(f"   Still flooded (persistent): {len(still_flooded)} roads")
print(f"   Dried out (recovered): {len(dried_out)} roads")
print(f"   Newly flooded: {len(newly_flooded)} roads")

if still_flooded:
    print(f"\n🚨 PERSISTENT FLOOD AREAS (still flooded):")
    for road_id in sorted(list(still_flooded))[:10]:
        for feature in terrain_data.get('features', []):
            props = feature.get('properties', {})
            if props.get('road_id') == road_id or props.get('osm_id') == road_id:
                coords = feature.get('geometry', {}).get('coordinates', [])
                if coords:
                    lat, lon = coords[len(coords)//2][1], coords[len(coords)//2][0]
                    name = props.get('name', 'Unknown')
                    print(f"   - Road {road_id}: {name} (Lat: {lat:.4f}, Lon: {lon:.4f})")
                break
    if len(still_flooded) > 10:
        print(f"   ... and {len(still_flooded) - 10} more")

if dried_out:
    print(f"\n✅ RECOVERED AREAS (no longer flooded - {len(dried_out)} roads):")
    recovery_pct = (len(dried_out) / len(historical_flooded) * 100) if historical_flooded else 0
    print(f"   Recovery rate: {recovery_pct:.1f}%")
    
    # Show sample
    for road_id in sorted(list(dried_out))[:5]:
        for feature in terrain_data.get('features', []):
            props = feature.get('properties', {})
            if props.get('road_id') == road_id or props.get('osm_id') == road_id:
                name = props.get('name', 'Unknown')
                print(f"   - Road {road_id}: {name}")
                break
    if len(dried_out) > 5:
        print(f"   ... and {len(dried_out) - 5} more")

print(f"\n💡 INTERPRETATION:")
print(f"   With current rainfall (0.0mm):")
print(f"   - {len(still_flooded)} roads remain flooded (water draining slowly)")
print(f"   - {len(dried_out)} roads have recovered (water drained)")
print(f"   - When next rain comes, expect {len(historical_flooded) + len(newly_flooded)} roads to be at risk")

metadata = terrain_data.get('metadata', {})
print(f"\n🕐 Last update: {metadata.get('generated', 'Unknown')}")
print(f"   Rainfall at update: {metadata.get('current_rainfall_mm', 0)}mm")

print("\n" + "="*70)
