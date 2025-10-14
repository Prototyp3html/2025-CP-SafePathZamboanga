"""
Local GeoJSON-based routing service for Zamboanga City
Uses filtered road network data from QGIS for precise routing
"""
import json
import math
import heapq
from typing import List, Dict, Tuple, Optional, Set, Any
from dataclasses import dataclass
from pathlib import Path
from collections import defaultdict
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Helper utilities
def _parse_flood_flag(value: Any) -> bool:
    """Convert various truthy/falsey representations into a boolean.

    The terrain GeoJSON stores flood flags as strings ("0"/"1"). Relying on
    Python's ``bool`` conversion treats any non-empty string as ``True``, which
    incorrectly marks roads tagged with "0" as flooded. This helper normalises
    the value before converting it into a boolean so routing costs reflect the
    actual dataset."""

    if isinstance(value, bool):
        return value

    if value is None:
        return False

    if isinstance(value, (int, float)):
        return value != 0

    if isinstance(value, str):
        normalised = value.strip().lower()
        if normalised in {"1", "true", "t", "yes", "y"}:
            return True
        if normalised in {"0", "false", "f", "no", "n", ""}:
            return False

    return False


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
    """Represents a road segment from enhanced terrain GeoJSON"""
    osm_id: str
    road_id: float
    coordinates: List[Coordinate]
    length_m: float
    elev_mean: float
    elev_min: float
    elev_max: float
    flooded: bool  # True if flooded, False if safe
    name: Optional[str] = None
    highway_type: Optional[str] = None
    oneway: bool = False
    maxspeed: int = 40  # Default speed limit
    surface: str = "unknown"
    
    def get_length(self) -> float:
        """Get pre-calculated length from terrain data"""
        return self.length_m
    
    def get_elevation_gain(self) -> float:
        """Calculate elevation gain across segment"""
        return max(0, self.elev_max - self.elev_min)
    
    def get_flood_risk_factor(self) -> float:
        """Get flood risk multiplier for routing cost"""
        return 2.5 if self.flooded else 1.0  # Flooded roads cost 2.5x more
    
    def get_terrain_difficulty(self) -> float:
        """Calculate terrain difficulty based on elevation"""
        elevation_factor = 1.0 + (self.elev_mean / 100.0 * 0.1)  # 10% increase per 100m
        slope_factor = 1.0 + (self.get_elevation_gain() / self.length_m * 10.0)  # Slope penalty
        return elevation_factor * slope_factor
    
    def get_routing_cost(self, transportation_mode: str = "car", risk_profile: str = "safe") -> float:
        """Calculate routing cost based on transportation mode AND flood risk profile
        
        Args:
            transportation_mode: Type of transport (car/motorcycle/walking) - affects speed/roads
            risk_profile: Flood risk tolerance (safe/manageable/prone) - PRIMARY route differentiator
                - "safe": Heavily avoids flooded roads (10x penalty)
                - "manageable": Moderate avoidance (3x penalty)  
                - "prone": Minimal avoidance (1.2x penalty) - shortest path
        """
        base_cost = self.length_m
        
        # FLOOD RISK FACTOR - Primary differentiator based on risk profile
        if risk_profile == "safe":
            # SAFE ROUTE: Extremely high penalty for flooded roads
            flood_factor = 10.0 if self.flooded else 1.0
        elif risk_profile == "manageable":
            # MANAGEABLE ROUTE: Moderate penalty for flooded roads
            flood_factor = 3.0 if self.flooded else 1.0
        else:  # "prone"
            # FLOOD-PRONE ROUTE: Minimal penalty - takes shortest path
            flood_factor = 1.2 if self.flooded else 1.0
        
        # Apply terrain difficulty (elevation, surface)
        terrain_factor = self.get_terrain_difficulty()
        
        # Transportation mode adjustments
        mode_factors = {
            "car": 1.0,
            "motorcycle": 0.9,  # Motorcycles slightly faster
            "walking": 2.0      # Walking is slower
        }
        mode_factor = mode_factors.get(transportation_mode, 1.0)
        
        return base_cost * flood_factor * terrain_factor * mode_factor
    
    def get_speed_limit(self) -> int:
        """Get speed limit with terrain adjustments"""
        base_speed = self.maxspeed
        
        # Reduce speed on steep or flooded roads
        if self.flooded:
            base_speed = min(base_speed, 25)  # Max 25 km/h on flooded roads
        
        if self.get_elevation_gain() > 20:  # Steep roads
            base_speed = min(base_speed, 35)
            
        return max(10, base_speed)  # Minimum 10 km/h
    
    def get_terrain_adjusted_speed(self, mode: str = "car") -> int:
        """Get speed adjusted for terrain and transportation mode"""
        base_speed = self.get_speed_limit()
        
        # Mode-specific adjustments
        if mode == "walking":
            return min(5, base_speed)  # Walking speed in km/h
        elif mode == "motorcycle":
            return int(base_speed * 1.1)  # Motorcycles slightly faster
        
        return base_speed

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
        self.spatial_grid: Dict[Tuple[int, int], List[RoadSegment]] = defaultdict(list)
        self.grid_size = 0.001  # ~111 meters per grid cell at equator
        self.loaded = False
        
    def load_road_network(self) -> bool:
        """Load and process the GeoJSON road network"""
        # Skip if already loaded
        if self.loaded and self.road_segments:
            logger.debug("Road network already loaded, skipping reload")
            return True
            
        try:
            with open(self.geojson_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            logger.info(f"Loading {len(data['features'])} road features")
            
            for i, feature in enumerate(data['features']):
                try:
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
                    
                    # Parse properties - Enhanced for terrain data
                    name = properties.get('name')
                    highway_type = properties.get('highway')
                    
                    # Parse terrain properties with null safety
                    elev_mean = float(properties.get('elev_mean') or 0.0)
                    elev_min = float(properties.get('elev_min') or 0.0) 
                    elev_max = float(properties.get('elev_max') or 0.0)
                    flooded = _parse_flood_flag(properties.get('flooded'))
                    length_m = float(properties.get('length_m') or 100.0)  # Default length if missing
                    road_id_raw = properties.get('road_id') or properties.get('fid') or 0
                    road_id = float(road_id_raw)
                    
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
                    
                    # Create road segment with terrain data
                    segment = RoadSegment(
                        osm_id=str(properties.get('osm_id', road_id)),  # Use road_id if osm_id not available
                        road_id=road_id,
                        coordinates=coordinates,
                        length_m=length_m,
                        elev_mean=elev_mean,
                        elev_min=elev_min,
                        elev_max=elev_max,
                        flooded=flooded,
                        name=name,
                        highway_type=highway_type,
                        oneway=oneway,
                        maxspeed=maxspeed,
                        surface=surface
                    )
                    
                    self.road_segments.append(segment)
                    
                except Exception as e:
                    logger.error(f"Error processing feature {i}: {e}")
                    logger.error(f"Properties: {properties}")
                    continue
            
            logger.info(f"Loaded {len(self.road_segments)} road segments")
            
            # Build spatial grid index for fast lookups
            self._build_spatial_index()
            
            # Build routing graph
            self._build_routing_graph()
            
            self.loaded = True
            return True
            
        except Exception as e:
            logger.error(f"Error loading road network: {e}")
            return False
    
    def _build_spatial_index(self):
        """Build spatial grid index for fast nearby road lookups"""
        logger.info("Building spatial index...")
        self.spatial_grid.clear()
        
        for segment in self.road_segments:
            # Add segment to all grid cells it touches
            for coord in segment.coordinates:
                grid_x = int(coord.lng / self.grid_size)
                grid_y = int(coord.lat / self.grid_size)
                
                # Add to current cell and 8 neighboring cells for buffer
                for dx in [-1, 0, 1]:
                    for dy in [-1, 0, 1]:
                        cell_key = (grid_x + dx, grid_y + dy)
                        if segment not in self.spatial_grid[cell_key]:
                            self.spatial_grid[cell_key].append(segment)
        
        logger.info(f"Built spatial index with {len(self.spatial_grid)} grid cells")
    
    def _get_nearby_roads_fast(self, coord: Coordinate, buffer_meters: float = 50.0) -> List[RoadSegment]:
        """Fast lookup of nearby roads using spatial index"""
        grid_x = int(coord.lng / self.grid_size)
        grid_y = int(coord.lat / self.grid_size)
        
        # Calculate how many cells to search based on buffer
        cells_to_check = max(1, int(buffer_meters / 111000 / self.grid_size) + 1)
        
        # Use dict to deduplicate by road_id (since RoadSegment isn't hashable)
        nearby_segments_dict = {}
        for dx in range(-cells_to_check, cells_to_check + 1):
            for dy in range(-cells_to_check, cells_to_check + 1):
                cell_key = (grid_x + dx, grid_y + dy)
                for segment in self.spatial_grid.get(cell_key, []):
                    nearby_segments_dict[segment.road_id] = segment
        
        # Filter by actual distance
        result = []
        for segment in nearby_segments_dict.values():
            for seg_coord in segment.coordinates:
                if coord.distance_to(seg_coord) < buffer_meters:
                    result.append(segment)
                    break
        
        return result
    
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
    
    def find_nearest_road_point(self, target: Coordinate, max_distance: float = 5000) -> Optional[Coordinate]:
        """Find the nearest point on the road network"""
        nearest_point = None
        min_distance = float('inf')
        
        logger.info(f"Searching for nearest road point to ({target.lat}, {target.lng}) within {max_distance}m")
        
        for segment in self.road_segments:
            for coord in segment.coordinates:
                distance = target.distance_to(coord)
                if distance < min_distance and distance <= max_distance:
                    min_distance = distance
                    nearest_point = coord
        
        if nearest_point:
            logger.info(f"Found nearest road point at ({nearest_point.lat}, {nearest_point.lng}) - {min_distance:.1f}m away")
        else:
            logger.warning(f"No road point found within {max_distance}m of ({target.lat}, {target.lng})")
            # Try with larger radius as fallback
            logger.info(f"Trying larger search radius...")
            for segment in self.road_segments[:100]:  # Check first 100 segments as sample
                for coord in segment.coordinates:
                    distance = target.distance_to(coord)
                    if distance < min_distance:
                        min_distance = distance
                        nearest_point = coord
            if nearest_point:
                logger.info(f"Fallback: Found road point {min_distance:.1f}m away (beyond normal radius)")
        
        return nearest_point
    
    def calculate_route(self, start: Coordinate, end: Coordinate, mode: str = "car", risk_profile: str = "safe") -> Optional[List[Coordinate]]:
        """Calculate route using A* algorithm with terrain awareness
        
        Args:
            start: Starting coordinate
            end: Ending coordinate
            mode: Transportation mode (car/motorcycle/walking) - affects speed and road preferences
            risk_profile: Flood risk tolerance (safe/manageable/prone) - affects route selection
        """
        if not self.loaded:
            logger.error("Road network not loaded")
            return None
        
        logger.info(f"Calculating {risk_profile} route from ({start.lat}, {start.lng}) to ({end.lat}, {end.lng}) using {mode} mode")
        
        # Find nearest road points
        start_road = self.find_nearest_road_point(start, 5000)  # Increased search radius
        end_road = self.find_nearest_road_point(end, 5000)     # Increased search radius
        
        if not start_road or not end_road:
            logger.error(f"Could not find road connections - start_road: {start_road}, end_road: {end_road}")
            return None
        
        logger.info(f"Using road points: start=({start_road.lat}, {start_road.lng}), end=({end_road.lat}, {end_road.lng})")
        
        # Use A* algorithm with terrain awareness and risk profile
        route = self._a_star_search(start_road, end_road, mode, risk_profile)
        
        if route:
            # Add original start/end points if different
            final_route = []
            if start != start_road:
                final_route.append(start)
            final_route.extend(route)
            if end != end_road and end != route[-1]:
                final_route.append(end)
            
            logger.info(f"Successfully calculated route with {len(final_route)} points")
            return final_route
        else:
            logger.error("A* pathfinding failed to find route")
        
        return None
    
    def _a_star_search(self, start: Coordinate, end: Coordinate, mode: str = "car", risk_profile: str = "safe") -> Optional[List[Coordinate]]:
        """A* pathfinding algorithm with terrain-aware routing costs and flood risk profiles"""
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
                # Reconstruct path with proper road segment following
                path = []
                current_node = current
                while current_node in came_from:
                    path.append(current_node)
                    current_node = came_from[current_node]
                path.append(start)
                
                # Reverse to get start->end order
                path = list(reversed(path))
                
                # Now fill in the detailed road segments between waypoints
                detailed_path = []
                for i in range(len(path) - 1):
                    current_point = path[i]
                    next_point = path[i + 1]
                    
                    # Find the road segment that connects these points
                    segment_path = self._get_segment_path(current_point, next_point)
                    if segment_path:
                        detailed_path.extend(segment_path[:-1])  # Exclude last point to avoid duplicates
                    else:
                        detailed_path.append(current_point)  # Fallback
                
                # Add the final point
                if path:
                    detailed_path.append(path[-1])
                
                return detailed_path if detailed_path else path
            
            # Explore neighbors
            if current in self.routing_graph:
                for segment, point_index in self.routing_graph[current].connected_segments:
                    neighbors = self._get_segment_neighbors(segment, point_index)
                    
                    for neighbor in neighbors:
                        if neighbor in visited:
                            continue
                        
                        # Calculate terrain-aware movement cost WITH RISK PROFILE
                        base_distance = current.distance_to(neighbor)
                        routing_cost = segment.get_routing_cost(mode, risk_profile)
                        tentative_g = g_score[current] + (base_distance * routing_cost)
                        
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
    
    def _get_segment_path(self, start_point: Coordinate, end_point: Coordinate) -> Optional[List[Coordinate]]:
        """Get the detailed path along a road segment between two points"""
        # Find the segment that contains both points
        for segment in self.road_segments:
            start_idx = None
            end_idx = None
            
            # Find indices of both points in the segment
            for i, coord in enumerate(segment.coordinates):
                if coord == start_point:
                    start_idx = i
                elif coord == end_point:
                    end_idx = i
            
            # If both points are found in this segment
            if start_idx is not None and end_idx is not None:
                # Return the path between them (including both endpoints)
                if start_idx <= end_idx:
                    return segment.coordinates[start_idx:end_idx + 1]
                else:
                    # Reverse direction if needed
                    return list(reversed(segment.coordinates[end_idx:start_idx + 1]))
        
        # If no segment contains both points, return direct connection
        return [start_point, end_point]
    
    def get_route_info(self, route: List[Coordinate], mode: str = "car") -> Dict:
        """Get route information including distance, time, and terrain details"""
        if len(route) < 2:
            return {"distance": 0, "duration": 0, "segments": [], "terrain_summary": {}}
        
        total_distance = 0
        total_time = 0
        segments_info = []
        terrain_summary = {
            "total_elevation_gain": 0,
            "flood_risk_segments": 0,
            "steep_segments": 0,
            "avg_elevation": 0
        }
        
        elevations = []
        
        for i in range(len(route) - 1):
            current = route[i]
            next_point = route[i + 1]
            
            distance = current.distance_to(next_point)
            total_distance += distance
            
            # Find the road segment for detailed calculations
            speed = 40  # Default speed
            road_name = "Unknown Road"
            elevation_info = {}
            flood_risk = False
            
            for segment in self.road_segments:
                if current in segment.coordinates and next_point in segment.coordinates:
                    speed = segment.get_terrain_adjusted_speed(mode)
                    road_name = segment.name or f"{segment.highway_type or 'road'}"
                    
                    # Collect terrain information
                    elevation_info = {
                        "elev_mean": segment.elev_mean,
                        "elev_min": segment.elev_min,
                        "elev_max": segment.elev_max,
                        "elevation_gain": segment.get_elevation_gain()
                    }
                    elevations.append(segment.elev_mean)
                    terrain_summary["total_elevation_gain"] += segment.get_elevation_gain()
                    
                    if segment.flooded:
                        flood_risk = True
                        terrain_summary["flood_risk_segments"] += 1
                    
                    if segment.get_terrain_difficulty() > 1.2:
                        terrain_summary["steep_segments"] += 1
                    
                    break
            
            # Calculate time (distance in km / speed in kmh * 3600 for seconds)
            segment_time = (distance / 1000) / speed * 3600
            total_time += segment_time
            
            segments_info.append({
                "distance": distance,
                "duration": segment_time,
                "road_name": road_name,
                "speed_limit": speed,
                "elevation_info": elevation_info,
                "flood_risk": flood_risk
            })
        
        # Calculate terrain summary
        if elevations:
            terrain_summary["avg_elevation"] = sum(elevations) / len(elevations)
        
        return {
            "distance": total_distance,
            "duration": total_time,
            "segments": segments_info,
            "terrain_summary": terrain_summary
        }

# Global instance
_routing_service = None

def get_routing_service() -> LocalRoutingService:
    """Get the global routing service instance"""
    global _routing_service
    if _routing_service is None:
        geojson_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
        _routing_service = LocalRoutingService(str(geojson_path))
        _routing_service.load_road_network()
    return _routing_service

def calculate_local_route(start_lat: float, start_lng: float, 
                         end_lat: float, end_lng: float, mode: str = "car") -> Optional[Dict]:
    """Calculate route using local road network with terrain awareness"""
    service = get_routing_service()
    
    start = Coordinate(lat=start_lat, lng=start_lng)
    end = Coordinate(lat=end_lat, lng=end_lng)
    
    route = service.calculate_route(start, end, mode)
    
    if route:
        route_info = service.get_route_info(route, mode)

        return {
            "success": True,
            "route": [{"lat": coord.lat, "lng": coord.lng} for coord in route],
            "distance": route_info["distance"],
            "duration": route_info["duration"],
            "segments": route_info["segments"],
            "terrain_summary": route_info["terrain_summary"],
            "source": "local_geojson_terrain"
        }

    return None


def analyze_route_flood_risk(
    route_coordinates: List[Tuple[float, float]], 
    buffer_meters: float = 50.0,
    weather_data: dict = None
) -> Dict[str, Any]:
    """
    Analyze a route (from OSRM) against GeoJSON flood data with real-time weather impact.
    
    Args:
        route_coordinates: List of (lng, lat) tuples
        buffer_meters: Distance to search for nearby road segments
        weather_data: Current weather conditions (precipitation, wind, etc.)
        
    Returns:
        Dict with flood analysis: flood_score, flooded_percentage, risk_level, etc.
    """
    service = get_routing_service()
    
    if not service.loaded or not route_coordinates or len(route_coordinates) < 2:
        return {
            "flood_score": 0,
            "flooded_distance_m": 0,
            "safe_distance_m": 0,
            "total_distance_m": 0,
            "flooded_percentage": 0,
            "risk_level": "unknown",
            "segments_analyzed": 0,
            "weather_impact": "none"
        }
    
    # Extract weather conditions with safe defaults
    precipitation_mm = weather_data.get("precipitation_mm", 0.0) if weather_data else 0.0
    wind_kph = weather_data.get("wind_kph", 0.0) if weather_data else 0.0
    
    # Calculate weather impact multiplier
    weather_multiplier = 1.0
    weather_impact = "none"
    
    # Heavy rain increases flood risk significantly
    if precipitation_mm > 50:
        weather_multiplier = 2.5  # Extreme rain: 2.5x flood risk
        weather_impact = "severe"
    elif precipitation_mm > 25:
        weather_multiplier = 2.0  # Heavy rain: 2x flood risk
        weather_impact = "high"
    elif precipitation_mm > 10:
        weather_multiplier = 1.5  # Moderate rain: 1.5x flood risk
        weather_impact = "moderate"
    elif precipitation_mm > 5:
        weather_multiplier = 1.2  # Light rain: 1.2x flood risk
        weather_impact = "low"
    
    # Strong winds add additional safety concerns
    if wind_kph > 60:
        weather_multiplier *= 1.3  # Very strong winds
        if weather_impact == "none":
            weather_impact = "moderate"
    elif wind_kph > 40:
        weather_multiplier *= 1.15  # Strong winds
        if weather_impact == "none":
            weather_impact = "low"
    
    flooded_distance = 0.0
    safe_distance = 0.0
    segments_checked = 0
    
    # Analyze each segment of the route
    for i in range(len(route_coordinates) - 1):
        lng1, lat1 = route_coordinates[i]
        lng2, lat2 = route_coordinates[i + 1]
        
        coord1 = Coordinate(lat=lat1, lng=lng1)
        coord2 = Coordinate(lat=lat2, lng=lng2)
        
        segment_distance = coord1.distance_to(coord2)
        
        # Find nearby road segments using FAST spatial index
        midpoint = Coordinate(lat=(lat1 + lat2) / 2, lng=(lng1 + lng2) / 2)
        nearby_segments = service._get_nearby_roads_fast(midpoint, buffer_meters)
        
        # Determine if flooded
        if nearby_segments:
            flooded_count = sum(1 for seg in nearby_segments if seg.flooded)
            is_flooded = flooded_count > len(nearby_segments) / 2
            
            if is_flooded:
                # Apply weather multiplier to flooded segments
                flooded_distance += segment_distance * weather_multiplier
            else:
                safe_distance += segment_distance
        else:
            safe_distance += segment_distance
        
        segments_checked += 1
    
    total_distance = flooded_distance + safe_distance
    flooded_percentage = (flooded_distance / total_distance * 100) if total_distance > 0 else 0
    flood_score = min(100, flooded_percentage)
    
    # Weather-adjusted risk level (more conservative thresholds during bad weather)
    if weather_impact in ["severe", "high"]:
        # Stricter thresholds during heavy rain
        if flooded_percentage < 10:
            risk_level = "safe"
        elif flooded_percentage < 30:
            risk_level = "manageable"
        else:
            risk_level = "prone"
    else:
        # Normal thresholds
        if flooded_percentage < 20:
            risk_level = "safe"
        elif flooded_percentage < 50:
            risk_level = "manageable"
        else:
            risk_level = "prone"
    
    weather_info = f" (weather: {weather_impact}, {precipitation_mm:.1f}mm rain, {wind_kph:.0f}kph wind)" if weather_data else ""
    logger.info(f"Route analysis: {flooded_percentage:.1f}% flooded ({flooded_distance:.0f}m/{total_distance:.0f}m) - {risk_level}{weather_info}")
    
    return {
        "flood_score": round(flood_score, 2),
        "flooded_distance_m": round(flooded_distance, 2),
        "safe_distance_m": round(safe_distance, 2),
        "total_distance_m": round(total_distance, 2),
        "flooded_percentage": round(flooded_percentage, 2),
        "risk_level": risk_level,
        "segments_analyzed": segments_checked,
        "weather_impact": weather_impact,
        "weather_multiplier": round(weather_multiplier, 2)
    }
