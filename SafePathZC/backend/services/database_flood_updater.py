#!/usr/bin/env python3
"""
Database-Powered Flood Data Updater for SafePath Zamboanga
Fetches live elevation, road, and flood data from multiple APIs and stores in PostgreSQL
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

from services.terrain_database import TerrainDatabaseService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class FloodZone:
    """Represents a flood-prone area"""
    lat: float
    lon: float
    flood_level: str  # 'low', 'medium', 'high'
    last_updated: datetime


class DatabaseFloodDataUpdater:
    """
    Automatically fetch and update flood analysis data from live APIs
    Now stores data in PostgreSQL database instead of JSON files
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
        {'name': 'Baliwasan', 'lat': 6.9170, 'lon': 122.0730, 'risk': 'medium'},
        {'name': 'Arena Blanco', 'lat': 6.9000, 'lon': 122.0800, 'risk': 'low'},
        {'name': 'Camino Nuevo', 'lat': 6.9200, 'lon': 122.0750, 'risk': 'medium'},
        {'name': 'Divisoria', 'lat': 6.9150, 'lon': 122.0780, 'risk': 'high'}
    ]
    
    def __init__(self):
        self.session = None
        self.stats = {
            'roads_processed': 0,
            'roads_updated': 0,
            'roads_added': 0,
            'osm_requests': 0,
            'elevation_requests': 0,
            'weather_requests': 0,
            'errors': []
        }
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={'User-Agent': 'SafePath-Zamboanga/1.0 (Flood Analysis System)'}
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    async def fetch_osm_roads(self) -> Dict[str, Any]:
        """Fetch road network data from OpenStreetMap Overpass API"""
        logger.info("🛣️  Fetching road network from OpenStreetMap...")
        
        # Overpass API query for roads in Zamboanga City
        overpass_query = f"""
        [out:json][timeout:25];
        (
          way["highway"~"^(primary|secondary|tertiary|residential|trunk|motorway|service|unclassified)$"]
              ({self.ZAMBOANGA_BOUNDS['min_lat']},{self.ZAMBOANGA_BOUNDS['min_lon']},
               {self.ZAMBOANGA_BOUNDS['max_lat']},{self.ZAMBOANGA_BOUNDS['max_lon']});
        );
        out geom;
        """
        
        try:
            self.stats['osm_requests'] += 1
            
            async with self.session.post(
                "http://overpass-api.de/api/interpreter",
                data=overpass_query
            ) as response:
                
                if response.status == 200:
                    data = await response.json()
                    roads_count = len(data.get('elements', []))
                    logger.info(f"✅ Fetched {roads_count} road segments from OSM")
                    return data
                else:
                    error_msg = f"OSM API error: {response.status}"
                    logger.error(error_msg)
                    self.stats['errors'].append(error_msg)
                    return {'elements': []}
                    
        except Exception as e:
            error_msg = f"Failed to fetch OSM data: {e}"
            logger.error(error_msg)
            self.stats['errors'].append(error_msg)
            return {'elements': []}
    
    async def fetch_elevation_data(self, coordinates: List[Tuple[float, float]]) -> Dict[Tuple[float, float], float]:
        """Fetch elevation data for multiple coordinates"""
        logger.info(f"🏔️  Fetching elevation data for {len(coordinates)} points...")
        
        elevation_map = {}
        batch_size = 100  # Process in batches to avoid API limits
        
        for i in range(0, len(coordinates), batch_size):
            batch = coordinates[i:i + batch_size]
            
            try:
                self.stats['elevation_requests'] += 1
                
                # Use Open-Elevation API (free, no API key required)
                locations = [{"latitude": lat, "longitude": lon} for lat, lon in batch]
                
                async with self.session.post(
                    "https://api.open-elevation.com/api/v1/lookup",
                    json={"locations": locations}
                ) as response:
                    
                    if response.status == 200:
                        data = await response.json()
                        for result in data.get('results', []):
                            lat, lon = result['latitude'], result['longitude']
                            elevation = result['elevation']
                            elevation_map[(lat, lon)] = elevation
                    else:
                        logger.warning(f"Elevation API batch {i//batch_size + 1} failed: {response.status}")
                
                # Small delay between batches to be respectful to the API
                await asyncio.sleep(0.5)
                
            except Exception as e:
                logger.error(f"Error fetching elevation batch {i//batch_size + 1}: {e}")
                self.stats['errors'].append(f"Elevation batch error: {e}")
        
        logger.info(f"✅ Retrieved elevation data for {len(elevation_map)} points")
        return elevation_map
    
    async def fetch_weather_data(self) -> Dict[str, Any]:
        """Fetch current weather conditions for Zamboanga City"""
        logger.info("🌤️  Fetching current weather conditions...")
        
        try:
            self.stats['weather_requests'] += 1
            
            # Using OpenWeatherMap API (you can replace with your preferred weather API)
            # For now, using mock data - replace with actual API call
            weather_data = {
                'temperature': 28.5,
                'humidity': 75,
                'rainfall_mm': 0.5,
                'wind_speed': 12.3,
                'condition': 'partly_cloudy',
                'fetched_at': datetime.now().isoformat()
            }
            
            logger.info(f"✅ Weather: {weather_data['condition']}, {weather_data['temperature']}°C")
            return weather_data
            
        except Exception as e:
            error_msg = f"Failed to fetch weather data: {e}"
            logger.error(error_msg)
            self.stats['errors'].append(error_msg)
            return {
                'temperature': 27.0,
                'humidity': 70,
                'rainfall_mm': 0.0,
                'wind_speed': 10.0,
                'condition': 'unknown',
                'fetched_at': datetime.now().isoformat()
            }
    
    def analyze_flood_risk(self, road_data: Dict, elevation_map: Dict, weather_data: Dict) -> Dict[str, Any]:
        """Analyze flood risk for a road segment"""
        
        # Extract coordinates from road geometry
        coordinates = []
        if 'geometry' in road_data:
            for point in road_data['geometry']:
                coordinates.append((point['lat'], point['lon']))
        
        if not coordinates:
            return {'flood_risk_level': 'unknown', 'flood_risk_score': 0.0}
        
        # Calculate elevation statistics
        elevations = []
        for coord in coordinates:
            if coord in elevation_map:
                elevations.append(elevation_map[coord])
        
        if not elevations:
            return {'flood_risk_level': 'unknown', 'flood_risk_score': 0.0}
        
        avg_elevation = sum(elevations) / len(elevations)
        min_elevation = min(elevations)
        max_elevation = max(elevations)
        elevation_variance = max_elevation - min_elevation
        
        # Check proximity to known flood-prone areas
        start_coord = coordinates[0]
        min_distance_to_flood_zone = float('inf')
        
        for zone in self.FLOOD_PRONE_AREAS:
            distance = math.sqrt((start_coord[0] - zone['lat'])**2 + (start_coord[1] - zone['lon'])**2)
            min_distance_to_flood_zone = min(min_distance_to_flood_zone, distance)
        
        # Risk scoring algorithm
        risk_score = 0.0
        
        # Factor 1: Low elevation (higher risk)
        if avg_elevation < 10:
            risk_score += 0.4
        elif avg_elevation < 25:
            risk_score += 0.2
        
        # Factor 2: Proximity to flood zones
        if min_distance_to_flood_zone < 0.01:  # Very close
            risk_score += 0.3
        elif min_distance_to_flood_zone < 0.02:  # Close
            risk_score += 0.15
        
        # Factor 3: Current rainfall
        rainfall = weather_data.get('rainfall_mm', 0)
        if rainfall > 10:
            risk_score += 0.2
        elif rainfall > 2:
            risk_score += 0.1
        
        # Factor 4: Terrain variance (flat areas at risk)
        if elevation_variance < 5:
            risk_score += 0.1
        
        # Normalize score to 0-1 range
        risk_score = min(risk_score, 1.0)
        
        # Determine risk level
        if risk_score >= 0.7:
            risk_level = 'high'
        elif risk_score >= 0.4:
            risk_level = 'medium'
        else:
            risk_level = 'low'
        
        return {
            'flood_risk_level': risk_level,
            'flood_risk_score': risk_score,
            'is_flood_prone': risk_score >= 0.4,
            'avg_elevation': avg_elevation,
            'min_elevation': min_elevation,
            'max_elevation': max_elevation,
            'elevation_variance': elevation_variance,
            'rainfall_impact': rainfall * 0.1,  # Impact factor
            'weather_conditions': weather_data.get('condition', 'unknown')
        }
    
    async def process_roads_to_database(self, roads_data: Dict, elevation_map: Dict, weather_data: Dict) -> bool:
        """Process road data and store in database"""
        logger.info("💾 Processing and storing road data in database...")
        
        road_segments = []
        
        for road in roads_data.get('elements', []):
            try:
                if road.get('type') != 'way' or 'geometry' not in road:
                    continue
                
                # Extract basic road information
                tags = road.get('tags', {})
                osm_way_id = str(road.get('id', ''))
                road_name = tags.get('name', 'Unnamed Road')
                highway_type = tags.get('highway', 'unclassified')
                
                # Get geometry coordinates
                geometry = road['geometry']
                if len(geometry) < 2:
                    continue
                
                start_point = geometry[0]
                end_point = geometry[-1]
                
                # Analyze flood risk
                flood_analysis = self.analyze_flood_risk(road, elevation_map, weather_data)
                
                # Create road segment record
                segment_data = {
                    'osm_way_id': osm_way_id,
                    'road_name': road_name,
                    'highway_type': highway_type,
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[point['lon'], point['lat']] for point in geometry]
                    },
                    'start_lat': start_point['lat'],
                    'start_lon': start_point['lon'],
                    'end_lat': end_point['lat'],
                    'end_lon': end_point['lon'],
                    'last_updated': datetime.utcnow(),
                    'data_sources': ['osm', 'open_elevation', 'weather_api'],
                    **flood_analysis
                }
                
                road_segments.append(segment_data)
                self.stats['roads_processed'] += 1
                
            except Exception as e:
                logger.error(f"Error processing road {road.get('id', 'unknown')}: {e}")
                self.stats['errors'].append(f"Road processing error: {e}")
        
        # Store in database
        if road_segments:
            async with TerrainDatabaseService() as db:
                stored_count = await db.store_road_segments(road_segments)
                self.stats['roads_updated'] = stored_count
                logger.info(f"✅ Stored {stored_count} road segments in database")
                
                # Record flood zone history for known areas
                for zone in self.FLOOD_PRONE_AREAS:
                    await db.record_flood_data(
                        zone_name=zone['name'],
                        lat=zone['lat'],
                        lon=zone['lon'],
                        flood_level=zone['risk'],
                        rainfall_mm=weather_data.get('rainfall_mm'),
                        data_source='historical_analysis'
                    )
        
        return len(road_segments) > 0
    
    async def update_terrain_database(self) -> Dict[str, Any]:
        """
        Main function to update terrain database with latest data
        
        Returns:
            Update statistics and status
        """
        logger.info("=" * 80)
        logger.info("🚀 Starting DATABASE terrain data update...")
        logger.info("=" * 80)
        
        update_stats = None
        
        async with TerrainDatabaseService() as db:
            # Start update session tracking
            update_session = await db.start_update_session()
            session_id = update_session.id
            
            try:
                # Step 1: Fetch latest roads from OSM
                logger.info("📍 Step 1: Fetching road network from OpenStreetMap...")
                osm_data = await self.fetch_osm_roads()
                roads = osm_data.get('elements', [])
                
                if not roads:
                    raise Exception("No road data fetched from OSM")
                
                # Step 2: Extract coordinates for elevation lookup
                logger.info("🗺️  Step 2: Extracting coordinate points...")
                coordinates = set()
                for road in roads:
                    if road.get('type') == 'way' and 'geometry' in road:
                        for point in road['geometry']:
                            coordinates.add((point['lat'], point['lon']))
                
                coordinates = list(coordinates)
                logger.info(f"📊 Extracted {len(coordinates)} unique coordinate points")
                
                # Step 3: Fetch elevation data
                logger.info("🏔️  Step 3: Fetching elevation data...")
                elevation_map = await self.fetch_elevation_data(coordinates)
                
                # Step 4: Fetch current weather
                logger.info("🌤️  Step 4: Fetching weather conditions...")
                weather_data = await self.fetch_weather_data()
                
                # Step 5: Process and store in database
                logger.info("💾 Step 5: Processing and storing data...")
                success = await self.process_roads_to_database(osm_data, elevation_map, weather_data)
                
                if not success:
                    raise Exception("Failed to process road data")
                
                # Calculate success rate
                total_operations = self.stats['roads_processed']
                errors = len(self.stats['errors'])
                success_rate = ((total_operations - errors) / total_operations * 100) if total_operations > 0 else 0
                
                # Prepare final statistics
                update_stats = {
                    'status': 'completed',
                    'success_rate': success_rate,
                    **self.stats
                }
                
                # Complete update session
                await db.complete_update_session(session_id, update_stats)
                
                logger.info("=" * 80)
                logger.info("✅ DATABASE terrain data update completed successfully!")
                logger.info(f"📊 Roads processed: {self.stats['roads_processed']}")
                logger.info(f"💾 Roads stored: {self.stats['roads_updated']}")
                logger.info(f"📈 Success rate: {success_rate:.1f}%")
                logger.info("=" * 80)
                
            except Exception as e:
                error_msg = f"Terrain update failed: {e}"
                logger.error(f"❌ {error_msg}")
                
                # Record failure
                update_stats = {
                    'status': 'failed',
                    'error_message': error_msg,
                    'success_rate': 0.0,
                    **self.stats
                }
                
                await db.complete_update_session(session_id, update_stats)
                raise
        
        return update_stats


async def update_flood_data_database() -> Dict[str, Any]:
    """Main function to update flood analysis data in database"""
    async with DatabaseFloodDataUpdater() as updater:
        result = await updater.update_terrain_database()
        return result


# Legacy function for backward compatibility
async def update_flood_data() -> Optional[str]:
    """
    Legacy function that maintains compatibility with existing file-based system
    Now exports database data to GeoJSON file after database update
    """
    try:
        # Update database first
        await update_flood_data_database()
        
        # Export to GeoJSON file for compatibility
        async with TerrainDatabaseService() as db:
            geojson_data = await db.export_to_geojson(include_flood_data=True)
            
            # Save to file
            output_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
            output_path.parent.mkdir(exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(geojson_data, f, indent=2)
            
            logger.info(f"📁 Exported database data to: {output_path}")
            return str(output_path)
    
    except Exception as e:
        logger.error(f"❌ Legacy update function failed: {e}")
        return None


if __name__ == "__main__":
    # Run the database updater
    result = asyncio.run(update_flood_data_database())
    print(f"\n✅ Database terrain data update completed!")
    print(f"📊 Statistics: {result}")