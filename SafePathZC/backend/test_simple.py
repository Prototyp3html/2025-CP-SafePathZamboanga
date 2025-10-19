"""Simple A* test with detailed logging"""
from services.local_routing import LocalRoutingService, Coordinate
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(message)s')

# Load service
geojson_path = os.path.join(os.path.dirname(__file__), "data", "terrain_roads.geojson")
service = LocalRoutingService(geojson_path)
service.load_road_network()

print("\n=== Testing Route ===")
start = Coordinate(lat=6.9214, lng=122.0790)
end = Coordinate(lat=6.9100, lng=122.0850)

print(f"From: ({start.lat}, {start.lng})")
print(f"To: ({end.lat}, {end.lng})")
print(f"Direct distance: {start.distance_to(end):.1f} meters")

# Find nearest points
start_road = service.find_nearest_road_point(start)
end_road = service.find_nearest_road_point(end)

print(f"\nStart road: ({start_road.lat}, {start_road.lng})")
print(f"End road: ({end_road.lat}, {end_road.lng})")

# Check connectivity
if start_road in service.routing_graph:
    start_node = service.routing_graph[start_road]
    print(f"\nStart node: {len(start_node.connected_segments)} connected segments")
    
if end_road in service.routing_graph:
    end_node = service.routing_graph[end_road]
    print(f"End node: {len(end_node.connected_segments)} connected segments")

print("\n=== Running A* ===")
route = service.calculate_route(start, end, mode="car", risk_profile="safe")

if route:
    print(f"\n✓ SUCCESS! Route with {len(route)} points")
    print(f"Route distance: {sum(route[i].distance_to(route[i+1]) for i in range(len(route)-1)):.1f} meters")
else:
    print(f"\n✗ FAILED")
