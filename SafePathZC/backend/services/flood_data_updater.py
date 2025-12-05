#!/usr/bin/env python3
"""
Real-time Flood Data Updater for SafePath Zamboanga
Fetches live elevation, road, and flood data from multiple APIs
"""

import asyncio
import aiohttp
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
import math

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    
    # Zamboanga City boundaries
    ZAMBOANGA_BOUNDS = {
        'min_lat': 6.85,
        'max_lat': 7.15,
        'min_lon': 121.95,
        'max_lon': 122.30
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
    
    def __init__(self, cache_dir: str = None):
        self.cache_dir = Path(cache_dir) if cache_dir else Path(__file__).parent.parent / "data" / "cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def fetch_osm_roads(self, max_retries: int = 3) -> Dict[str, Any]:
        """
        Fetch latest road network from OpenStreetMap Overpass API
        With automatic retry logic and exponential backoff for resilience
        
        Args:
            max_retries: Maximum number of retry attempts
        """
        logger.info("Fetching latest roads from OpenStreetMap...")
        
        # Overpass API query for Zamboanga roads
        overpass_query = f"""
        [out:json][timeout:180];
        (
          way["highway"]
            ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
             {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
        );
        out geom;
        """
        
        overpass_url = "https://overpass-api.de/api/interpreter"
        
        # Retry logic with exponential backoff
        for attempt in range(max_retries):
            try:
                async with self.session.post(overpass_url, data={'data': overpass_query}, timeout=aiohttp.ClientTimeout(total=200)) as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"✅ Successfully fetched {len(data.get('elements', []))} road segments from OSM (Attempt {attempt + 1})")
                        return data
                    elif response.status == 504:
                        # Service Unavailable - retry with backoff
                        logger.warning(f"⚠️ OSM API error 504 (Service Unavailable) - Attempt {attempt + 1}/{max_retries}")
                        if attempt < max_retries - 1:
                            wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                            logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            logger.error("❌ OSM API unavailable after all retry attempts")
                            return await self._load_cached_osm_data()
                    else:
                        logger.error(f"❌ OSM API error: {response.status}")
                        return {'elements': []}
            except asyncio.TimeoutError:
                logger.warning(f"⏱️ OSM API timeout - Attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error("❌ OSM API timeout after all retry attempts")
                    return await self._load_cached_osm_data()
            except Exception as e:
                logger.error(f"❌ Failed to fetch OSM data (Attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    return await self._load_cached_osm_data()
        
        return await self._load_cached_osm_data()
    
    async def _load_cached_osm_data(self) -> Dict[str, Any]:
        """
        Load cached OSM data as fallback when API is unavailable
        Uses the last successfully generated GeoJSON file
        """
        try:
            cached_file = Path("/app/data/terrain_roads.geojson")
            if cached_file.exists():
                logger.info(f"📂 Loading cached OSM data from {cached_file}")
                with open(cached_file, 'r') as f:
                    geojson_data = json.load(f)
                
                # Convert GeoJSON features back to OSM format for processing
                osm_elements = []
                for feature in geojson_data.get('features', []):
                    props = feature.get('properties', {})
                    coords = feature.get('geometry', {}).get('coordinates', [])
                    
                    # Convert back to OSM format
                    osm_element = {
                        'type': 'way',
                        'id': props.get('osm_id', ''),
                        'geometry': [{'lat': coord[1], 'lon': coord[0]} for coord in coords]
                    }
                    osm_elements.append(osm_element)
                
                logger.info(f"✅ Loaded {len(osm_elements)} cached road segments from previous update")
                return {'elements': osm_elements}
            else:
                logger.warning("⚠️ No cached OSM data available")
                return {'elements': []}
        except Exception as e:
            logger.error(f"❌ Failed to load cached OSM data: {e}")
            return {'elements': []}
    
    async def fetch_water_bodies(self, max_retries: int = 3) -> List[Dict[str, Any]]:
        """
        Fetch water bodies (coastlines, rivers, lakes) from OpenStreetMap
        With automatic retry logic for resilience
        This provides accurate water proximity data for flood risk calculations
        """
        # Check cache first (water bodies don't change frequently)
        if (self._water_bodies_cache and 
            self._water_bodies_cache_time and 
            (datetime.now() - self._water_bodies_cache_time).seconds < 86400):  # 24 hours
            logger.info("✅ Using cached water body data")
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
        
        # Retry logic with exponential backoff
        for attempt in range(max_retries):
            try:
                async with self.session.post(overpass_url, data={'data': overpass_query}, timeout=aiohttp.ClientTimeout(total=200)) as response:
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
                        
                        logger.info(f"✅ Successfully fetched {len(processed_water_bodies)} water bodies from OSM (Attempt {attempt + 1}):")
                        for wb_type in ['coastline', 'river', 'water', 'stream']:
                            count = len([wb for wb in processed_water_bodies if wb['type'] == wb_type])
                            if count > 0:
                                logger.info(f"  - {count} {wb_type}(s)")
                        
                        return processed_water_bodies
                    elif response.status == 504:
                        # Service Unavailable - retry with backoff
                        logger.warning(f"⚠️ OSM water bodies API error 504 (Service Unavailable) - Attempt {attempt + 1}/{max_retries}")
                        if attempt < max_retries - 1:
                            wait_time = 2 ** attempt
                            logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                            await asyncio.sleep(wait_time)
                            continue
                        else:
                            logger.error("❌ OSM water bodies API unavailable after all retry attempts - using empty list")
                            return []
                    else:
                        logger.error(f"❌ OSM water bodies API error: {response.status}")
                        return []
            except asyncio.TimeoutError:
                logger.warning(f"⏱️ OSM water bodies API timeout - Attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error("❌ OSM water bodies API timeout after all retry attempts - using empty list")
                    return []
            except Exception as e:
                logger.error(f"❌ Failed to fetch water bodies (Attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.warning("⚠️ Could not fetch water bodies - continuing without water body data")
                    return []
        
        logger.warning("⚠️ Exhausted all retries for water bodies - using empty list")
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
        Optimized with larger batches and minimal rate limiting
        """
        if not coordinates:
            return {}
            
        logger.info(f"Fetching elevation for {len(coordinates)} points...")
        
        # Open-Elevation API (free, no key required)
        url = "https://api.open-elevation.com/api/v1/lookup"
        
        # Larger batch size for efficiency (API allows up to 100 per request, but we batch multiple requests)
        batch_size = 100
        elevation_map = {}
        total_batches = (len(coordinates) + batch_size - 1) // batch_size
        
        for i in range(0, len(coordinates), batch_size):
            batch = coordinates[i:i + batch_size]
            batch_num = i // batch_size + 1
            locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]
            
            try:
                async with self.session.post(url, json={"locations": locations}, timeout=aiohttp.ClientTimeout(total=30)) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = data.get('results', [])
                        for j, result in enumerate(data.get('results', [])):
                            if j < len(batch):
                                coord = batch[j]
                                elevation_map[coord] = result.get('elevation', 0.0)
                        logger.info(f"✅ Elevation batch {batch_num}/{total_batches} processed ({len(results)} points)")
                    else:
                        logger.warning(f"⚠️ Elevation API batch {batch_num}/{total_batches} failed: {response.status}")
                        # Default to 0 elevation
                        for coord in batch:
                            elevation_map[coord] = 0.0
                
                # Minimal rate limiting (100ms instead of 1 second)
                await asyncio.sleep(0.1)
                
            except asyncio.TimeoutError:
                logger.warning(f"⏱️ Elevation API batch {batch_num}/{total_batches} timeout - using default elevation")
                for coord in batch:
                    elevation_map[coord] = 0.0
            except Exception as e:
                logger.error(f"❌ Elevation fetch error (batch {batch_num}/{total_batches}): {e}")
                for coord in batch:
                    elevation_map[coord] = 0.0
        
        logger.info(f"✅ Elevation data fetched for {len(elevation_map)} coordinates")
        return elevation_map
    
    async def fetch_weather_data(self) -> Dict[str, Any]:
        """
        Fetch current weather and rainfall data
        Uses Open-Meteo (free weather API)
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
                    logger.info(f"Weather data fetched: {data.get('current', {})}")
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
            rainfall_mm: Current rainfall in mm
            distance_to_water: Distance to nearest river/sea (meters)
        
        Returns:
            Dict with flood risk assessment
        """
        flood_score = 0
        
        # Low elevation = higher flood risk
        if elevation < 5:
            flood_score += 50
        elif elevation < 10:
            flood_score += 30
        elif elevation < 20:
            flood_score += 10
        
        # Heavy rainfall = higher flood risk
        if rainfall_mm > 50:  # Heavy rain
            flood_score += 40
        elif rainfall_mm > 20:  # Moderate rain
            flood_score += 20
        elif rainfall_mm > 5:  # Light rain
            flood_score += 5
        
        # Close to water = higher flood risk
        if distance_to_water < 100:
            flood_score += 30
        elif distance_to_water < 500:
            flood_score += 15
        elif distance_to_water < 1000:
            flood_score += 5
        
        # Determine flood level
        if flood_score >= 70:
            flood_level = "high"
            flooded = True
        elif flood_score >= 40:
            flood_level = "medium"
            flooded = True
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
    
    async def generate_updated_terrain_geojson(self, output_path: str = None) -> str:
        """
        Generate updated terrain_roads.geojson with live data from APIs
        
        Returns:
            Path to generated GeoJSON file
        """
        logger.info("=" * 60)
        logger.info("Starting real-time flood analysis data generation...")
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
                for point in road['geometry']:
                    coordinates.add((point['lat'], point['lon']))
        
        coordinates = list(coordinates)
        logger.info(f"Extracted {len(coordinates)} unique coordinate points")
        
        # Step 3: Fetch elevation data
        elevation_map = await self.fetch_elevation_data(coordinates)
        
        # Step 4: Fetch current weather/rainfall
        weather_data = await self.fetch_weather_data()
        current_rainfall = weather_data.get('current', {}).get('precipitation', 0)
        
        logger.info(f"Current rainfall: {current_rainfall}mm")
        
        # Step 5: Process roads and calculate flood risk
        features = []
        road_counter = 0
        
        for road in roads:
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
            
            # Build feature
            feature = {
                'type': 'Feature',
                'properties': {
                    'osm_id': f"w{road.get('id', road_counter)}",
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
                    'last_updated': datetime.now().isoformat(),
                    'data_source': 'OSM + Open-Elevation + Open-Meteo'
                },
                'geometry': {
                    'type': 'LineString',
                    'coordinates': coordinates_list
                }
            }
            
            features.append(feature)
        
        # Step 6: Create GeoJSON
        geojson = {
            'type': 'FeatureCollection',
            'crs': {
                'type': 'name',
                'properties': {
                    'name': 'urn:ogc:def:crs:OGC:1.3:CRS84'
                }
            },
            'metadata': {
                'generated': datetime.now().isoformat(),
                'total_roads': len(features),
                'flooded_roads': sum(1 for f in features if f['properties']['flooded'] == "1"),
                'current_rainfall_mm': current_rainfall,
                'data_sources': [
                    'OpenStreetMap Overpass API',
                    'Open-Elevation API',
                    'Open-Meteo Weather API'
                ],
                'bounds': self.ZAMBOANGA_BOUNDS
            },
            'features': features
        }
        
        # Step 7: Save to file
        if not output_path:
            output_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, indent=2)
        
        logger.info("=" * 60)
        logger.info(f"✅ Generated updated terrain_roads.geojson")
        logger.info(f"📍 Location: {output_path}")
        logger.info(f"🛣️  Total roads: {len(features)}")
        logger.info(f"🌊 Flooded roads: {geojson['metadata']['flooded_roads']}")
        logger.info(f"🌧️  Current rainfall: {current_rainfall}mm")
        logger.info(f"⏰ Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        logger.info("=" * 60)
        
        return str(output_path)


async def update_flood_data():
    """Main function to update flood analysis data"""
    async with FloodDataUpdater() as updater:
        output_path = await updater.generate_updated_terrain_geojson()
        return output_path


if __name__ == "__main__":
    # Run the updater
    output = asyncio.run(update_flood_data())
    print(f"\n✅ Flood data updated successfully!")
    print(f"📁 File: {output}")
