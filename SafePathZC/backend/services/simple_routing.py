"""
Simplified PostgreSQL-based routing service
Alternative to PostGIS for terrain-aware routing
"""

import json
import math
import heapq
import logging
import psycopg2
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class RouteRequest:
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    vehicle_type: str = "car"  # car, motorcycle, walking
    avoid_floods: bool = True
    max_slope: Optional[float] = None

@dataclass
class RouteResponse:
    route: List[List[float]]  # [[lat, lng], [lat, lng], ...]
    distance_km: float
    estimated_time_minutes: float
    terrain_info: Dict[str, Any]
    calculation_time_ms: float

class SimplePostGISRoutingService:
    """Simplified routing using PostgreSQL without PostGIS extensions"""
    
    def __init__(self):
        self.db_config = {
            'host': 'localhost',
            'database': 'safepathzc',
            'user': 'safepathzc_user',
            'password': 'safepath123',
            'port': 5432
        }
        self.conn = None
        self._road_network = {}  # Cache for road network
        self._network_loaded = False
        
    def connect(self) -> bool:
        """Connect to PostgreSQL"""
        try:
            self.conn = psycopg2.connect(**self.db_config)
            return True
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            return False
    
    def load_road_network(self) -> bool:
        """Load road network from database into memory for routing"""
        if not self.connect():
            return False
            
        try:
            cursor = self.conn.cursor()
            
            # Load all roads with their coordinates and properties
            cursor.execute("""
                SELECT road_id, coordinates_json, car_cost_multiplier, 
                       motorcycle_cost_multiplier, walking_cost_multiplier,
                       length_m, flood_status, slope_gradient, highway_type
                FROM roads_simple
                WHERE coordinates_json IS NOT NULL
            """)
            
            roads = cursor.fetchall()
            logger.info(f"Loading {len(roads)} road segments...")
            
            # Build adjacency list for routing
            node_connections = {}  # node_id -> [neighbor_nodes with costs]
            
            for road in roads:
                road_id, coords_json, car_cost, moto_cost, walk_cost, length, flooded, slope, highway = road
                
                try:
                    coordinates = json.loads(coords_json)
                    if len(coordinates) < 2:
                        continue
                    
                    # Convert coordinates to simplified node IDs (rounded to reduce precision)
                    nodes = []
                    for coord in coordinates:
                        # Round to ~10m precision for node matching
                        lat = round(coord[1], 4)
                        lng = round(coord[0], 4)
                        node_id = f"{lat}_{lng}"
                        nodes.append((node_id, lat, lng))
                    
                    # Create edges between consecutive nodes
                    for i in range(len(nodes) - 1):
                        start_node = nodes[i]
                        end_node = nodes[i + 1]
                        
                        # Calculate segment distance
                        segment_distance = self._haversine_distance(
                            start_node[1], start_node[2],
                            end_node[1], end_node[2]
                        )
                        
                        # Store edge with costs
                        edge_data = {
                            'distance': segment_distance,
                            'car_cost': car_cost,
                            'motorcycle_cost': moto_cost,
                            'walking_cost': walk_cost,
                            'flooded': flooded,
                            'slope': slope,
                            'highway': highway,
                            'road_id': road_id
                        }
                        
                        # Add bidirectional edges
                        if start_node[0] not in node_connections:
                            node_connections[start_node[0]] = {
                                'lat': start_node[1], 'lng': start_node[2], 'edges': []
                            }
                        if end_node[0] not in node_connections:
                            node_connections[end_node[0]] = {
                                'lat': end_node[1], 'lng': end_node[2], 'edges': []
                            }
                        
                        node_connections[start_node[0]]['edges'].append({
                            'to': end_node[0], **edge_data
                        })
                        node_connections[end_node[0]]['edges'].append({
                            'to': start_node[0], **edge_data
                        })
                        
                except json.JSONDecodeError:
                    continue
            
            self._road_network = node_connections
            self._network_loaded = True
            logger.info(f"Road network loaded: {len(node_connections)} nodes")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load road network: {e}")
            return False
    
    def find_route(self, request: RouteRequest) -> Optional[RouteResponse]:
        """Find route using simplified Dijkstra algorithm"""
        start_time = datetime.now()
        
        if not self._network_loaded:
            if not self.load_road_network():
                return None
        
        # Find nearest nodes to start and end points
        start_node = self._find_nearest_node(request.start_lat, request.start_lng)
        end_node = self._find_nearest_node(request.end_lat, request.end_lng)
        
        if not start_node or not end_node:
            logger.error("Could not find nearby road nodes")
            return None
        
        # Run Dijkstra's algorithm
        route_nodes = self._dijkstra_route(start_node, end_node, request)
        
        if not route_nodes:
            logger.error("No route found")
            return None
        
        # Convert nodes back to coordinates
        route_coords = []
        total_distance = 0
        terrain_stats = {'avg_slope': 0, 'flooded_segments': 0, 'total_segments': 0}
        
        for i, node_id in enumerate(route_nodes):
            node = self._road_network[node_id]
            route_coords.append([node['lat'], node['lng']])
            
            if i > 0:
                # Calculate segment stats
                prev_node_id = route_nodes[i-1]
                edge = self._find_edge(prev_node_id, node_id)
                if edge:
                    total_distance += edge['distance']
                    terrain_stats['avg_slope'] += edge['slope']
                    terrain_stats['total_segments'] += 1
                    if edge['flooded']:
                        terrain_stats['flooded_segments'] += 1
        
        if terrain_stats['total_segments'] > 0:
            terrain_stats['avg_slope'] /= terrain_stats['total_segments']
        
        # Estimate travel time based on vehicle type
        speed_kmh = {'car': 40, 'motorcycle': 45, 'walking': 5}[request.vehicle_type]
        estimated_time = (total_distance / 1000) / speed_kmh * 60  # minutes
        
        # Add time penalties for terrain
        if terrain_stats['avg_slope'] > 5:
            estimated_time *= (1 + terrain_stats['avg_slope'] / 100)
        if terrain_stats['flooded_segments'] > 0:
            flood_ratio = terrain_stats['flooded_segments'] / terrain_stats['total_segments']
            estimated_time *= (1 + flood_ratio * 0.5)
        
        calculation_time = (datetime.now() - start_time).total_seconds() * 1000
        
        return RouteResponse(
            route=route_coords,
            distance_km=total_distance / 1000,
            estimated_time_minutes=estimated_time,
            terrain_info=terrain_stats,
            calculation_time_ms=calculation_time
        )
    
    def _find_nearest_node(self, lat: float, lng: float) -> Optional[str]:
        """Find the nearest road network node to given coordinates"""
        min_distance = float('inf')
        nearest_node = None
        
        for node_id, node_data in self._road_network.items():
            distance = self._haversine_distance(lat, lng, node_data['lat'], node_data['lng'])
            if distance < min_distance:
                min_distance = distance
                nearest_node = node_id
        
        return nearest_node if min_distance < 1000 else None  # Max 1km to road
    
    def _dijkstra_route(self, start_node: str, end_node: str, request: RouteRequest) -> Optional[List[str]]:
        """Run Dijkstra's algorithm to find shortest path"""
        distances = {start_node: 0}
        previous = {}
        unvisited = [(0, start_node)]
        visited = set()
        
        cost_field = f"{request.vehicle_type}_cost"
        
        while unvisited:
            current_dist, current_node = heapq.heappop(unvisited)
            
            if current_node in visited:
                continue
                
            visited.add(current_node)
            
            if current_node == end_node:
                # Reconstruct path
                path = []
                node = end_node
                while node is not None:
                    path.append(node)
                    node = previous.get(node)
                return path[::-1]
            
            # Check neighbors
            node_data = self._road_network.get(current_node, {})
            for edge in node_data.get('edges', []):
                neighbor = edge['to']
                
                if neighbor in visited:
                    continue
                
                # Apply filters
                if request.avoid_floods and edge['flooded']:
                    continue
                
                if request.max_slope and edge['slope'] > request.max_slope:
                    continue
                
                # Calculate cost
                base_cost = edge['distance']
                multiplier = edge.get(cost_field, 1.0)
                total_cost = current_dist + (base_cost * multiplier)
                
                if neighbor not in distances or total_cost < distances[neighbor]:
                    distances[neighbor] = total_cost
                    previous[neighbor] = current_node
                    heapq.heappush(unvisited, (total_cost, neighbor))
        
        return None  # No path found
    
    def _find_edge(self, from_node: str, to_node: str) -> Optional[Dict]:
        """Find edge data between two nodes"""
        node_data = self._road_network.get(from_node, {})
        for edge in node_data.get('edges', []):
            if edge['to'] == to_node:
                return edge
        return None
    
    def _haversine_distance(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two points in meters"""
        R = 6371000  # Earth's radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lng = math.radians(lng2 - lng1)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get routing service health status"""
        try:
            if not self.connect():
                return {'status': 'error', 'message': 'Database connection failed'}
            
            cursor = self.conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM roads_simple")
            road_count = cursor.fetchone()[0]
            
            return {
                'status': 'healthy',
                'database': 'connected',
                'road_segments': road_count,
                'network_loaded': self._network_loaded,
                'network_nodes': len(self._road_network) if self._network_loaded else 0
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

# Global service instance
simple_routing_service = SimplePostGISRoutingService()