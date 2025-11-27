import json

# Path to your GeoJSON file
geojson_path = r"C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\terrain_roads.geojson"

with open(geojson_path, "r") as f:
    data = json.load(f)

# Extract all last_updated timestamps
timestamps = [feat["properties"]["last_updated"] for feat in data["features"]]

# Find the latest timestamp
latest_update = max(timestamps)
print("Latest update across all roads:", latest_update)
