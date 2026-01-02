"""
Flood Forecast Service
Predicts which roads will flood based on weather forecast (next 7 days)
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple
import httpx
import asyncio

logger = logging.getLogger(__name__)

ZAMBOANGA_BOUNDS = {
    'min_lat': 6.8,
    'max_lat': 9.5,
    'min_lon': 121.5,
    'max_lon': 123.7
}

class FloodForecastService:
    """Service to forecast flood risk based on weather forecasts"""
    
    def __init__(self):
        self.weather_api = "https://api.open-meteo.com/v1/forecast"
        self.zamboanga_lat = 6.9271
        self.zamboanga_lon = 122.0789
        self.elevation_cache = {}  # Cache elevation data
    
    def get_elevation_for_coordinate(self, lat: float, lon: float) -> float:
        """
        Get elevation for a coordinate
        Uses heuristics based on Zamboanga geography
        
        Zamboanga City facts:
        - Coastal city (sea level in many areas)
        - Most roads are 2-10m elevation
        - Interior areas go up to 20-30m
        - Harbor areas are 0-2m (most flood prone)
        """
        # Harbor/coastal areas: 0-5m elevation (highest flood risk)
        if lat < 6.93 and lon > 122.06:
            return 2
        
        # Downtown core: 3-8m elevation  
        if 6.92 < lat < 6.95 and 122.07 < lon < 122.09:
            return 5
        
        # Uphill areas: 10-20m elevation
        if lat > 6.95 or lon < 122.06:
            return 12
        
        # Default: 5-10m elevation
        return 7
    
    async def get_weather_forecast(self) -> Dict[str, Any]:
        """
        Fetch 7-day weather forecast for Zamboanga
        
        Returns:
            Dict with daily rainfall forecast
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Open-Meteo API requires separate query parameters for each daily metric
                response = await client.get(
                    self.weather_api,
                    params={
                        'latitude': self.zamboanga_lat,
                        'longitude': self.zamboanga_lon,
                        'daily': 'precipitation_sum',
                        'timezone': 'Asia/Manila',
                        'forecast_days': 7
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"✅ Weather forecast fetched: {len(data['daily']['time'])} days")
                    return data
                else:
                    logger.error(f"❌ Weather API error: {response.status_code}")
                    logger.error(f"Response: {response.text[:300]}")
                    return None
                    
        except Exception as e:
            logger.error(f"❌ Error fetching weather forecast: {e}")
            return None
    
    def calculate_forecast_flood_risk(self, rainfall_mm: float, elevation: float, 
                                     distance_to_water: float) -> Dict[str, Any]:
        """
        Calculate flood risk for a location based on forecasted rainfall
        
        Args:
            rainfall_mm: Forecasted rainfall in mm
            elevation: Elevation in meters
            distance_to_water: Distance to nearest water body in meters
            
        Returns:
            Dict with flood prediction
        """
        flood_score = 0
        
        # Elevation factor (same as in flood_data_updater.py)
        is_valid_elevation = elevation > 1.0
        if is_valid_elevation:
            if elevation < 3:
                flood_score += 20  # Reduced from 40 so elevation doesn't dominate
            elif elevation < 5:
                flood_score += 15
            elif elevation < 10:
                flood_score += 10
            elif elevation < 20:
                flood_score += 5
        
        # RAINFALL - Scaled to create meaningful variance without explosion
        # Higher rainfall = higher flood score, controls spread of predictions
        if rainfall_mm > 40:
            flood_score += 85   # Extreme rainfall
        elif rainfall_mm > 30:
            flood_score += 75   # Very heavy
        elif rainfall_mm > 20:
            flood_score += 65   # Heavy
        elif rainfall_mm > 15:
            flood_score += 60   # Moderate-heavy
        elif rainfall_mm > 12:
            flood_score += 50   # Moderate
        elif rainfall_mm > 10:
            flood_score += 40   # Light-moderate
        elif rainfall_mm > 7:
            flood_score += 30   # Light
        elif rainfall_mm > 5:
            flood_score += 20   # Very light
        elif rainfall_mm > 3:
            flood_score += 12   # Minimal
        elif rainfall_mm > 1:
            flood_score += 5    # Trace
        
        # Distance to water (proximity amplifier)
        if distance_to_water < 50:
            flood_score += 20
        elif distance_to_water < 100:
            flood_score += 15
        elif distance_to_water < 500:
            flood_score += 10
        elif distance_to_water < 1000:
            flood_score += 5
        
        # Determine flood likelihood
        if rainfall_mm > 0:
            if flood_score >= 50:
                will_flood = True
                confidence = min(100, int((flood_score / 100) * 100))
            elif flood_score >= 30:
                will_flood = True
                confidence = int((flood_score / 80) * 100)
            elif flood_score >= 15:
                will_flood = True
                confidence = int((flood_score / 50) * 100)
            else:
                will_flood = False
                confidence = 0
        else:
            # No rain
            if flood_score >= 60:
                will_flood = True
                confidence = int((flood_score / 100) * 50)
            else:
                will_flood = False
                confidence = 0
        
        return {
            'will_flood': will_flood,
            'confidence': confidence,
            'flood_score': flood_score,
            'rainfall_mm': rainfall_mm
        }
    
    def build_forecast_from_weather(self, weather_data: Dict, roads_data: List[Dict]) -> List[Dict]:
        """
        Build flood forecast for all roads based on weather forecast
        
        Args:
            weather_data: 7-day weather forecast
            roads_data: List of roads with elevation and location data
            
        Returns:
            List of forecasted flood predictions for each day
        """
        if not weather_data:
            return []
        
        forecast_results = []
        
        try:
            daily_times = weather_data['daily']['time']
            daily_rainfall = weather_data['daily']['precipitation_sum']
            
            for day_idx, (date_str, rainfall_mm) in enumerate(zip(daily_times, daily_rainfall)):
                forecast_day = {
                    'date': date_str,
                    'rainfall_mm': rainfall_mm or 0,
                    'predicted_flooded_roads': []
                }
                
                # For each road, calculate if it will flood
                # Process ALL roads (11,252) for comprehensive predictions
                for road in roads_data:  # Process all roads
                    try:
                        if 'geometry' not in road:
                            continue
                        
                        geometry = road['geometry']
                        if not geometry:
                            continue
                        
                        # Handle different geometry types
                        coords = None
                        if geometry.get('type') == 'LineString':
                            coords = geometry.get('coordinates', [])
                        elif geometry.get('type') == 'MultiLineString':
                            all_coords = geometry.get('coordinates', [])
                            if all_coords:
                                coords = all_coords[0]
                        else:
                            coords = geometry.get('coordinates', [])
                        
                        if not coords or len(coords) < 2:
                            continue
                        
                        # Get elevation for the road location
                        # GeoJSON uses [lon, lat] format
                        mid_coord = coords[len(coords) // 2]
                        lat = mid_coord[1] if len(mid_coord) > 1 else 6.927
                        lon = mid_coord[0] if len(mid_coord) > 0 else 122.079
                        
                        # Try to get elevation from road properties first
                        props = road.get('properties', {})
                        elevation = props.get('elev_mean') or props.get('elev_min') or self.get_elevation_for_coordinate(lat, lon)
                        
                        # Get approximate distance to water
                        # Coastal/harbor areas: 0-100m, others: 500-1000m
                        if lat < 6.93 and lon > 122.06:
                            distance_to_water = 50  # Harbor district - closest to water
                        elif lat > 6.95 or lon < 122.06:
                            distance_to_water = 800  # Inland areas
                        else:
                            distance_to_water = 300  # Mid-city areas
                        
                        # Calculate forecast
                        forecast = self.calculate_forecast_flood_risk(
                            rainfall_mm or 0,
                            elevation,
                            distance_to_water
                        )
                        
                        # Dynamic confidence threshold based on rainfall amount
                        # MAXIMUM STRICT: Cap at ~200 roads/day max to prevent lag
                        # Only show roads with HIGH confidence (80%+) to reduce map load
                        if rainfall_mm > 25:
                            confidence_threshold = 80  # Heavy: ~100-200 roads
                        elif rainfall_mm > 20:
                            confidence_threshold = 82  # Very heavy: ~80-120 roads
                        elif rainfall_mm > 15:
                            confidence_threshold = 84  # Moderate-heavy: ~50-80 roads
                        elif rainfall_mm > 10:
                            confidence_threshold = 86  # Moderate: ~30-50 roads
                        elif rainfall_mm > 7:
                            confidence_threshold = 88  # Light-moderate: ~15-30 roads
                        elif rainfall_mm > 5:
                            confidence_threshold = 90  # Light: ~5-15 roads
                        elif rainfall_mm > 3:
                            confidence_threshold = 92  # Very light: ~2-5 roads
                        else:
                            confidence_threshold = 95  # Trace: <2 roads
                        
                        # MAXIMUM STRICT: Only highest-confidence predictions to keep map responsive
                        if forecast['will_flood'] and forecast['confidence'] > confidence_threshold:
                            props = road.get('properties', {})
                            road_name = props.get('name') or f"Road {props.get('osm_id', 'Unknown')}"
                            
                            forecast_day['predicted_flooded_roads'].append({
                                'road_id': props.get('road_id') or props.get('osm_id') or 'unknown',
                                'road_name': road_name,
                                'confidence': forecast['confidence'],
                                'location': {
                                    'lat': lat,
                                    'lon': lon
                                }
                            })
                    except Exception as road_error:
                        logger.debug(f"Error processing road {road.get('id', 'unknown')}: {road_error}")
                        continue
                
                # PERFORMANCE: Limit to top 200 roads per day (sorted by confidence)
                # This prevents map lag from rendering thousands of markers
                if len(forecast_day['predicted_flooded_roads']) > 200:
                    # Sort by confidence and keep only top 200
                    forecast_day['predicted_flooded_roads'].sort(
                        key=lambda x: x['confidence'], 
                        reverse=True
                    )
                    forecast_day['predicted_flooded_roads'] = forecast_day['predicted_flooded_roads'][:200]
                    logger.info(f"  ℹ️  Limited {forecast_day['date']} to top 200 highest-confidence roads")
                
                forecast_results.append(forecast_day)
            
            logger.info(f"✅ Flood forecast generated for {len(forecast_results)} days")
            return forecast_results
            
        except Exception as e:
            logger.error(f"❌ Error building forecast: {e}")
            return []

# Singleton instance
flood_forecast_service = FloodForecastService()
