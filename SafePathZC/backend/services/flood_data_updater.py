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
    
    async def fetch_osm_roads(self) -> Dict[str, Any]:
        """
        Fetch latest road network from OpenStreetMap Overpass API
        Always up-to-date with latest OSM edits
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
        
        try:
            async with self.session.post(overpass_url, data={'data': overpass_query}) as response:
                if response.status == 200:
                    data = await response.json()
                    logger.info(f"Fetched {len(data.get('elements', []))} road segments from OSM")
                    return data
                else:
                    logger.error(f"OSM API error: {response.status}")
                    return {'elements': []}
        except Exception as e:
            logger.error(f"Failed to fetch OSM data: {e}")
            return {'elements': []}
    
    async def fetch_elevation_data(self, coordinates: List[Tuple[float, float]]) -> Dict[Tuple[float, float], float]:
        """
        Fetch elevation data from Open-Elevation API
        Free and always available
        """
        if not coordinates:
            return {}
            
        logger.info(f"Fetching elevation for {len(coordinates)} points...")
        
        # Open-Elevation API (free, no key required)
        url = "https://api.open-elevation.com/api/v1/lookup"
        
        # Batch coordinates (max 100 per request)
        batch_size = 100
        elevation_map = {}
        
        for i in range(0, len(coordinates), batch_size):
            batch = coordinates[i:i + batch_size]
            locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]
            
            try:
                async with self.session.post(url, json={"locations": locations}) as response:
                    if response.status == 200:
                        data = await response.json()
                        for j, result in enumerate(data.get('results', [])):
                            coord = batch[j]
                            elevation_map[coord] = result.get('elevation', 0.0)
                    else:
                        logger.warning(f"Elevation API batch {i//batch_size + 1} failed: {response.status}")
                        # Default to 0 elevation
                        for coord in batch:
                            elevation_map[coord] = 0.0
                
                # Rate limiting - be nice to free API
                await asyncio.sleep(1)
                
            except Exception as e:
                logger.error(f"Elevation fetch error: {e}")
                for coord in batch:
                    elevation_map[coord] = 0.0
        
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
