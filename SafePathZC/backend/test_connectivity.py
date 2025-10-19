"""Check road network connectivity"""
from services.local_routing import LocalRoutingService
import os

geojson_path = os.path.join(os.path.dirname(__file__), "data", "terrain_roads.geojson")
service = LocalRoutingService(geojson_path)
service.load_road_network()

print(f"Total segments: {len(service.road_segments)}")
print(f"Total graph nodes: {len(service.routing_graph)}")

# Count how many nodes connect multiple segments (intersections)
intersection_count = 0
dead_end_count = 0
isolated_count = 0

for coord, node in service.routing_graph.items():
    num_segments = len(node.connected_segments)
    if num_segments > 2:
        intersection_count += 1
    elif num_segments == 1:
        dead_end_count += 1
    elif num_segments == 2:
        isolated_count += 1

print(f"\nNode types:")
print(f"  Intersections (3+ segments): {intersection_count}")
print(f"  Regular points (2 segments): {isolated_count}")
print(f"  Dead ends (1 segment): {dead_end_count}")

print(f"\nSample intersection nodes:")
count = 0
for coord, node in service.routing_graph.items():
    if len(node.connected_segments) > 2:
        print(f"  ({coord.lat:.6f}, {coord.lng:.6f}) connects {len(node.connected_segments)} segments")
        count += 1
        if count >= 5:
            break
