#!/usr/bin/env python3
"""
Real-time Flood Data Updater for SafePath Zamboanga
Fetches live elevation, road, and flood data from multiple APIs
Uses PostgreSQL for persistent caching of elevation and flood history
"""

import asyncio
import aiohttp
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
import math
import os
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, func
import pytz

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Philippine Standard Time (UTC+8)
PHILIPPINE_TZ = pytz.timezone('Asia/Manila')

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
db_engine = create_engine(DATABASE_URL)

# Import models (deferred import to avoid circular dependencies)
def get_db_models():
    """Import models dynamically to avoid import issues"""
    try:
        from models import (
            ElevationCache, 
            FloodedRoadsHistory,
            FloodEventLog,
            FloodStatistics,
            FloodHotspot
        )
        return ElevationCache, FloodedRoadsHistory, FloodEventLog, FloodStatistics, FloodHotspot
    except ImportError:
        logger.warning("Could not import database models - falling back to JSON cache")
        return None, None, None, None, None


@dataclass
class FloodZone:
    """Represents a flood-prone area"""
    lat: float
    lon: float
    flood_level: str  # 'low', 'medium', 'high'
    last_updated: datetime


class FloodDataUpdater:
    """
    Automatically fetch and update flood analysis data from live APIs
    """
    
    # Zamboanga City official boundaries (from government/ChatGPT)
    # Complete coverage of entire Zamboanga City, no Basilan or other municipalities
    ZAMBOANGA_BOUNDS = {
        'min_lat': 6.80,
        'max_lat': 7.20,
        'min_lon': 121.85,
        'max_lon': 122.35
    }
    
    # Known flood-prone areas in Zamboanga (from historical data)
    FLOOD_PRONE_AREAS = [
        {'name': 'Rio Hondo', 'lat': 6.9119, 'lon': 122.0790, 'risk': 'high'},
        {'name': 'Tetuan', 'lat': 6.9210, 'lon': 122.0790, 'risk': 'high'},
        {'name': 'San Jose Gusu', 'lat': 6.9420, 'lon': 122.0730, 'risk': 'medium'},
        {'name': 'Sta. Maria', 'lat': 6.9050, 'lon': 122.0740, 'risk': 'medium'},
        {'name': 'Canelar', 'lat': 6.9060, 'lon': 122.0800, 'risk': 'medium'},
        {'name': 'Pasonanca', 'lat': 6.9380, 'lon': 122.0620, 'risk': 'low'},
    ]
    
    # Cache for water body geometries
    _water_bodies_cache = None
    _water_bodies_cache_time = None
    
    # Cache for flooded status and timestamps
    _flooded_history_cache = None
    _flooded_history_path = None
    
    def __init__(self, cache_dir: str = None, db_session: Optional[Session] = None):
        self.cache_dir = Path(cache_dir) if cache_dir else Path(__file__).parent.parent / "data" / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session: Optional[aiohttp.ClientSession] = None
        
        # Database session for caching
        self.db_session = db_session
        self.ElevationCache, self.FloodedRoadsHistory, self.FloodEventLog, self.FloodStatistics, self.FloodHotspot = get_db_models()
        
        # Set up flooded history file path (fallback if DB unavailable)
        self._flooded_history_path = self.cache_dir / "flooded_history.json"
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def load_roads_from_geojson(self) -> Dict[str, Any]:
        """
        Load complete road network from pre-processed zcroadmap.geojson
        Filters to only include roads within Zamboanga City bounds (no Basilan/outside)
        This provides accurate Zamboanga City coverage only
        """
        logger.info("Loading roads from zcroadmap.geojson...")
        
        road_file = Path(__file__).parent.parent / "data" / "zcroadmap.geojson"
        
        if not road_file.exists():
            logger.error(f"Road file not found: {road_file}")
            return {'elements': []}
        
        try:
            with open(road_file, 'r', encoding='utf-8') as f:
                geojson_data = json.load(f)
            
            features = geojson_data.get('features', [])
            logger.info(f"✅ Loaded {len(features)} roads from zcroadmap.geojson")
            
            # Filter to only Zamboanga City bounds (exclude Basilan)
            def is_in_zamboanga(feature):
                coords = feature.get('geometry', {}).get('coordinates', [])
                for coord in coords:
                    lon, lat = coord[0], coord[1]
                    if (self.ZAMBOANGA_BOUNDS['min_lat'] <= lat <= self.ZAMBOANGA_BOUNDS['max_lat'] and
                        self.ZAMBOANGA_BOUNDS['min_lon'] <= lon <= self.ZAMBOANGA_BOUNDS['max_lon']):
                        return True
                return False
            
            filtered_features = [f for f in features if is_in_zamboanga(f)]
            removed_count = len(features) - len(filtered_features)
            
            if removed_count > 0:
                logger.info(f"   Filtered out {removed_count} roads outside Zamboanga City bounds")
            logger.info(f"   Processing {len(filtered_features)} Zamboanga City roads only")
            
            # Convert GeoJSON features to OSM-like format for compatibility
            # IMPORTANT: Ensure ID format matches existing flood history (add 'w' prefix)
            osm_elements = []
            for feature in filtered_features:
                osm_id = feature.get('properties', {}).get('osm_id', '')
                # Ensure proper OSM ID format: add 'w' prefix if not present
                if osm_id and not str(osm_id).startswith('w'):
                    osm_id = f"w{osm_id}"
                
                # Convert GeoJSON coordinates to lat/lon format for compatibility
                geometry = feature.get('geometry', {}).get('coordinates', [])
                osm_geometry = [{'lat': coord[1], 'lon': coord[0]} for coord in geometry]
                
                element = {
                    'type': 'way',
                    'id': osm_id,
                    'geometry': osm_geometry
                }
                osm_elements.append(element)
            
            return {'elements': osm_elements}
        except Exception as e:
            logger.error(f"Failed to load roads from GeoJSON: {e}")
            return {'elements': []}
    
    async def fetch_osm_roads(self) -> Dict[str, Any]:
        """
        Load road network from local zcroadmap.geojson instead of Overpass API
        Provides complete coverage of Zamboanga City (11,982 roads)
        """
        return self.load_roads_from_geojson()
    
    async def fetch_water_bodies(self) -> List[Dict[str, Any]]:
        """
        Fetch water bodies (coastlines, rivers, lakes) from OpenStreetMap
        This provides accurate water proximity data for flood risk calculations
        CACHE: 1 hour (vs 24h) for more responsive updates during rainy season
        """
        # Check cache first (water bodies change slowly, but check hourly during rainy season)
        cache_validity_hours = 1  # Changed from 24 hours to 1 hour
        if (self._water_bodies_cache and 
            self._water_bodies_cache_time and 
            (datetime.now() - self._water_bodies_cache_time).seconds < cache_validity_hours * 3600):
            logger.info(f"Using cached water body data (age: {(datetime.now() - self._water_bodies_cache_time).seconds // 60} minutes)")
            return self._water_bodies_cache
        
        logger.info("Fetching water bodies from OpenStreetMap...")
        
        # Comprehensive water body query for Zamboanga
        overpass_query = f"""
        [out:json][timeout:180];
        (
          // Natural water bodies
          way["natural"="water"]
            ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
             {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
          relation["natural"="water"]
            ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
             {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
          
          // Waterways (rivers, streams, creeks)
          way["waterway"~"^(river|stream|creek|drain)$"]
            ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
             {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
          
          // Coastline
          way["natural"="coastline"]
            ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
             {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
        );
        out geom;
        """
        
        overpass_url = "https://overpass-api.de/api/interpreter"
        
        try:
            async with self.session.post(overpass_url, data={'data': overpass_query}) as response:
                if response.status == 200:
                    data = await response.json()
                    water_bodies = data.get('elements', [])
                    
                    # Process and categorize water bodies
                    processed_water_bodies = []
                    for element in water_bodies:
                        if 'geometry' in element:
                            water_type = self._classify_water_body(element)
                            processed_water_bodies.append({
                                'id': element.get('id'),
                                'type': water_type,
                                'name': element.get('tags', {}).get('name', f'Unknown {water_type}'),
                                'geometry': element['geometry'],
                                'coordinates': [(node['lon'], node['lat']) for node in element['geometry']]
                            })
                    
                    # Cache the results
                    self._water_bodies_cache = processed_water_bodies
                    self._water_bodies_cache_time = datetime.now()
                    
                    logger.info(f"Fetched {len(processed_water_bodies)} water bodies from OSM:")
                    for wb_type in ['coastline', 'river', 'water', 'stream']:
                        count = len([wb for wb in processed_water_bodies if wb['type'] == wb_type])
                        if count > 0:
                            logger.info(f"  - {count} {wb_type}(s)")
                    
                    return processed_water_bodies
                else:
                    logger.error(f"OSM water bodies API error: {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Failed to fetch water bodies: {e}")
            return []
    
    def _classify_water_body(self, element: Dict[str, Any]) -> str:
        """Classify water body type from OSM tags"""
        tags = element.get('tags', {})
        
        if tags.get('natural') == 'coastline':
            return 'coastline'
        elif tags.get('waterway') in ['river', 'stream', 'creek', 'drain']:
            return tags.get('waterway')
        elif tags.get('natural') == 'water':
            water_type = tags.get('water', 'water')
            return water_type if water_type in ['lake', 'pond', 'reservoir'] else 'water'
        else:
            return 'water'
    
    def calculate_water_proximity(self, lat: float, lon: float, water_bodies: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Calculate distance to nearest water bodies of different types
        Returns distances in meters to coastline, rivers, and other water bodies
        """
        min_distances = {
            'coastline': float('inf'),
            'river': float('inf'),
            'stream': float('inf'),
            'water': float('inf'),  # Lakes, ponds, etc.
            'overall': float('inf')
        }
        
        point_coord = (lon, lat)
        
        for water_body in water_bodies:
            wb_type = water_body['type']
            coordinates = water_body['coordinates']
            
            # Calculate minimum distance to this water body
            min_dist = self._calculate_min_distance_to_geometry(point_coord, coordinates)
            
            # Update minimums
            if wb_type in min_distances:
                min_distances[wb_type] = min(min_distances[wb_type], min_dist)
            min_distances['overall'] = min(min_distances['overall'], min_dist)
        
        # Convert inf to -1 for missing water body types
        for key in min_distances:
            if min_distances[key] == float('inf'):
                min_distances[key] = -1
        
        return min_distances
    
    def _calculate_min_distance_to_geometry(self, point: Tuple[float, float], geometry: List[Tuple[float, float]]) -> float:
        """Calculate minimum distance from point to a line geometry in meters"""
        if not geometry:
            return float('inf')
        
        min_distance = float('inf')
        point_lon, point_lat = point
        
        # Check distance to each line segment in the geometry
        for i in range(len(geometry) - 1):
            seg_start = geometry[i]
            seg_end = geometry[i + 1]
            
            # Distance to line segment
            distance = self._distance_point_to_segment(
                point_lat, point_lon,
                seg_start[1], seg_start[0],  # lat, lon
                seg_end[1], seg_end[0]       # lat, lon
            )
            min_distance = min(min_distance, distance)
        
        return min_distance
    
    def _distance_point_to_segment(self, px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
        """Calculate distance from point to line segment using Haversine formula"""
        # Vector from start to end of segment
        dx = x2 - x1
        dy = y2 - y1
        
        if dx != 0 or dy != 0:
            # Parameter t represents position along line segment (0 = start, 1 = end)
            t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
            
            # Find closest point on segment
            closest_x = x1 + t * dx
            closest_y = y1 + t * dy
        else:
            # Segment is a point
            closest_x, closest_y = x1, y1
        
        # Calculate Haversine distance
        return self._haversine_distance(px, py, closest_x, closest_y)
    
    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points using Haversine formula (returns meters)"""
        R = 6371000  # Earth radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * 
             math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    async def fetch_elevation_data(self, coordinates: List[Tuple[float, float]]) -> Dict[Tuple[float, float], float]:
        """
        Fetch elevation data from Open-Elevation API
        Free and always available
        
        OPTIMIZATION: Uses PostgreSQL cache to avoid refetching
        """
        if not coordinates:
            return {}
        
        logger.info(f"Fetching elevation for {len(coordinates)} points...")
        
        elevation_map = {}
        coordinates_to_fetch = []
        
        # Try to load from PostgreSQL cache first
        if self.db_session and self.ElevationCache:
            try:
                for lat, lon in coordinates:
                    cached = self.db_session.query(self.ElevationCache).filter(
                        self.ElevationCache.latitude == lat,
                        self.ElevationCache.longitude == lon
                    ).first()
                    
                    if cached:
                        elevation_map[(lat, lon)] = cached.elevation
                    else:
                        coordinates_to_fetch.append((lat, lon))
                
                logger.info(f"Loaded {len(elevation_map)} elevations from PostgreSQL cache")
            except Exception as e:
                logger.warning(f"Failed to load elevation cache from DB: {e}")
                coordinates_to_fetch = coordinates
        else:
            # Fallback to JSON cache if DB unavailable
            logger.info("DB not available, using JSON cache fallback")
            elevation_cache_path = self.cache_dir / "elevation_cache.json"
            
            if elevation_cache_path.exists():
                try:
                    with open(elevation_cache_path, 'r', encoding='utf-8') as f:
                        cached = json.load(f)
                        elevation_map = {
                            (float(k.split('_')[0]), float(k.split('_')[1])): v 
                            for k, v in cached.items()
                        }
                        logger.info(f"Loaded {len(elevation_map)} elevations from JSON cache")
                except Exception as e:
                    logger.warning(f"Failed to load JSON elevation cache: {e}")
            
            coordinates_to_fetch = [c for c in coordinates if c not in elevation_map]
        
        if not coordinates_to_fetch:
            logger.info("All elevation data available in cache!")
            return elevation_map
        
        logger.info(f"Fetching {len(coordinates_to_fetch)} new elevations (cache hit: {len(elevation_map)}/{len(coordinates)})")
        
        # Open-Elevation API (free, no key required)
        url = "https://api.open-elevation.com/api/v1/lookup"
        
        # Batch coordinates (max 100 per request)
        batch_size = 100
        
        for i in range(0, len(coordinates_to_fetch), batch_size):
            batch = coordinates_to_fetch[i:i + batch_size]
            locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]
            
            try:
                async with self.session.post(url, json={"locations": locations}, timeout=30) as response:
                    if response.status == 200:
                        data = await response.json()
                        for j, result in enumerate(data.get('results', [])):
                            coord = batch[j]
                            elevation = result.get('elevation', 0.0)
                            elevation_map[coord] = elevation
                            
                            # Save to PostgreSQL cache
                            if self.db_session and self.ElevationCache:
                                try:
                                    cache_entry = self.ElevationCache(
                                        latitude=coord[0],
                                        longitude=coord[1],
                                        elevation=elevation,
                                        cached_at=datetime.utcnow()
                                    )
                                    self.db_session.add(cache_entry)
                                except Exception as e:
                                    logger.debug(f"Could not save elevation to DB: {e}")
                        
                        logger.info(f"Fetched elevation batch {i//batch_size + 1}/{(len(coordinates_to_fetch)-1)//batch_size + 1}")
                    else:
                        logger.warning(f"Elevation API batch {i//batch_size + 1} failed: {response.status}")
                        for coord in batch:
                            elevation_map[coord] = 0.0
                
                await asyncio.sleep(0.1)
                
            except asyncio.TimeoutError:
                logger.error(f"Elevation API batch {i//batch_size + 1} timeout - using defaults")
                for coord in batch:
                    elevation_map[coord] = 0.0
            except Exception as e:
                logger.error(f"Elevation fetch error: {e}")
                for coord in batch:
                    elevation_map[coord] = 0.0
        
        # Save elevation cache to JSON as fallback
        try:
            cache_data = {
                f"{lat}_{lon}": elev 
                for (lat, lon), elev in elevation_map.items()
            }
            elevation_cache_path = self.cache_dir / "elevation_cache.json"
            with open(elevation_cache_path, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f)
            logger.info(f"Saved elevation cache with {len(elevation_map)} entries")
        except Exception as e:
            logger.warning(f"Failed to save elevation JSON cache: {e}")
        
        # Commit database changes
        if self.db_session:
            try:
                self.db_session.commit()
            except Exception as e:
                logger.warning(f"Failed to commit elevation cache to DB: {e}")
                self.db_session.rollback()
        
        return elevation_map
    
    async def fetch_weather_data(self) -> Dict[str, Any]:
        """
        Fetch current weather and hourly rainfall data
        Uses Open-Meteo (free weather API) for better rain detection
        """
        logger.info("Fetching weather data for Zamboanga...")
        
        # Zamboanga City center coordinates
        lat, lon = 6.9214, 122.0790
        
        # Open-Meteo API (free, no key required)
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            'latitude': lat,
            'longitude': lon,
            'current': 'temperature_2m,precipitation,rain,weather_code',
            'hourly': 'precipitation,rain',
            'timezone': 'Asia/Manila',
            'forecast_days': 1
        }
        
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    current = data.get('current', {})
                    
                    # Get hourly rainfall data for better detection
                    hourly_data = data.get('hourly', {})
                    hourly_precip = hourly_data.get('precipitation', [])
                    
                    # Calculate max rainfall in last 6 hours (better indicator of flood risk)
                    max_recent_rainfall = 0
                    if hourly_precip:
                        # Get last 6 hours of data (more sensitive to recent rain)
                        max_recent_rainfall = max(hourly_precip[-6:]) if len(hourly_precip) >= 6 else max(hourly_precip)
                    
                    # Use the maximum of current and recent hourly rainfall
                    current_rainfall = current.get('precipitation', 0)
                    final_rainfall = max(current_rainfall, max_recent_rainfall)
                    
                    logger.info(f"Weather data fetched - Current: {current_rainfall}mm, Last 6h max: {max_recent_rainfall}mm, Using: {final_rainfall}mm")
                    
                    # Return enhanced data with max recent rainfall
                    data['max_recent_rainfall'] = final_rainfall
                    data['current']['precipitation'] = final_rainfall
                    
                    return data
                else:
                    logger.error(f"Weather API error: {response.status}")
                    return {}
        except Exception as e:
            logger.error(f"Failed to fetch weather data: {e}")
            return {}
    
    def calculate_flood_risk(self, elevation: float, rainfall_mm: float, 
                           distance_to_water: float) -> Dict[str, Any]:
        """
        Calculate flood risk based on elevation, rainfall, and distance to water bodies
        
        Args:
            elevation: Height above sea level (meters)
            rainfall_mm: Current/recent rainfall in mm
            distance_to_water: Distance to nearest river/sea (meters)
        
        Returns:
            Dict with flood risk assessment
        """
        flood_score = 0
        
        # FILTER: Reject unrealistic elevation values (<=0 indicates bad API data)
        # Only use elevation data that is realistic (>1m above sea level)
        is_valid_elevation = elevation > 1.0
        
        # Low elevation = VERY high flood risk (critical factor in Zamboanga)
        # BUT ONLY if elevation data is valid/realistic
        if is_valid_elevation:
            if elevation < 3:
                flood_score += 60  
            elif elevation < 5:
                flood_score += 50
            elif elevation < 10:
                flood_score += 30
            elif elevation < 20:
                flood_score += 10
        
        # Heavy rainfall = VERY high flood risk (primary flood cause)
        # Zamboanga gets monsoon rains, so more sensitive detection
        if rainfall_mm > 30:  # Heavy rain (increased sensitivity)
            flood_score += 50  # Increased from 40
        elif rainfall_mm > 15:  # Moderate rain (increased sensitivity)
            flood_score += 30  # Increased from 20
        elif rainfall_mm > 5:  # Light rain
            flood_score += 10  # Increased from 5
        elif rainfall_mm > 2:  # Drizzle
            flood_score += 3
        
        # Close to water bodies = higher flood risk (spillover and overflow)
        if distance_to_water < 50:  # Very close to water
            flood_score += 40  # Increased from 30
        elif distance_to_water < 100:
            flood_score += 35  # Increased from 30
        elif distance_to_water < 500:
            flood_score += 20  # Increased from 15
        elif distance_to_water < 1000:
            flood_score += 8  # Increased from 5
        
        # Determine flood level with adjusted thresholds
        if flood_score >= 80:  # High risk requires significant rainfall OR very close to water
            flood_level = "high"
            flooded = True
        elif flood_score >= 50:  # Medium risk
            flood_level = "medium"
            # Only flood if there's actual rainfall or EXTREME water proximity
            flooded = (rainfall_mm > 2) or (distance_to_water < 50)
        elif flood_score >= 25:  # Low risk
            flood_level = "low"
            flooded = False  # Don't mark as flooded
        else:
            flood_level = "none"
            flooded = False
        
        return {
            'flood_score': flood_score,
            'flood_level': flood_level,
            'flooded': flooded,
            'elevation': elevation,
            'rainfall_mm': rainfall_mm
        }
    
    def calculate_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two coordinates in meters (Haversine formula)"""
        R = 6371000  # Earth's radius in meters
        
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_phi / 2) ** 2 +
             math.cos(phi1) * math.cos(phi2) *
             math.sin(delta_lambda / 2) ** 2)
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c
    
    def find_nearest_flood_zone(self, lat: float, lon: float) -> Tuple[float, str]:
        """Find distance to nearest known flood-prone area"""
        min_distance = float('inf')
        nearest_risk = 'low'
        
        for zone in self.FLOOD_PRONE_AREAS:
            distance = self.calculate_distance(lat, lon, zone['lat'], zone['lon'])
            if distance < min_distance:
                min_distance = distance
                nearest_risk = zone['risk']
        
        return min_distance, nearest_risk
    
    def load_flooded_history(self) -> Dict[str, Any]:
        """Load historical flood data from PostgreSQL, with JSON fallback"""
        # Try PostgreSQL first
        if self.db_session and self.FloodedRoadsHistory:
            try:
                history = {}
                rows = self.db_session.query(self.FloodedRoadsHistory).all()
                for row in rows:
                    history[row.road_id] = {
                        'flooded_start_time': row.last_flood_start.isoformat() if row.last_flood_start else None,
                        'flood_duration_hours': row.current_flood_duration_hours,
                        'times_flooded': row.times_flooded,
                        'last_update': row.updated_at.isoformat(),
                        'last_flooded_hours_ago': (
                            (datetime.utcnow() - row.last_flood_end).total_seconds() / 3600 
                            if row.last_flood_end else 0
                        )
                    }
                logger.info(f"Loaded flooded history from PostgreSQL: {len(history)} roads")
                return history
            except Exception as e:
                logger.warning(f"Failed to load flooded history from DB: {e}")
        
        # Fallback to JSON cache
        if self._flooded_history_path.exists():
            try:
                with open(self._flooded_history_path, 'r', encoding='utf-8') as f:
                    history = json.load(f)
                    logger.info(f"Loaded flooded history from JSON: {len(history)} roads")
                    return history
            except Exception as e:
                logger.warning(f"Failed to load flooded history from JSON: {e}")
        
        return {}
    
    def save_flooded_history(self, history: Dict[str, Any]) -> None:
        """Save historical flood data to PostgreSQL and JSON"""
        # Save to PostgreSQL
        if self.db_session and self.FloodedRoadsHistory:
            try:
                for road_id, data in history.items():
                    # Check if record exists
                    existing = self.db_session.query(self.FloodedRoadsHistory).filter(
                        self.FloodedRoadsHistory.road_id == road_id
                    ).first()
                    
                    last_flood_start = None
                    if data.get('flooded_start_time'):
                        try:
                            last_flood_start = datetime.fromisoformat(data['flooded_start_time'])
                        except:
                            pass
                    
                    if existing:
                        existing.is_flooded = data.get('flooded_start_time') is not None
                        existing.current_flood_duration_hours = data.get('flood_duration_hours', 0)
                        existing.times_flooded = data.get('times_flooded', 0)
                        existing.last_flood_start = last_flood_start
                        existing.updated_at = datetime.utcnow()
                    else:
                        new_record = self.FloodedRoadsHistory(
                            road_id=road_id,
                            is_flooded=data.get('flooded_start_time') is not None,
                            current_flood_duration_hours=data.get('flood_duration_hours', 0),
                            times_flooded=data.get('times_flooded', 0),
                            last_flood_start=last_flood_start,
                            updated_at=datetime.utcnow()
                        )
                        self.db_session.add(new_record)
                
                self.db_session.commit()
                logger.info(f"Saved flooded history to PostgreSQL: {len(history)} roads")
            except Exception as e:
                logger.warning(f"Failed to save flooded history to DB: {e}")
                self.db_session.rollback()
        
        # Also save to JSON as fallback
        try:
            with open(self._flooded_history_path, 'w', encoding='utf-8') as f:
                json.dump(history, f, indent=2)
            logger.info(f"Saved flooded history to JSON: {len(history)} roads")
        except Exception as e:
            logger.warning(f"Failed to save flooded history to JSON: {e}")
    
    def log_flood_event(self, road_id: str, road_name: str, event_type: str, 
                       flood_level: str, rainfall_mm: float, elevation_m: float,
                       distance_to_water_m: float, location_lat: float, 
                       location_lon: float) -> None:
        """
        Log a flood event to the lifetime history database
        
        Args:
            road_id: Road identifier
            road_name: Name of the road
            event_type: 'flood_start' or 'flood_end'
            flood_level: 'low', 'medium', 'high'
            rainfall_mm: Rainfall at time of event
            elevation_m: Road elevation
            distance_to_water_m: Distance to water bodies
            location_lat: Road latitude
            location_lon: Road longitude
        """
        if not self.db_session or not self.FloodEventLog:
            return
        
        try:
            event_log = self.FloodEventLog(
                road_id=road_id,
                road_name=road_name,
                event_type=event_type,
                flood_level=flood_level,
                rainfall_mm=rainfall_mm,
                elevation_m=elevation_m,
                distance_to_water_m=distance_to_water_m,
                location_lat=location_lat,
                location_lon=location_lon,
                event_time=datetime.utcnow(),
                update_source='automated_api'
            )
            self.db_session.add(event_log)
            self.db_session.commit()
            logger.info(f"📝 Logged {event_type} event for {road_name} ({road_id})")
        except Exception as e:
            logger.warning(f"Failed to log flood event: {e}")
            self.db_session.rollback()
    
    def update_flood_hotspot(self, road_id: str, road_name: str, 
                            location_lat: float, location_lon: float,
                            is_currently_flooded: bool, flood_duration_hours: float,
                            flood_level: str) -> None:
        """
        Update flood hotspot data - tracks roads that flood repeatedly
        
        Args:
            road_id: Road identifier
            road_name: Name of the road
            location_lat: Road latitude
            location_lon: Road longitude
            is_currently_flooded: Is it flooded now?
            flood_duration_hours: How long has it been flooded
            flood_level: 'low', 'medium', 'high'
        """
        if not self.db_session or not self.FloodHotspot:
            return
        
        try:
            hotspot = self.db_session.query(self.FloodHotspot).filter(
                self.FloodHotspot.road_id == road_id
            ).first()
            
            now = datetime.utcnow()
            
            if not hotspot:
                # Create new hotspot entry
                hotspot = self.FloodHotspot(
                    road_id=road_id,
                    road_name=road_name,
                    location_lat=location_lat,
                    location_lon=location_lon,
                    total_flood_events=1 if is_currently_flooded else 0,
                    total_flooded_hours=0,
                    first_flood_recorded=now if is_currently_flooded else None,
                    last_flood_start=now if is_currently_flooded else None,
                    flood_risk_score=self._calculate_risk_score(1, 0),
                    last_updated=now
                )
                self.db_session.add(hotspot)
            else:
                # Update existing hotspot
                if is_currently_flooded:
                    # Increment flood event count only on start
                    if not hasattr(hotspot, '_was_flooded_before'):
                        hotspot.total_flood_events += 1
                        hotspot.last_flood_start = now
                    
                    # Update flood risk score based on history
                    hotspot.flood_risk_score = self._calculate_risk_score(
                        hotspot.total_flood_events,
                        hotspot.total_flooded_hours
                    )
                else:
                    # Flood ended - accumulate duration
                    if hotspot.last_flood_start:
                        duration = (now - hotspot.last_flood_start).total_seconds() / 3600
                        hotspot.total_flooded_hours += duration
                        hotspot.last_flood_end = now
                        hotspot.average_flood_duration_hours = (
                            hotspot.total_flooded_hours / max(1, hotspot.total_flood_events)
                        )
                
                hotspot.last_updated = now
                
                # Calculate days since last flood
                if hotspot.last_flood_end:
                    days_since = (now - hotspot.last_flood_end).days
                    hotspot.days_since_last_flood = days_since
            
            self.db_session.commit()
            logger.debug(f"Updated hotspot data for {road_name}")
        except Exception as e:
            logger.warning(f"Failed to update hotspot data: {e}")
            self.db_session.rollback()
    
    def _calculate_risk_score(self, total_flood_events: int, total_flooded_hours: float) -> float:
        """Calculate flood risk score for a hotspot (0-100)"""
        # Base score: frequency (how many times has it flooded)
        frequency_score = min(50, total_flood_events * 5)  # Max 50 points for frequency
        
        # Duration score: total hours flooded
        duration_score = min(50, total_flooded_hours * 0.5)  # Max 50 points for duration
        
        total_score = frequency_score + duration_score
        return min(100, max(0, total_score))
    
    def calculate_flood_duration_hours(self, road_id: str, currently_flooded: bool, 
                                       flooded_history: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate how long a road has been flooded
        
        Args:
            road_id: Unique identifier for the road
            currently_flooded: Is the road flooded right now?
            flooded_history: Previous flood status history
        
        Returns:
            Dict with flood duration info
        """
        now = datetime.now()
        
        if road_id not in flooded_history:
            flooded_history[road_id] = {
                'flooded_start_time': None,
                'flood_duration_hours': 0,
                'times_flooded': 0,
                'last_update': now.isoformat()
            }
        
        road_history = flooded_history[road_id]
        
        # Road was previously flooded
        if road_history['flooded_start_time'] is not None:
            start_time = datetime.fromisoformat(road_history['flooded_start_time'])
            current_duration = (now - start_time).total_seconds() / 3600  # Convert to hours
        else:
            current_duration = 0
        
        # Road just started flooding
        if currently_flooded and road_history['flooded_start_time'] is None:
            road_history['flooded_start_time'] = now.isoformat()
            road_history['times_flooded'] = road_history.get('times_flooded', 0) + 1
            current_duration = 0
            logger.debug(f"🚨 Road {road_id} STARTED FLOODING at {now.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Road stopped flooding
        if not currently_flooded and road_history['flooded_start_time'] is not None:
            total_duration = (now - datetime.fromisoformat(road_history['flooded_start_time'])).total_seconds() / 3600
            road_history['flood_duration_hours'] = round(total_duration, 2)
            road_history['flooded_start_time'] = None
            logger.debug(f"✅ Road {road_id} STOPPED FLOODING after {total_duration:.1f} hours")
            current_duration = 0
        
        # Road still flooded
        if currently_flooded and road_history['flooded_start_time'] is not None:
            road_history['current_flood_duration_hours'] = round(current_duration, 2)
        else:
            road_history['current_flood_duration_hours'] = 0
        
        road_history['last_update'] = now.isoformat()
        
        return {
            'currently_flooded': currently_flooded,
            'flood_duration_hours': road_history.get('current_flood_duration_hours', 0),
            'last_flooded_hours_ago': road_history.get('flood_duration_hours', 0),
            'times_flooded': road_history.get('times_flooded', 0),
            'flooded_start_time': road_history.get('flooded_start_time'),
            'last_update': road_history.get('last_update')
        }
    
    def get_flood_hotspots(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get the top flood hotspots (roads that flood repeatedly)
        
        Args:
            limit: Maximum number of hotspots to return
        
        Returns:
            List of hotspot data sorted by risk score
        """
        if not self.db_session or not self.FloodHotspot:
            return []
        
        try:
            hotspots = self.db_session.query(self.FloodHotspot).filter(
                self.FloodHotspot.total_flood_events > 0
            ).order_by(self.FloodHotspot.flood_risk_score.desc()).limit(limit).all()
            
            result = []
            for hotspot in hotspots:
                result.append({
                    'road_id': hotspot.road_id,
                    'road_name': hotspot.road_name,
                    'location': {
                        'lat': hotspot.location_lat,
                        'lon': hotspot.location_lon
                    },
                    'flood_history': {
                        'total_events': hotspot.total_flood_events,
                        'total_flooded_hours': round(hotspot.total_flooded_hours, 2),
                        'average_duration_hours': round(hotspot.average_flood_duration_hours, 2),
                        'frequency_per_year': round(hotspot.frequency_per_year, 2)
                    },
                    'risk_score': round(hotspot.flood_risk_score, 2),
                    'last_flood': {
                        'start': hotspot.last_flood_start.isoformat() if hotspot.last_flood_start else None,
                        'end': hotspot.last_flood_end.isoformat() if hotspot.last_flood_end else None,
                        'days_since': hotspot.days_since_last_flood
                    },
                    'first_recorded': hotspot.first_flood_recorded.isoformat() if hotspot.first_flood_recorded else None
                })
            
            logger.info(f"Retrieved {len(result)} flood hotspots")
            return result
        except Exception as e:
            logger.error(f"Failed to get flood hotspots: {e}")
            return []
    
    def get_flood_events(self, road_id: str = None, days_back: int = 30, limit: int = 100) -> List[Dict[str, Any]]:
        """
        Get historical flood events for analysis
        
        Args:
            road_id: Optional specific road to query. If None, gets all roads
            days_back: Number of days to look back in history
            limit: Maximum number of events to return
        
        Returns:
            List of flood events with timestamps and details
        """
        if not self.db_session or not self.FloodEventLog:
            return []
        
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_back)
            query = self.db_session.query(self.FloodEventLog).filter(
                self.FloodEventLog.event_time >= cutoff_date
            )
            
            if road_id:
                query = query.filter(self.FloodEventLog.road_id == road_id)
            
            events = query.order_by(self.FloodEventLog.event_time.desc()).limit(limit).all()
            
            result = []
            for event in events:
                result.append({
                    'event_id': event.id,
                    'road_id': event.road_id,
                    'road_name': event.road_name,
                    'event_type': event.event_type,  # 'flood_start' or 'flood_end'
                    'event_time': event.event_time.isoformat(),
                    'flood_level': event.flood_level,
                    'environmental_data': {
                        'rainfall_mm': event.rainfall_mm,
                        'elevation_m': event.elevation_m,
                        'distance_to_water_m': event.distance_to_water_m
                    },
                    'location': {
                        'lat': event.location_lat,
                        'lon': event.location_lon
                    }
                })
            
            logger.info(f"Retrieved {len(result)} flood events")
            return result
        except Exception as e:
            logger.error(f"Failed to get flood events: {e}")
            return []
    
    def get_flood_statistics(self, days_back: int = 30) -> Dict[str, Any]:
        """
        Get aggregate flood statistics over a time period
        
        Args:
            days_back: Number of days to analyze
        
        Returns:
            Dict with flood statistics and trends
        """
        if not self.db_session or not self.FloodEventLog:
            return {}
        
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_back)
            
            # Get all flood events in the period
            events = self.db_session.query(self.FloodEventLog).filter(
                self.FloodEventLog.event_time >= cutoff_date
            ).all()
            
            # Calculate statistics
            total_events = len(events)
            start_events = len([e for e in events if e.event_type == 'flood_start'])
            end_events = len([e for e in events if e.event_type == 'flood_end'])
            
            # Get unique roads flooded
            roads_flooded = len(set(e.road_id for e in events))
            
            # Get flood level distribution
            high_severity = len([e for e in events if e.flood_level == 'high'])
            medium_severity = len([e for e in events if e.flood_level == 'medium'])
            low_severity = len([e for e in events if e.flood_level == 'low'])
            
            # Calculate average rainfall during floods
            avg_rainfall = 0
            if events:
                rainfall_values = [e.rainfall_mm for e in events if e.rainfall_mm is not None]
                if rainfall_values:
                    avg_rainfall = sum(rainfall_values) / len(rainfall_values)
            
            # Get top 5 most flooded roads
            road_counts = {}
            for event in events:
                road_counts[event.road_id] = road_counts.get(event.road_id, 0) + 1
            
            top_flooded_roads = sorted(
                road_counts.items(), 
                key=lambda x: x[1], 
                reverse=True
            )[:5]
            
            return {
                'period_days': days_back,
                'analysis_start_date': cutoff_date.isoformat(),
                'analysis_end_date': datetime.utcnow().isoformat(),
                'total_events': total_events,
                'flood_start_events': start_events,
                'flood_end_events': end_events,
                'unique_roads_affected': roads_flooded,
                'severity_distribution': {
                    'high': high_severity,
                    'medium': medium_severity,
                    'low': low_severity
                },
                'average_rainfall_mm': round(avg_rainfall, 2),
                'top_flooded_roads': [
                    {'road_id': road_id, 'flood_count': count}
                    for road_id, count in top_flooded_roads
                ]
            }
        except Exception as e:
            logger.error(f"Failed to get flood statistics: {e}")
            return {}
    
    async def generate_updated_terrain_geojson(self, output_path: str = None, manual_rainfall_mm: float = None) -> str:
        """
        Generate updated terrain_roads.geojson with live data from APIs
        
        Args:
            output_path: Custom output path for GeoJSON file
            manual_rainfall_mm: Optional manual rainfall value (mm) to override API data
                               Use this when you know it rained heavily but API doesn't show it
                               Example: manual_rainfall_mm=25 for 25mm of rain
        
        Returns:
            Path to generated GeoJSON file
        """
        logger.info("=" * 60)
        logger.info("Starting real-time flood analysis data generation...")
        if manual_rainfall_mm:
            logger.info(f"🔧 MANUAL RAINFALL OVERRIDE: {manual_rainfall_mm}mm")
        logger.info("=" * 60)
        
        # Step 1: Fetch latest roads from OSM
        osm_data = await self.fetch_osm_roads()
        roads = osm_data.get('elements', [])
        
        if not roads:
            logger.error("No road data fetched. Aborting.")
            return None
        
        # Step 2: Extract unique coordinates for elevation lookup
        coordinates = set()
        for road in roads:
            if road.get('type') == 'way' and 'geometry' in road:
                geometry = road['geometry']
                if len(geometry) < 2:
                    continue
                
                # Sample coordinates: add first, last, and every Nth point
                for i, point in enumerate(geometry):
                    # Always add start and end points
                    if i == 0 or i == len(geometry) - 1:
                        coordinates.add((point['lat'], point['lon']))
                    # Add every 3rd point for intermediate sampling (reduces points significantly)
                    elif i % 3 == 0:
                        coordinates.add((point['lat'], point['lon']))
        
        coordinates = list(coordinates)
        logger.info(f"Extracted {len(coordinates)} sampled coordinate points (optimized: every 3rd point)")
        logger.info(f"Elevation fetching should now take ~2-3 minutes instead of 15+ minutes")
        
        # Step 3: Fetch elevation data
        elevation_map = await self.fetch_elevation_data(coordinates)
        
        # Step 4: Fetch current weather/rainfall
        weather_data = await self.fetch_weather_data()
        current_rainfall = weather_data.get('current', {}).get('precipitation', 0)
        
        # Step 4a: Use manual rainfall if provided
        if manual_rainfall_mm is not None:
            logger.info(f"Using manual rainfall override: {manual_rainfall_mm}mm (was {current_rainfall}mm from API)")
            current_rainfall = manual_rainfall_mm
        
        logger.info(f"Current rainfall: {current_rainfall}mm")
        
        # Step 4b: Load previous flood history
        flooded_history = self.load_flooded_history()
        
        # Step 5: Process roads and calculate flood risk
        # Use batch processing to commit to database every BATCH_SIZE roads
        # This prevents connection timeouts when processing thousands of roads
        BATCH_SIZE = 500  # Commit every 500 roads to avoid memory/connection issues
        features = []
        road_counter = 0
        processed_roads = 0
        failed_roads = 0
        batch_hotspots = []  # Track hotspots for this batch
        
        for road in roads:
            try:
                if road.get('type') != 'way' or 'geometry' not in road:
                    continue
                
                geometry = road['geometry']
                if len(geometry) < 2:
                    continue
                
                # Calculate road properties
                coordinates_list = [[point['lon'], point['lat']] for point in geometry]
                
                # Get elevation data for this road
                elevations = []
                for point in geometry:
                    coord = (point['lat'], point['lon'])
                    elev = elevation_map.get(coord, 0.0)
                    elevations.append(elev)
                
                elev_mean = sum(elevations) / len(elevations) if elevations else 0.0
                elev_min = min(elevations) if elevations else 0.0
                elev_max = max(elevations) if elevations else 0.0
                
                # Calculate distance to nearest flood-prone area
                mid_point = geometry[len(geometry) // 2]
                distance_to_flood_zone, zone_risk = self.find_nearest_flood_zone(
                    mid_point['lat'], mid_point['lon']
                )
                
                # Calculate flood risk
                flood_assessment = self.calculate_flood_risk(
                    elevation=elev_mean,
                    rainfall_mm=current_rainfall,
                    distance_to_water=distance_to_flood_zone
                )
                
                # Calculate road length
                length_m = 0
                for i in range(len(geometry) - 1):
                    length_m += self.calculate_distance(
                        geometry[i]['lat'], geometry[i]['lon'],
                        geometry[i + 1]['lat'], geometry[i + 1]['lon']
                    )
                
                road_counter += 1
                
                # Calculate flood duration
                road_id = f"w{road.get('id', road_counter)}"
                flood_duration_info = self.calculate_flood_duration_hours(
                    road_id,
                    flood_assessment['flooded'],
                    flooded_history
                )
                
                # Log flood events to lifetime history
                road_name = road.get('tags', {}).get('name', f'Road {road_counter}')
                mid_point = geometry[len(geometry) // 2]
                
                # Log detailed info for flooded roads only
                if flood_assessment['flooded']:
                    lat = float(mid_point['lat']) if isinstance(mid_point['lat'], str) else mid_point['lat']
                    lon = float(mid_point['lon']) if isinstance(mid_point['lon'], str) else mid_point['lon']
                    rainfall = float(current_rainfall) if isinstance(current_rainfall, str) else current_rainfall
                    logger.info(f"🌊 FLOODED: {road_name} | Lat: {lat:.4f}, Lon: {lon:.4f} | Level: {flood_assessment['flood_level']} | Rainfall: {rainfall:.0f}mm")
                
                # Log if road just started flooding
                if flood_assessment['flooded'] and flood_duration_info['flooded_start_time'] is not None:
                    logger.info(f"🚨 FLOOD START: {road_name} | {flood_duration_info['flooded_start_time']}")
                    self.log_flood_event(
                        road_id=road_id,
                        road_name=road_name,
                        event_type='flood_start',
                        flood_level=flood_assessment['flood_level'],
                        rainfall_mm=current_rainfall,
                        elevation_m=elev_mean,
                        distance_to_water_m=distance_to_flood_zone,
                        location_lat=mid_point['lat'],
                        location_lon=mid_point['lon']
                    )
                
                # Log if road just stopped flooding
                if not flood_assessment['flooded'] and flood_duration_info.get('flood_duration_hours', 0) > 0:
                    duration = float(flood_duration_info['flood_duration_hours']) if isinstance(flood_duration_info.get('flood_duration_hours'), str) else flood_duration_info.get('flood_duration_hours', 0)
                    logger.info(f"✅ FLOOD END: {road_name} | Duration: {duration:.1f} hours")
                    self.log_flood_event(
                        road_id=road_id,
                        road_name=road_name,
                        event_type='flood_end',
                        flood_level=flood_assessment['flood_level'],
                        rainfall_mm=current_rainfall,
                        elevation_m=elev_mean,
                        distance_to_water_m=distance_to_flood_zone,
                        location_lat=mid_point['lat'],
                        location_lon=mid_point['lon']
                    )
                
                # Update hotspot data for lifetime tracking
                self.update_flood_hotspot(
                    road_id=road_id,
                    road_name=road_name,
                    location_lat=mid_point['lat'],
                    location_lon=mid_point['lon'],
                    is_currently_flooded=flood_assessment['flooded'],
                    flood_duration_hours=flood_duration_info['flood_duration_hours'],
                    flood_level=flood_assessment['flood_level']
                )
                
                # Build feature
                feature = {
                    'type': 'Feature',
                    'properties': {
                        'osm_id': road_id,
                        'road_id': road_counter,
                        'name': road.get('tags', {}).get('name', ''),
                        'highway': road.get('tags', {}).get('highway', 'unclassified'),
                        'length_m': round(length_m, 2),
                        'elev_mean': round(elev_mean, 2),
                        'elev_min': round(elev_min, 2),
                        'elev_max': round(elev_max, 2),
                        'flooded': "1" if flood_assessment['flooded'] else "0",
                        'flood_level': flood_assessment['flood_level'],
                        'flood_score': flood_assessment['flood_score'],
                        'current_rainfall_mm': current_rainfall,
                        'flood_duration_hours': flood_duration_info['flood_duration_hours'],
                        'flood_start_time': flood_duration_info['flooded_start_time'],
                        'times_flooded': flood_duration_info['times_flooded'],
                        'last_updated': datetime.now(tz=PHILIPPINE_TZ).isoformat(),
                        'data_source': 'OSM + Open-Elevation + Open-Meteo'
                    },
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': coordinates_list
                    }
                }
                
                features.append(feature)
                processed_roads += 1
                
                # Commit in batches to avoid connection timeouts
                if processed_roads % BATCH_SIZE == 0:
                    logger.info(f"Progress: {processed_roads}/{len(roads)} roads processed - BATCH COMMIT")
                    try:
                        if self.db_session:
                            self.db_session.commit()
                            logger.info(f"✅ Batch commit successful at {processed_roads} roads")
                    except Exception as e:
                        logger.error(f"❌ Batch commit failed at {processed_roads}: {e}")
                        if self.db_session:
                            self.db_session.rollback()
                        raise
                    
            except Exception as e:
                failed_roads += 1
                logger.warning(f"Error processing road {road_counter}: {str(e)}")
                continue
        
        logger.info(f"✅ Processed {processed_roads} roads successfully, {failed_roads} failed")
        
        # Final commit for remaining roads (if any after last batch)
        if self.db_session and (processed_roads % BATCH_SIZE != 0):
            try:
                logger.info(f"Committing final batch of {processed_roads % BATCH_SIZE} roads...")
                self.db_session.commit()
                logger.info("✅ Final database commit successful")
            except Exception as e:
                logger.error(f"❌ Final database commit failed: {e}")
                self.db_session.rollback()
                raise
        
        # Step 6: Save flood history for next run
        self.save_flooded_history(flooded_history)
        
        # Count flood state changes (start/stop events)
        roads_started_flooding = sum(1 for road in features if road['properties']['flooded'] == "1" and road['properties']['flood_start_time'] is not None)
        roads_stopped_flooding = sum(1 for road in features if road['properties']['flooded'] == "0" and road['properties'].get('flood_duration_hours', 0) > 0)
        
        # Step 7: Create GeoJSON with flood statistics
        flooded_roads = [f for f in features if f['properties']['flooded'] == "1"]
        longest_flooded = max(flooded_roads, key=lambda x: x['properties']['flood_duration_hours']) if flooded_roads else None
        
        geojson = {
            'type': 'FeatureCollection',
            'crs': {
                'type': 'name',
                'properties': {
                    'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'
                }
            },
            'metadata': {
                'generated': datetime.now(tz=PHILIPPINE_TZ).isoformat(),
                'total_roads': len(features),
                'flooded_roads': len(flooded_roads),
                'flooded_roads_percentage': round((len(flooded_roads) / len(features) * 100), 2) if features else 0,
                'current_rainfall_mm': current_rainfall,
                'flood_statistics': {
                    'roads_flooded': len(flooded_roads),
                    'longest_flooded_road': longest_flooded['properties']['name'] if longest_flooded else 'N/A',
                    'longest_flood_duration_hours': longest_flooded['properties']['flood_duration_hours'] if longest_flooded else 0,
                    'total_flood_events': sum(f['properties'].get('times_flooded', 0) for f in features),
                    'average_flood_duration': round(sum(f['properties'].get('flood_duration_hours', 0) for f in flooded_roads) / len(flooded_roads), 2) if flooded_roads else 0
                },
                'data_sources': [
                    'OpenStreetMap Overpass API',
                    'Open-Elevation API',
                    'Open-Meteo Weather API'
                ],
                'bounds': self.ZAMBOANGA_BOUNDS
            },
            'features': features
        }
        
        # Step 8: Save to file
        if not output_path:
            output_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, indent=2)
        
        # Verify file was written
        if output_path.exists():
            file_size = output_path.stat().st_size
            logger.info(f"✅ File successfully written: {file_size} bytes")
        else:
            logger.error(f"❌ ERROR: File was not written to {output_path}")
        
        logger.info("=" * 60)
        logger.info(f"✅ Generated updated terrain_roads.geojson")
        logger.info(f"📍 Location: {output_path}")
        logger.info(f"🛣️  Total roads: {len(features)}")
        logger.info(f"🌊 Flooded roads: {len(flooded_roads)} ({geojson['metadata']['flooded_roads_percentage']}%)")
        if roads_started_flooding > 0:
            logger.info(f"🚨 Roads STARTED FLOODING: {roads_started_flooding}")
        if roads_stopped_flooding > 0:
            logger.info(f"✅ Roads STOPPED FLOODING: {roads_stopped_flooding}")
        logger.info(f"🌧️  Current rainfall: {current_rainfall}mm")
        logger.info(f"⏰ Last updated: {datetime.now(tz=PHILIPPINE_TZ).strftime('%Y-%m-%d %H:%M:%S %Z')}")
        logger.info("=" * 60)
        
        # Step 9: Save GeoJSON to PostgreSQL as well (for persistence across restarts)
        if self.db_session:
            try:
                TerrainRoadsCache = None
                try:
                    from models import TerrainRoadsCache
                except ImportError:
                    logger.warning("Could not import TerrainRoadsCache model")
                
                if TerrainRoadsCache:
                    # Delete old cache entries
                    self.db_session.query(TerrainRoadsCache).delete()
                    
                    # Save new GeoJSON
                    cache_entry = TerrainRoadsCache(
                        geojson_data=json.dumps(geojson),
                        geojson_metadata=json.dumps(geojson.get('metadata', {})),
                        generated_at=datetime.utcnow()
                    )
                    self.db_session.add(cache_entry)
                    self.db_session.commit()
                    logger.info("✅ Saved GeoJSON to PostgreSQL")
            except Exception as e:
                logger.warning(f"Failed to save GeoJSON to PostgreSQL: {e}")
                self.db_session.rollback()
        
        return str(output_path)


async def update_flood_data(manual_rainfall_mm: float = None, db_session: Optional[Session] = None):
    """
    Main function to update flood analysis data
    
    Args:
        manual_rainfall_mm: Optional manual rainfall value in mm to override API data
        db_session: Optional SQLAlchemy session for database operations
    """
    # Create database session if not provided
    if not db_session:
        try:
            from sqlalchemy.orm import sessionmaker
            SessionLocal = sessionmaker(bind=db_engine)
            db_session = SessionLocal()
            should_close_session = True
        except Exception as e:
            logger.warning(f"Could not create database session: {e}")
            db_session = None
            should_close_session = False
    else:
        should_close_session = False
    
    try:
        async with FloodDataUpdater(db_session=db_session) as updater:
            output_path = await updater.generate_updated_terrain_geojson(manual_rainfall_mm=manual_rainfall_mm)
            return output_path
    finally:
        if should_close_session and db_session:
            db_session.close()


if __name__ == "__main__":
    import sys
    
    # Support manual rainfall override from command line
    manual_rainfall = None
    if len(sys.argv) > 1:
        try:
            manual_rainfall = float(sys.argv[1])
            print(f"\n[RAIN] Using manual rainfall override: {manual_rainfall}mm")
        except ValueError:
            print(f"[ERROR] Invalid rainfall value: {sys.argv[1]}")
            print("Usage: python flood_data_updater.py [rainfall_mm]")
            print("Example: python flood_data_updater.py 25")
            sys.exit(1)
    
    # Run the updater
    output = asyncio.run(update_flood_data(manual_rainfall_mm=manual_rainfall))
    print(f"\n[SUCCESS] Flood data updated successfully!")
    print(f"[FILE] {output}")
