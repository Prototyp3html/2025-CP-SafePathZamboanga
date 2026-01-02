import json
from pathlib import Path

geojson_path = Path("data/terrain_roads.geojson")
with open(geojson_path, 'r') as f:
    geojson = json.load(f)

roads = geojson.get('features', [])
print(f"Total roads: {len(roads)}\n")

# Check structure of first few roads
for i, road in enumerate(roads[:5]):
    print(f"Road {i+1}:")
    print(f"  ID: {road.get('id', 'N/A')}")
    print(f"  Properties: {list(road.get('properties', {}).keys())}")
    props = road.get('properties', {})
    print(f"  Name: {props.get('name', 'NO NAME')}")
    print(f"  Geometry type: {road.get('geometry', {}).get('type', 'unknown')}")
    print()
