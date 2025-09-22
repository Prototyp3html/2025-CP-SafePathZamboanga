"""
Local GeoJSON-based routing service for Zamboanga City
Uses filtered road network data from QGIS for precise routing
"""
import json
import math
import heapq
from typing import List, Dict, Tuple, Optional, Set
from dataclasses import dataclass
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class Coordinate:
    """Represents a geographic coordinate"""
    lat: float
    lng: float
    
    def __hash__(self):
        return hash((round(self.lat, 6), round(self.lng, 6)))
    
    def __eq__(self, other):
        if not isinstance(other, Coordinate):
            return False
        return (abs(self.lat - other.lat) < 1e-6 and 
                abs(self.lng - other.lng) < 1e-6)
    
    def distance_to(self, other: 'Coordinate') -> float:
        """Calculate distance in meters using Haversine formula"""
        R = 6371000  # Earth's radius in meters
        
        lat1_rad = math.radians(self.lat)
        lat2_rad = math.radians(other.lat)
        delta_lat = math.radians(other.lat - self.lat)
        delta_lng = math.radians(other.lng - self.lng)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * 
             math.sin(delta_lng / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c

@dataclass
class RoadSegment:
    """Represents a road segment from GeoJSON"""
    osm_id: str
    name: Optional[str]
    highway_type: Optional[str]
    coordinates: List[Coordinate]
    oneway: bool = False
    maxspeed: int = 40  # Default speed limit
    surface: str = "unknown"
    
    def get_length(self) -> float:
        """Calculate total length of road segment"""
        total_length = 0
        for i in range(len(self.coordinates) - 1):
            total_length += self.coordinates[i].distance_to(self.coordinates[i + 1])
        return total_length
    
    def get_speed_limit(self) -> int:
        """Get speed limit based on highway type and properties"""
        if self.maxspeed:
            return self.maxspeed
        
        # Default speeds by highway type
        speed_map = {
            'trunk': 60,
            'primary': 50,
            'secondary': 40,
            'tertiary': 30,
            'residential': 25,
            'trunk_link': 40,
            'primary_link': 40,
            'service': 20
        }
        
        return speed_map.get(self.highway_type, 40)

@dataclass
class RouteNode:
    """Node in the routing graph"""
    coordinate: Coordinate
    connected_segments: List[Tuple[RoadSegment, int]]  # (segment, point_index)
    
class LocalRoutingService:
    """Service for local GeoJSON-based routing"""
    
    def __init__(self, geojson_path: str):
        self.geojson_path = geojson_path
        self.road_segments: List[RoadSegment] = []
        self.routing_graph: Dict[Coordinate, RouteNode] = {}
        self.loaded = False
        
    def load_road_network(self) -> bool:
        """Load and process the GeoJSON road network"""
        try:
            with open(self.geojson_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            logger.info(f"Loading {len(data['features'])} road features")
            
            for feature in data['features']:
                if feature['geometry']['type'] != 'LineString':
                    continue
                
                properties = feature['properties']
                geometry = feature['geometry']
                
                # Skip non-road features
                if not properties.get('highway') and properties.get('barrier'):
                    continue
                
                # Parse coordinates
                coordinates = [
                    Coordinate(lat=coord[1], lng=coord[0])
                    for coord in geometry['coordinates']
                ]
                
                # Parse properties
                name = properties.get('name')
                highway_type = properties.get('highway')
                
                # Parse oneway from other_tags
                oneway = False
                maxspeed = 40
                surface = "unknown"
                
                other_tags = properties.get('other_tags', '')
                if other_tags:
                    if '"oneway"=>"yes"' in other_tags:
                        oneway = True
                    
                    # Extract maxspeed
                    if '"maxspeed"=>' in other_tags:
                        try:
                            maxspeed_str = other_tags.split('"maxspeed"=>"')[1].split('"')[0]
                            maxspeed = int(maxspeed_str)
                        except (IndexError, ValueError):
                            pass
                    
                    # Extract surface
                    if '"surface"=>' in other_tags:
                        try:
                            surface = other_tags.split('"surface"=>"')[1].split('"')[0]
                        except IndexError:
                            pass
                
                # Create road segment
                segment = RoadSegment(
                    osm_id=properties.get('osm_id', ''),
                    name=name,
                    highway_type=highway_type,
                    coordinates=coordinates,
                    oneway=oneway,
                    maxspeed=maxspeed,
                    surface=surface
                )
                
                self.road_segments.append(segment)
            
            logger.info(f"Loaded {len(self.road_segments)} road segments")
            
            # Build routing graph
            self._build_routing_graph()
            
            self.loaded = True
            return True
            
        except Exception as e:
            logger.error(f"Error loading road network: {e}")
            return False
    
    def _build_routing_graph(self):
        """Build routing graph from road segments"""
        logger.info("Building routing graph...")
        
        # Create nodes for all road endpoints and intersections
        for segment in self.road_segments:
            for i, coord in enumerate(segment.coordinates):
                if coord not in self.routing_graph:
                    self.routing_graph[coord] = RouteNode(
                        coordinate=coord,
                        connected_segments=[]
                    )
                
                # Add segment connection
                self.routing_graph[coord].connected_segments.append((segment, i))
        
        logger.info(f"Built routing graph with {len(self.routing_graph)} nodes")
    
    def find_nearest_road_point(self, target: Coordinate, max_distance: float = 2000) -> Optional[Coordinate]:
        """Find the nearest point on the road network"""
        nearest_point = None
        min_distance = float('inf')
        
        for segment in self.road_segments:
            for coord in segment.coordinates:
                distance = target.distance_to(coord)
                if distance < min_distance and distance <= max_distance:
                    min_distance = distance
                    nearest_point = coord
        
        if nearest_point:
            logger.info(f"Found nearest road point {min_distance:.1f}m away")
        else:
            logger.warning(f"No road point found within {max_distance}m")
        
        return nearest_point
    
    def calculate_route(self, start: Coordinate, end: Coordinate) -> Optional[List[Coordinate]]:
        """Calculate route using A* algorithm"""
        if not self.loaded:
            logger.error("Road network not loaded")
            return None
        
        # Find nearest road points
        start_road = self.find_nearest_road_point(start, 2000)  # Increased search radius
        end_road = self.find_nearest_road_point(end, 2000)     # Increased search radius
        
        if not start_road or not end_road:
            logger.warning("Could not find road connections for start/end points")
            return None
        
        # Use A* algorithm
        route = self._a_star_search(start_road, end_road)
        
        if route:
            # Add original start/end points if different
            final_route = []
            if start != start_road:
                final_route.append(start)
            final_route.extend(route)
            if end != end_road and end != route[-1]:
                final_route.append(end)
            
            logger.info(f"Calculated route with {len(final_route)} points")
            return final_route
        
        return None
    
    def _a_star_search(self, start: Coordinate, end: Coordinate) -> Optional[List[Coordinate]]:
        """A* pathfinding algorithm"""
        open_set = [(0, start)]  # (f_score, coordinate)
        came_from = {}
        g_score = {start: 0}
        f_score = {start: start.distance_to(end)}
        visited = set()
        
        while open_set:
            current_f, current = heapq.heappop(open_set)
            
            if current in visited:
                continue
                
            visited.add(current)
            
            if current == end:
                # Reconstruct path
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start)
                return list(reversed(path))
            
            # Explore neighbors
            if current in self.routing_graph:
                for segment, point_index in self.routing_graph[current].connected_segments:
                    neighbors = self._get_segment_neighbors(segment, point_index)
                    
                    for neighbor in neighbors:
                        if neighbor in visited:
                            continue
                        
                        # Calculate movement cost
                        tentative_g = g_score[current] + current.distance_to(neighbor)
                        
                        if neighbor not in g_score or tentative_g < g_score[neighbor]:
                            came_from[neighbor] = current
                            g_score[neighbor] = tentative_g
                            f_score[neighbor] = tentative_g + neighbor.distance_to(end)
                            
                            heapq.heappush(open_set, (f_score[neighbor], neighbor))
        
        logger.warning("No route found between points")
        return None
    
    def _get_segment_neighbors(self, segment: RoadSegment, point_index: int) -> List[Coordinate]:
        """Get neighboring points along a road segment"""
        neighbors = []
        coords = segment.coordinates
        
        # Can move to adjacent points in the segment
        if point_index > 0:
            neighbors.append(coords[point_index - 1])
        
        if point_index < len(coords) - 1:
            neighbors.append(coords[point_index + 1])
        
        # Handle oneway restrictions
        if segment.oneway and point_index > 0:
            # Remove backward movement for oneway roads
            if coords[point_index - 1] in neighbors:
                neighbors.remove(coords[point_index - 1])
        
        return neighbors
    
    def get_route_info(self, route: List[Coordinate]) -> Dict:
        """Get route information including distance and estimated time"""
        if len(route) < 2:
            return {"distance": 0, "duration": 0, "segments": []}
        
        total_distance = 0
        total_time = 0
        segments_info = []
        
        for i in range(len(route) - 1):
            current = route[i]
            next_point = route[i + 1]
            
            distance = current.distance_to(next_point)
            total_distance += distance
            
            # Find the road segment for speed calculation
            speed = 40  # Default speed
            road_name = "Unknown Road"
            
            for segment in self.road_segments:
                if current in segment.coordinates and next_point in segment.coordinates:
                    speed = segment.get_speed_limit()
                    road_name = segment.name or f"{segment.highway_type or 'road'}"
                    break
            
            # Calculate time (distance in km / speed in kmh * 3600 for seconds)
            segment_time = (distance / 1000) / speed * 3600
            total_time += segment_time
            
            segments_info.append({
                "distance": distance,
                "duration": segment_time,
                "road_name": road_name,
                "speed_limit": speed
            })
        
        return {
            "distance": total_distance,
            "duration": total_time,
            "segments": segments_info
        }

# Global instance
_routing_service = None

def get_routing_service() -> LocalRoutingService:
    """Get the global routing service instance"""
    global _routing_service
    if _routing_service is None:
        geojson_path = Path(__file__).parent.parent / "data" / "zamboanga_roads.geojson"
        _routing_service = LocalRoutingService(str(geojson_path))
        _routing_service.load_road_network()
    return _routing_service

def calculate_local_route(start_lat: float, start_lng: float, 
                         end_lat: float, end_lng: float) -> Optional[Dict]:
    """Calculate route using local road network"""
    service = get_routing_service()
    
    start = Coordinate(lat=start_lat, lng=start_lng)
    end = Coordinate(lat=end_lat, lng=end_lng)
    
    route = service.calculate_route(start, end)
    
    if route:
        route_info = service.get_route_info(route)
        
        return {
            "success": True,
            "route": [{"lat": coord.lat, "lng": coord.lng} for coord in route],
            "distance": route_info["distance"],
            "duration": route_info["duration"],
            "segments": route_info["segments"],
            "source": "local_geojson"
        }
    
    return None