"""Test A* routing after fix"""
from services.local_routing import LocalRoutingService, Coordinate
import os

# Load service
geojson_path = os.path.join(os.path.dirname(__file__), "data", "terrain_roads.geojson")
service = LocalRoutingService(geojson_path)
service.load_road_network()

print(f"Road segments: {len(service.road_segments)}")
print(f"Routing graph nodes: {len(service.routing_graph)}")

# Test route
start = Coordinate(lat=6.9214, lng=122.0790)
end = Coordinate(lat=6.9100, lng=122.0850)

print(f"\nCalculating route from ({start.lat}, {start.lng}) to ({end.lat}, {end.lng})")
route = service.calculate_route(start, end, mode="car", risk_profile="safe")

if route:
    print(f"✓ SUCCESS! Route found with {len(route)} points")
    print(f"  First 3 points: {[(p.lat, p.lng) for p in route[:3]]}")
    print(f"  Last 3 points: {[(p.lat, p.lng) for p in route[-3:]]}")
else:
    print("✗ FAILED: No route found")
