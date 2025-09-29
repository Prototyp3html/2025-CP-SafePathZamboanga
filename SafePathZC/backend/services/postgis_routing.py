"""
PostGIS-powered terrain-aware routing service for SafePath Zamboanga
High-performance spatial routing with flood risk and elevation awareness
"""

import psycopg2
import psycopg2.extras
from typing import Dict, List, Optional, Tuple
import logging
from dataclasses import dataclass
import json
import time
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

@dataclass
class Coordinate:
    """Geographic coordinate"""
    lat: float
    lng: float
    
    def to_point_wkt(self) -> str:
        """Convert to PostGIS POINT WKT format"""
        return f"POINT({self.lng} {self.lat})"

@dataclass
class RouteSegment:
    """Enhanced route segment with terrain data"""
    id: int
    road_id: str
    name: Optional[str]
    highway_type: Optional[str]
    coordinates: List[Coordinate]
    distance_m: float
    duration_s: float
    
    # Terrain properties
    elev_mean: float
    elev_min: float
    elev_max: float
    slope_gradient: float
    flood_status: bool
    flood_risk_level: str
    
    # Routing costs
    car_cost: float
    motorcycle_cost: float
    walking_cost: float

@dataclass
class RouteResult:
    """Complete route with terrain analysis"""
    success: bool
    route_coordinates: List[Coordinate]
    segments: List[RouteSegment]
    total_distance_m: float
    total_duration_s: float
    terrain_summary: Dict
    calculation_time_ms: float
    source: str = "postgis"

class PostGISRoutingService:
    """High-performance PostGIS-based routing service"""
    
    def __init__(self, db_config: Dict[str, str]):
        self.db_config = db_config
        self.conn = None
        self.cursor = None
        self._connection_pool = None
        
    def connect(self) -> bool:
        """Connect to PostGIS database with connection pooling"""
        try:
            self.conn = psycopg2.connect(
                host=self.db_config['host'],
                database=self.db_config['database'],
                user=self.db_config['user'],
                password=self.db_config['password'],
                port=self.db_config.get('port', 5432)
            )
            self.cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            
            # Test connection with a simple query
            self.cursor.execute("SELECT PostGIS_version();")
            version = self.cursor.fetchone()
            logger.info(f"Connected to PostGIS {version['postgis_version']}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to PostGIS: {e}")
            return False
    
    def find_nearest_road(self, coordinate: Coordinate, max_distance_m: float = 2000) -> Optional[Tuple[int, float, Coordinate]]:
        """Find nearest road point using spatial index"""
        try:
            start_time = time.time()
            
            self.cursor.execute("""
                SELECT 
                    r.id,
                    ST_Distance(r.geom::geography, ST_GeomFromText(%s, 4326)::geography) as distance_m,
                    ST_X(ST_ClosestPoint(r.geom, ST_GeomFromText(%s, 4326))) as closest_lng,
                    ST_Y(ST_ClosestPoint(r.geom, ST_GeomFromText(%s, 4326))) as closest_lat
                FROM roads r
                WHERE ST_DWithin(
                    r.geom::geography, 
                    ST_GeomFromText(%s, 4326)::geography, 
                    %s
                )
                ORDER BY r.geom <-> ST_GeomFromText(%s, 4326)
                LIMIT 1;
            """, (
                coordinate.to_point_wkt(), coordinate.to_point_wkt(), coordinate.to_point_wkt(),
                coordinate.to_point_wkt(), max_distance_m, coordinate.to_point_wkt()
            ))
            
            result = self.cursor.fetchone()
            query_time = (time.time() - start_time) * 1000
            
            if result:
                logger.info(f"Found nearest road in {query_time:.1f}ms, distance: {result['distance_m']:.1f}m")
                return (
                    result['id'],
                    result['distance_m'],
                    Coordinate(lat=result['closest_lat'], lng=result['closest_lng'])
                )
            
            logger.warning(f"No road found within {max_distance_m}m")
            return None
            
        except Exception as e:
            logger.error(f"Error finding nearest road: {e}")
            return None
    
    def calculate_route_dijkstra(self, start: Coordinate, end: Coordinate, mode: str = "car") -> Optional[RouteResult]:
        """Calculate route using pgRouting Dijkstra algorithm with terrain awareness"""
        try:
            start_time = time.time()
            
            # Find nearest road points
            start_road = self.find_nearest_road(start)
            end_road = self.find_nearest_road(end)
            
            if not start_road or not end_road:
                return RouteResult(
                    success=False,
                    route_coordinates=[],
                    segments=[],
                    total_distance_m=0,
                    total_duration_s=0,
                    terrain_summary={},
                    calculation_time_ms=(time.time() - start_time) * 1000
                )
            
            start_road_id, _, start_point = start_road
            end_road_id, _, end_point = end_road
            
            # Use pgRouting for shortest path calculation
            route_query = """
                WITH route_path AS (
                    SELECT * FROM pgr_dijkstra(
                        'SELECT id, source, target, cost, reverse_cost 
                         FROM roads_network WHERE mode = %s',
                        %s, %s, directed := true
                    )
                )
                SELECT 
                    rp.seq,
                    rp.node,
                    rp.edge,
                    rp.cost,
                    rn.the_geom,
                    rn.road_id,
                    r.name,
                    r.highway_type,
                    r.elev_mean,
                    r.elev_min,
                    r.elev_max,
                    r.slope_gradient,
                    r.flood_status,
                    r.flood_risk_level,
                    r.length_m,
                    r.car_cost_multiplier,
                    r.motorcycle_cost_multiplier,
                    r.walking_cost_multiplier
                FROM route_path rp
                LEFT JOIN roads_network rn ON rp.edge = rn.id AND rn.mode = %s
                LEFT JOIN roads r ON rn.road_id = r.road_id
                WHERE rp.edge != -1
                ORDER BY rp.seq;
            """
            
            self.cursor.execute(route_query, (mode, start_road_id, end_road_id, mode))
            route_data = self.cursor.fetchall()
            
            if not route_data:
                logger.warning("No route found using pgRouting")
                return RouteResult(
                    success=False,
                    route_coordinates=[],
                    segments=[],
                    total_distance_m=0,
                    total_duration_s=0,
                    terrain_summary={},
                    calculation_time_ms=(time.time() - start_time) * 1000
                )
            
            # Process route data
            route_coordinates = [start]  # Start with original start point
            segments = []
            total_distance_m = 0
            total_duration_s = 0
            terrain_summary = {
                'total_elevation_gain': 0,
                'flood_risk_segments': 0,
                'steep_segments': 0,
                'avg_elevation': 0,
                'max_slope': 0
            }
            
            elevations = []
            
            for segment_data in route_data:
                if not segment_data['the_geom']:
                    continue
                
                # Parse geometry coordinates
                self.cursor.execute("SELECT ST_AsGeoJSON(%s);", (segment_data['the_geom'],))
                geom_json = json.loads(self.cursor.fetchone()['st_asgeojson'])
                coords = [
                    Coordinate(lat=coord[1], lng=coord[0]) 
                    for coord in geom_json['coordinates']
                ]
                
                # Add coordinates to route (avoiding duplicates)
                for coord in coords:
                    if not route_coordinates or (coord.lat != route_coordinates[-1].lat or coord.lng != route_coordinates[-1].lng):
                        route_coordinates.append(coord)
                
                # Calculate segment metrics
                distance_m = float(segment_data['length_m'] or 0)
                total_distance_m += distance_m
                
                # Calculate duration based on mode and terrain
                cost_multiplier = {
                    'car': segment_data['car_cost_multiplier'],
                    'motorcycle': segment_data['motorcycle_cost_multiplier'],
                    'walking': segment_data['walking_cost_multiplier']
                }.get(mode, 1.0)
                
                base_speed_kmh = {'car': 40, 'motorcycle': 35, 'walking': 5}.get(mode, 40)
                actual_speed_kmh = base_speed_kmh / cost_multiplier
                duration_s = (distance_m / 1000) / actual_speed_kmh * 3600
                total_duration_s += duration_s
                
                # Terrain analysis
                elev_mean = float(segment_data['elev_mean'] or 0)
                elev_min = float(segment_data['elev_min'] or 0)
                elev_max = float(segment_data['elev_max'] or 0)
                slope_gradient = float(segment_data['slope_gradient'] or 0)
                
                elevations.append(elev_mean)
                terrain_summary['total_elevation_gain'] += abs(elev_max - elev_min)
                terrain_summary['max_slope'] = max(terrain_summary['max_slope'], slope_gradient)
                
                if segment_data['flood_status']:
                    terrain_summary['flood_risk_segments'] += 1
                
                if slope_gradient > 8:
                    terrain_summary['steep_segments'] += 1
                
                # Create route segment
                segment = RouteSegment(
                    id=segment_data['edge'],
                    road_id=segment_data['road_id'] or '',
                    name=segment_data['name'],
                    highway_type=segment_data['highway_type'],
                    coordinates=coords,
                    distance_m=distance_m,
                    duration_s=duration_s,
                    elev_mean=elev_mean,
                    elev_min=elev_min,
                    elev_max=elev_max,
                    slope_gradient=slope_gradient,
                    flood_status=bool(segment_data['flood_status']),
                    flood_risk_level=segment_data['flood_risk_level'] or 'LOW',
                    car_cost=float(segment_data['car_cost_multiplier'] or 1.0),
                    motorcycle_cost=float(segment_data['motorcycle_cost_multiplier'] or 1.0),
                    walking_cost=float(segment_data['walking_cost_multiplier'] or 1.0)
                )
                
                segments.append(segment)
            
            # Add original end point
            route_coordinates.append(end)
            
            # Complete terrain summary
            if elevations:
                terrain_summary['avg_elevation'] = sum(elevations) / len(elevations)
            
            calculation_time_ms = (time.time() - start_time) * 1000
            
            logger.info(f"Route calculated in {calculation_time_ms:.1f}ms: {len(segments)} segments, {total_distance_m:.0f}m")
            
            return RouteResult(
                success=True,
                route_coordinates=route_coordinates,
                segments=segments,
                total_distance_m=total_distance_m,
                total_duration_s=total_duration_s,
                terrain_summary=terrain_summary,
                calculation_time_ms=calculation_time_ms
            )
            
        except Exception as e:
            logger.error(f"Error calculating route: {e}")
            return RouteResult(
                success=False,
                route_coordinates=[],
                segments=[],
                total_distance_m=0,
                total_duration_s=0,
                terrain_summary={},
                calculation_time_ms=(time.time() - start_time) * 1000
            )
    
    def get_route_alternatives(self, start: Coordinate, end: Coordinate, mode: str = "car", 
                              alternatives: int = 3) -> List[RouteResult]:
        """Get multiple route alternatives with different optimization criteria"""
        try:
            routes = []
            
            # Primary route (shortest distance)
            primary_route = self.calculate_route_dijkstra(start, end, mode)
            if primary_route.success:
                routes.append(primary_route)
            
            # Alternative routes with different criteria
            if alternatives > 1:
                # Route avoiding floods (if any flood segments exist)
                if primary_route.terrain_summary.get('flood_risk_segments', 0) > 0:
                    flood_free_route = self._calculate_route_avoiding_floods(start, end, mode)
                    if flood_free_route and flood_free_route.success:
                        routes.append(flood_free_route)
                
                # Route minimizing elevation changes
                if alternatives > 2:
                    flat_route = self._calculate_route_minimize_elevation(start, end, mode)
                    if flat_route and flat_route.success:
                        routes.append(flat_route)
            
            return routes[:alternatives]
            
        except Exception as e:
            logger.error(f"Error getting route alternatives: {e}")
            return []
    
    def _calculate_route_avoiding_floods(self, start: Coordinate, end: Coordinate, mode: str) -> Optional[RouteResult]:
        """Calculate route avoiding flooded areas"""
        # This would use a modified network excluding flooded roads
        # Implementation similar to calculate_route_dijkstra but with flood filtering
        pass
    
    def _calculate_route_minimize_elevation(self, start: Coordinate, end: Coordinate, mode: str) -> Optional[RouteResult]:
        """Calculate route minimizing elevation changes"""
        # This would use elevation gain as the primary cost factor
        # Implementation similar to calculate_route_dijkstra but with elevation-based costs
        pass
    
    def get_network_statistics(self) -> Dict:
        """Get network statistics for monitoring and debugging"""
        try:
            stats = {}
            
            # Basic network stats
            self.cursor.execute("""
                SELECT 
                    COUNT(*) as total_roads,
                    SUM(length_m) as total_length_km,
                    AVG(elev_mean) as avg_elevation,
                    COUNT(*) FILTER (WHERE flood_status = true) as flooded_roads,
                    AVG(slope_gradient) as avg_slope
                FROM roads;
            """)
            basic_stats = self.cursor.fetchone()
            stats.update(basic_stats)
            stats['total_length_km'] = float(stats['total_length_km'] or 0) / 1000
            
            # Routing network stats by mode
            self.cursor.execute("""
                SELECT mode, COUNT(*) as edge_count 
                FROM roads_network 
                GROUP BY mode;
            """)
            routing_stats = {row['mode']: row['edge_count'] for row in self.cursor.fetchall()}
            stats['routing_networks'] = routing_stats
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting network statistics: {e}")
            return {}
    
    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()

# Global service instance
_postgis_routing_service = None

def get_postgis_routing_service() -> PostGISRoutingService:
    """Get global PostGIS routing service instance"""
    global _postgis_routing_service
    if _postgis_routing_service is None:
        db_config = {
            'host': os.getenv('POSTGRES_HOST', 'localhost'),
            'database': os.getenv('POSTGRES_DB', 'safepath_zamboanga'),
            'user': os.getenv('POSTGRES_USER', 'postgres'),
            'password': os.getenv('POSTGRES_PASSWORD', 'password'),
            'port': os.getenv('POSTGRES_PORT', '5432')
        }
        
        _postgis_routing_service = PostGISRoutingService(db_config)
        if not _postgis_routing_service.connect():
            logger.error("Failed to initialize PostGIS routing service")
            return None
            
    return _postgis_routing_service

def calculate_postgis_route(start_lat: float, start_lng: float, 
                           end_lat: float, end_lng: float, 
                           mode: str = "car") -> Optional[Dict]:
    """Calculate route using PostGIS with terrain awareness"""
    service = get_postgis_routing_service()
    if not service:
        return None
    
    start = Coordinate(lat=start_lat, lng=start_lng)
    end = Coordinate(lat=end_lat, lng=end_lng)
    
    result = service.calculate_route_dijkstra(start, end, mode)
    
    if result.success:
        return {
            "success": True,
            "route": [{"lat": coord.lat, "lng": coord.lng} for coord in result.route_coordinates],
            "distance": result.total_distance_m,
            "duration": result.total_duration_s,
            "segments": [
                {
                    "distance": seg.distance_m,
                    "duration": seg.duration_s,
                    "road_name": seg.name or f"{seg.highway_type or 'road'}",
                    "elevation_info": {
                        "elev_mean": seg.elev_mean,
                        "elev_min": seg.elev_min,
                        "elev_max": seg.elev_max,
                        "slope_gradient": seg.slope_gradient
                    },
                    "flood_risk": seg.flood_status,
                    "flood_risk_level": seg.flood_risk_level
                }
                for seg in result.segments
            ],
            "terrain_summary": result.terrain_summary,
            "calculation_time_ms": result.calculation_time_ms,
            "source": "postgis_terrain"
        }
    
    return None