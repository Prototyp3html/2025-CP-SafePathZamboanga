"""Debug A* with detailed logging"""
from services.local_routing import LocalRoutingService, Coordinate
import os
import logging

# Enable DEBUG logging
logging.basicConfig(level=logging.DEBUG)

# Load service
geojson_path = os.path.join(os.path.dirname(__file__), "data", "terrain_roads.geojson")
service = LocalRoutingService(geojson_path)
service.load_road_network()

# Test route
start = Coordinate(lat=6.9214, lng=122.0790)
end = Coordinate(lat=6.9100, lng=122.0850)

print(f"\n=== Testing Route ===")
print(f"From: ({start.lat}, {start.lng})")
print(f"To: ({end.lat}, {end.lng})")

# Find nearest road points
start_road = service.find_nearest_road_point(start)
end_road = service.find_nearest_road_point(end)

print(f"\n=== Snapped Points ===")
print(f"Start road: ({start_road.lat}, {start_road.lng})")
print(f"End road: ({end_road.lat}, {end_road.lng})")
print(f"Start in graph: {start_road in service.routing_graph}")
print(f"End in graph: {end_road in service.routing_graph}")

if start_road in service.routing_graph:
    start_node = service.routing_graph[start_road]
    print(f"Start node connected segments: {len(start_node.connected_segments)}")
    for seg, idx in start_node.connected_segments[:3]:  # First 3
        print(f"  Segment {seg.osm_id}, point {idx}/{len(seg.coordinates)}")

print(f"\n=== Calculating Route ===")
route = service.calculate_route(start, end, mode="car", risk_profile="safe")

if route:
    print(f"\n✓ SUCCESS! Route with {len(route)} points")
else:
    print(f"\n✗ FAILED")
