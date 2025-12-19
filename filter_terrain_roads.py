#!/usr/bin/env python3
"""
Filter terrain_roads.geojson to remove roads outside Zamboanga City
Keep only roads with coordinates within official ZC bounds
"""

import json
from pathlib import Path

# Zamboanga City official geographic bounds
ZAMBOANGA_CITY_BOUNDS = {
    'min_lat': 6.85,
    'max_lat': 7.15,
    'min_lon': 121.95,
    'max_lon': 122.30
}

def is_road_in_zamboanga(feature):
    """Check if road coordinates are within Zamboanga City bounds"""
    coords = feature.get('geometry', {}).get('coordinates', [])
    
    # Check if ANY point in the road is within bounds
    for coord in coords:
        lon, lat = coord[0], coord[1]
        if (ZAMBOANGA_CITY_BOUNDS['min_lat'] <= lat <= ZAMBOANGA_CITY_BOUNDS['max_lat'] and
            ZAMBOANGA_CITY_BOUNDS['min_lon'] <= lon <= ZAMBOANGA_CITY_BOUNDS['max_lon']):
            return True
    return False

# Load terrain_roads
input_file = Path(__file__).parent / 'SafePathZC' / 'backend' / 'data' / 'terrain_roads.geojson'
with open(input_file, 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)

# Filter features
original_count = len(geojson_data.get('features', []))
filtered_features = [f for f in geojson_data.get('features', []) if is_road_in_zamboanga(f)]
filtered_count = len(filtered_features)

# Update metadata
metadata = geojson_data.get('metadata', {})
metadata['total_roads'] = filtered_count

# Create filtered GeoJSON
filtered_data = {
    'type': 'FeatureCollection',
    'crs': geojson_data.get('crs'),
    'metadata': metadata,
    'features': filtered_features
}

# Save filtered version
with open(input_file, 'w', encoding='utf-8') as f:
    json.dump(filtered_data, f)

print(f"\n✅ Filtered terrain_roads.geojson to Zamboanga City only:")
print(f"   Original roads: {original_count:,}")
print(f"   Filtered roads: {filtered_count:,}")
print(f"   Removed (Basilan/outside): {original_count - filtered_count:,}")

# Get bounds of filtered data
lats = []
lons = []
for feature in filtered_features:
    coords = feature['geometry'].get('coordinates', [])
    for coord in coords:
        lons.append(coord[0])
        lats.append(coord[1])

if lats and lons:
    print(f"\n   Filtered bounds (Zamboanga City only):")
    print(f"     Latitude:  {min(lats):.4f} to {max(lats):.4f}")
    print(f"     Longitude: {min(lons):.4f} to {max(lons):.4f}")
