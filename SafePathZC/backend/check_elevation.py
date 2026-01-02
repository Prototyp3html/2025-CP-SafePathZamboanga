import json
from pathlib import Path

geojson_path = Path("data/terrain_roads.geojson")
with open(geojson_path, 'r') as f:
    geojson = json.load(f)

roads = geojson.get('features', [])
print(f"Checking elevation data in {len(roads)} roads\n")

# Check elevation data in first 20 roads
with_elev = 0
without_elev = 0

for i, road in enumerate(roads[:20]):
    props = road.get('properties', {})
    elev_mean = props.get('elev_mean')
    elev_min = props.get('elev_min')
    elev_max = props.get('elev_max')
    
    print(f"Road {i+1}:")
    print(f"  elev_mean: {elev_mean}")
    print(f"  elev_min: {elev_min}")
    print(f"  elev_max: {elev_max}")
    
    if elev_mean:
        with_elev += 1
    else:
        without_elev += 1
    print()

# Check overall statistics
print(f"\nStatistics:")
roads_with_data = sum(1 for r in roads if r.get('properties', {}).get('elev_mean'))
roads_without_data = len(roads) - roads_with_data
print(f"Roads WITH elevation data: {roads_with_data}")
print(f"Roads WITHOUT elevation data: {roads_without_data}")
print(f"Coverage: {roads_with_data/len(roads)*100:.1f}%")
