"""Check if start and end are in same connected component"""
from services.local_routing import LocalRoutingService, Coordinate
import os

geojson_path = os.path.join(os.path.dirname(__file__), "data", "terrain_roads.geojson")
service = LocalRoutingService(geojson_path)
service.load_road_network()

start = Coordinate(lat=6.9214, lng=122.0790)
end = Coordinate(lat=6.9100, lng=122.0850)

start_road = service.find_nearest_road_point(start)
end_road = service.find_nearest_road_point(end)

print(f"Start: ({start_road.lat:.6f}, {start_road.lng:.6f})")
print(f"End: ({end_road.lat:.6f}, {end_road.lng:.6f})")

# BFS to find all reachable nodes from start
from collections import deque

visited = set()
queue = deque([start_road])
visited.add(start_road)

while queue:
    current = queue.popleft()
    
    if current == end_road:
        print(f"\n✓ END IS REACHABLE! Found after visiting {len(visited)} nodes")
        break
    
    if current in service.routing_graph:
        for segment, point_index in service.routing_graph[current].connected_segments:
            neighbors = service._get_segment_neighbors(segment, point_index)
            for neighbor in neighbors:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

if end_road not in visited:
    print(f"\n✗ END IS NOT REACHABLE from start")
    print(f"Only {len(visited)} nodes reachable from start")
    print(f"Total nodes in graph: {len(service.routing_graph)}")
    print(f"Percentage reachable: {100*len(visited)/len(service.routing_graph):.2f}%")
