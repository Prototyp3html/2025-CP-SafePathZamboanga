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
from sqlalchemy import create_engine, func, or_
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
        
        OPTIMIZATION: Uses PostgreSQL cache with bulk queries to avoid refetching
        Loads all coordinates from cache in ONE query instead of N queries
        """
        if not coordinates:
            return {}
        
        logger.info(f"Fetching elevation for {len(coordinates)} points...")
        
        elevation_map = {}
        coordinates_to_fetch = []
        
        # Try to load from PostgreSQL cache first using BULK query
        if self.db_session and self.ElevationCache:
            try:
                # OPTIMIZED: Query all coordinates in one batch instead of N individual queries
                from sqlalchemy import and_
                
                # Build OR conditions for all coordinates
                lat_lons = [(lat, lon) for lat, lon in coordinates]
                
                # Query in batches of 1000 to avoid huge IN clauses
                batch_size = 1000
                for i in range(0, len(lat_lons), batch_size):
                    batch = lat_lons[i:i + batch_size]
                    
                    cached_results = self.db_session.query(self.ElevationCache).filter(
                        or_(*[
                            and_(
                                self.ElevationCache.latitude == lat,
                                self.ElevationCache.longitude == lon
                            )
                            for lat, lon in batch
                        ])
                    ).all()
                    
                    for cached in cached_results:
                        elevation_map[(cached.latitude, cached.longitude)] = cached.elevation
                
                logger.info(f"Loaded {len(elevation_map)} elevations from PostgreSQL cache (bulk query)")
                
                # Find what needs to be fetched
                coordinates_to_fetch = [c for c in coordinates if c not in elevation_map]
                
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
        
        # OPTIMIZED: Use larger batch size (API supports up to 1000)
        batch_size = 500  # Increased from 100 to 500 to reduce API calls
        
        # OPTIMIZED: Create tasks for concurrent execution
        async def fetch_batch(batch):
            locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]
            
            try:
                async with self.session.post(url, json={"locations": locations}, timeout=30) as response:
                    if response.status == 200:
                        data = await response.json()
                        batch_results = {}
                        for j, result in enumerate(data.get('results', [])):
                            coord = batch[j]
                            elevation = result.get('elevation', 0.0)
                            batch_results[coord] = elevation
                        return batch_results
                    else:
                        logger.warning(f"Elevation API failed: {response.status}")
                        return {coord: 0.0 for coord in batch}
                
            except asyncio.TimeoutError:
                logger.error(f"Elevation API timeout")
                return {coord: 0.0 for coord in batch}
            except Exception as e:
                logger.error(f"Elevation fetch error: {e}")
                return {coord: 0.0 for coord in batch}
        
        # Create batches
        batches = [coordinates_to_fetch[i:i + batch_size] for i in range(0, len(coordinates_to_fetch), batch_size)]
        
        # OPTIMIZED: Fetch all batches concurrently (max 3 concurrent requests to avoid rate limiting)
        max_concurrent = 3
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def fetch_with_semaphore(batch, idx):
            async with semaphore:
                logger.info(f"Fetching elevation batch {idx+1}/{len(batches)} ({len(batch)} points)")
                return await fetch_batch(batch)
        
        tasks = [fetch_with_semaphore(batch, i) for i, batch in enumerate(batches)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Merge results
        cache_entries_to_add = []
        for result in results:
            if isinstance(result, dict):
                elevation_map.update(result)
                # Prepare database entries
                if self.db_session and self.ElevationCache:
                    for coord, elev in result.items():
                        cache_entries_to_add.append(self.ElevationCache(
                            latitude=coord[0],
                            longitude=coord[1],
                            elevation=elev,
                            cached_at=datetime.utcnow()
                        ))
            else:
                logger.error(f"Batch fetch failed: {result}")
        
        # Save all cache entries to DB in one commit
        if cache_entries_to_add and self.db_session and self.ElevationCache:
            try:
                self.db_session.add_all(cache_entries_to_add)
                logger.info(f"Saving {len(cache_entries_to_add)} new elevations to database...")
            except Exception as e:
                logger.debug(f"Could not save elevations to DB: {e}")
        
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
        RAINFALL-RESPONSIVE: Flood detection increases significantly with rainfall
        
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
        
        # Low elevation = HIGH flood risk (critical factor in Zamboanga)
        # BUT ONLY if elevation data is valid/realistic
        if is_valid_elevation:
            if elevation < 3:
                flood_score += 40  
            elif elevation < 5:
                flood_score += 30
            elif elevation < 10:
                flood_score += 20
            elif elevation < 20:
                flood_score += 10
        
        # RAINFALL = PRIMARY FLOOD DRIVER (Zamboanga is monsoon-prone)
        # Make rainfall the dominant factor - heavier rain should dramatically increase flooded roads
        if rainfall_mm > 50:  # Extreme rainfall
            flood_score += 80  # Very heavy flooding
        elif rainfall_mm > 30:  # Heavy rain
            flood_score += 70  # Significantly increased
        elif rainfall_mm > 15:  # Moderate rain
            flood_score += 50  # Major impact
        elif rainfall_mm > 10:  # Moderate-light rain
            flood_score += 35
        elif rainfall_mm > 5:   # Light rain
            flood_score += 20
        elif rainfall_mm > 2:   # Drizzle
            flood_score += 8
        
        # Close to water bodies = higher flood risk (spillover and overflow)
        if distance_to_water < 50:  # Very close to water
            flood_score += 25
        elif distance_to_water < 100:
            flood_score += 20
        elif distance_to_water < 500:
            flood_score += 15
        elif distance_to_water < 1000:
            flood_score += 8
        
        # RAINFALL-RESPONSIVE THRESHOLDS
        # Lower the threshold when there's rainfall so more roads flood
        if rainfall_mm > 0:
            # With any rainfall, use lower threshold for flood detection
            if flood_score >= 50:  
                flood_level = "high"
                flooded = True
            elif flood_score >= 30:  
                flood_level = "medium"
                flooded = True  # Now flood at medium threshold with rain
            elif flood_score >= 15:
                flood_level = "low"
                flooded = True  # Now flood at low threshold with rain
            else:
                flood_level = "none"
                flooded = False
        else:
            # No rainfall: only flood naturally low-lying areas near water
            if flood_score >= 60:  
                flood_level = "high"
                flooded = True
            elif flood_score >= 40:  
                flood_level = "medium"
                flooded = (distance_to_water < 100)  # Only if very close to water
            elif flood_score >= 20:
                flood_level = "low"
                flooded = False
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
    
    def recalculate_flood_hotspots(self) -> None:
        """
        Recalculate flood hotspot statistics based on FloodEventLog
        Updates total_flooded_hours, frequency, and risk_score in FloodHotspot table
        
        This should be called after each flood update to ensure statistics are fresh
        """
        if not self.db_session or not self.FloodEventLog or not self.FloodHotspot:
            logger.warning("Database session or models not available - skipping hotspot recalculation")
            return
        
        try:
            logger.info("🔄 Recalculating flood hotspot statistics...")
            
            # Get all unique roads that have flood events
            roads_with_events = self.db_session.query(self.FloodEventLog.road_id).distinct().all()
            roads_with_events = [r[0] for r in roads_with_events]
            
            logger.info(f"Found {len(roads_with_events)} roads with flood event history")
            
            for road_id in roads_with_events:
                try:
                    # Get all flood events for this road, sorted by time
                    events = self.db_session.query(self.FloodEventLog).filter(
                        self.FloodEventLog.road_id == road_id
                    ).order_by(self.FloodEventLog.event_time).all()
                    
                    if not events:
                        continue
                    
                    # Count flood_start events
                    total_flood_events = len([e for e in events if e.event_type == 'flood_start'])
                    
                    # Calculate total flooded hours by pairing consecutive start/end events
                    total_flooded_hours = 0.0
                    i = 0
                    while i < len(events) - 1:
                        current = events[i]
                        next_event = events[i + 1]
                        
                        # If we have a flood_start followed by flood_end, calculate duration
                        if current.event_type == 'flood_start' and next_event.event_type == 'flood_end':
                            duration_hours = (next_event.event_time - current.event_time).total_seconds() / 3600
                            if duration_hours >= 0:  # Only count positive durations
                                total_flooded_hours += duration_hours
                            i += 2
                        else:
                            i += 1
                    
                    # Get first and last event times
                    first_event = min(events, key=lambda e: e.event_time)
                    last_event = max(events, key=lambda e: e.event_time)
                    days_between = (last_event.event_time - first_event.event_time).days + 1
                    
                    # Calculate frequency per year
                    frequency_per_year = (total_flood_events / max(days_between, 1)) * 365
                    
                    # Calculate average duration
                    average_duration = total_flooded_hours / max(total_flood_events, 1)
                    
                    # IMPROVED RISK SCORING - More nuanced and differentiated
                    # Score components (total max 100):
                    frequency_score = min(35, (frequency_per_year / 10) * 35)  # Max 35 points (10 floods/year = max)
                    hours_score = min(35, (total_flooded_hours / 50) * 35)     # Max 35 points (50+ hours = max)
                    
                    # Recency bonus (up to 30 points, decays with time)
                    days_since_last = (datetime.utcnow() - last_event.event_time).days
                    recency_score = max(0, 30 * (1 - min(days_since_last / 30, 1)))  # Fully decays after 30 days
                    
                    risk_score = min(100, frequency_score + hours_score + recency_score)
                    
                    # Get road info from latest event
                    road_name = last_event.road_name
                    location_lat = last_event.location_lat
                    location_lon = last_event.location_lon
                    
                    # Find or create hotspot
                    hotspot = self.db_session.query(self.FloodHotspot).filter(
                        self.FloodHotspot.road_id == road_id
                    ).first()
                    
                    if hotspot:
                        # Update existing hotspot
                        hotspot.total_flood_events = total_flood_events
                        hotspot.total_flooded_hours = round(total_flooded_hours, 2)
                        hotspot.average_flood_duration_hours = round(average_duration, 2)
                        hotspot.frequency_per_year = round(frequency_per_year, 2)
                        hotspot.flood_risk_score = round(risk_score, 2)
                        hotspot.last_updated = datetime.utcnow()
                        if last_event.event_type == 'flood_end':
                            hotspot.last_flood_end = last_event.event_time
                        if first_event.event_type == 'flood_start':
                            hotspot.last_flood_start = first_event.event_time
                    else:
                        # Create new hotspot
                        hotspot = self.FloodHotspot(
                            road_id=road_id,
                            road_name=road_name,
                            location_lat=location_lat,
                            location_lon=location_lon,
                            total_flood_events=total_flood_events,
                            total_flooded_hours=round(total_flooded_hours, 2),
                            average_flood_duration_hours=round(average_duration, 2),
                            frequency_per_year=round(frequency_per_year, 2),
                            flood_risk_score=round(risk_score, 2),
                            first_flood_recorded=first_event.event_time,
                            last_flood_start=first_event.event_time if first_event.event_type == 'flood_start' else last_event.event_time,
                            last_flood_end=last_event.event_time if last_event.event_type == 'flood_end' else first_event.event_time,
                            last_updated=datetime.utcnow()
                        )
                        self.db_session.add(hotspot)
                    
                    self.db_session.commit()
                    logger.info(f"✅ Updated: {road_name} | Events: {total_flood_events} | Hours: {round(total_flooded_hours, 1)}h | Freq: {round(frequency_per_year, 2)}/yr | Score: {risk_score:.1f}/100 | Days: {days_since_last}d")
                    
                except Exception as e:
                    logger.error(f"Error recalculating hotspot for road {road_id}: {e}")
                    self.db_session.rollback()
                    continue
            
            logger.info("✅ Flood hotspot statistics recalculation completed!")
            
        except Exception as e:
            logger.error(f"Error during hotspot recalculation: {e}")
            self.db_session.rollback()

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
                
                # OPTIMIZED: Sample coordinates more aggressively
                # Add first and last point (essential)
                coordinates.add((geometry[0]['lat'], geometry[0]['lon']))
                coordinates.add((geometry[-1]['lat'], geometry[-1]['lon']))
                
                # For long roads, add intermediate points (every 5th instead of 3rd)
                if len(geometry) > 20:
                    for i in range(5, len(geometry) - 1, 5):  # Every 5th point
                        coordinates.add((geometry[i]['lat'], geometry[i]['lon']))
                # For short roads, add every 3rd
                elif len(geometry) > 10:
                    for i in range(3, len(geometry) - 1, 3):  # Every 3rd point
                        coordinates.add((geometry[i]['lat'], geometry[i]['lon']))
        
        coordinates = list(coordinates)
        logger.info(f"Extracted {len(coordinates)} sampled coordinate points (OPTIMIZED: aggressive sampling)")
        logger.info(f"Cache hit will reduce this to near-zero for subsequent runs")
        
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
                
                # OPTIMIZED: Get elevation data for sampled points only, interpolate for others
                elevations = []
                cached_elevations = {}
                missing_count = 0
                
                for point in geometry:
                    coord = (point['lat'], point['lon'])
                    elev = elevation_map.get(coord, None)
                    
                    if elev is not None:
                        elevations.append(elev)
                        cached_elevations[coord] = elev
                    else:
                        # Point wasn't sampled - will use average of nearby cached points
                        missing_count += 1
                
                # If we have at least some elevations, use them; otherwise use area average
                if elevations:
                    elev_mean = sum(elevations) / len(elevations)
                    elev_min = min(elevations)
                    elev_max = max(elevations)
                else:
                    # Fallback: use average of all elevations if available
                    all_elevs = list(elevation_map.values())
                    if all_elevs:
                        elev_mean = sum(all_elevs) / len(all_elevs)
                        elev_min = min(all_elevs)
                        elev_max = max(all_elevs)
                    else:
                        elev_mean = elev_min = elev_max = 0.0
                
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
                
                # Log if road just started flooding (only with significant rainfall >= 2mm to avoid weather noise)
                if flood_assessment['flooded'] and flood_duration_info['flooded_start_time'] is not None and current_rainfall >= 2:
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
                
                # Log if road just stopped flooding (only if rainfall is minimal - natural drying)
                if not flood_assessment['flooded'] and flood_duration_info.get('flood_duration_hours', 0) > 0 and current_rainfall < 2:
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
        
        # Step 10: Recalculate flood hotspot statistics based on actual event logs
        self.recalculate_flood_hotspots()
        
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
