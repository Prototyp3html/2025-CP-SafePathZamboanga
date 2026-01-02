"""
Flood Forecast API Endpoint
Provides 7-day flood predictions based on weather forecast
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
import json
from pathlib import Path
import logging

router = APIRouter(prefix="/api/flood-forecast", tags=["flood-forecast"])
logger = logging.getLogger(__name__)

@router.get("/predictions")
async def get_flood_predictions():
    """
    Get 7-day flood predictions based on weather forecast
    
    Returns:
        - List of daily predictions with which roads are predicted to flood
        - Confidence levels for each prediction
    """
    try:
        from services.flood_forecast import flood_forecast_service
        
        logger.info("📊 Generating flood predictions for next 7 days...")
        
        # Fetch weather forecast
        weather_data = await flood_forecast_service.get_weather_forecast()
        
        if not weather_data:
            raise HTTPException(status_code=500, detail="Could not fetch weather forecast")
        
        # Load road data
        geojson_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
        if not geojson_path.exists():
            raise HTTPException(status_code=500, detail="Road data not found")
        
        with open(geojson_path, 'r') as f:
            geojson = json.load(f)
        
        roads = geojson.get('features', [])
        
        # Build forecast
        forecast = flood_forecast_service.build_forecast_from_weather(weather_data, roads)
        
        logger.info(f"✅ Generated predictions for {len(forecast)} days")
        
        return {
            'status': 'success',
            'generated_at': datetime.utcnow().isoformat(),
            'forecast_days': len(forecast),
            'predictions': forecast
        }
        
    except Exception as e:
        logger.error(f"❌ Error generating predictions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate predictions: {str(e)}")

@router.get("/today")
async def get_today_forecast():
    """
    Get today's flood prediction
    
    Returns:
        - Today's weather forecast
        - Which roads are predicted to flood today
    """
    try:
        from services.flood_forecast import flood_forecast_service
        
        # Fetch forecast
        weather_data = await flood_forecast_service.get_weather_forecast()
        
        if not weather_data:
            return {
                'status': 'error',
                'message': 'Could not fetch forecast'
            }
        
        # Get today's rainfall
        today_rainfall = weather_data['daily']['precipitation_sum'][0]
        today_prob = weather_data['daily']['precipitation_probability'][0]
        
        logger.info(f"📊 Today's forecast: {today_rainfall}mm rain, {today_prob}% probability")
        
        return {
            'status': 'success',
            'date': weather_data['daily']['time'][0],
            'rainfall_mm': today_rainfall,
            'rainfall_probability': today_prob,
            'will_likely_flood': (today_rainfall or 0) >= 2  # 2mm threshold
        }
        
    except Exception as e:
        logger.error(f"❌ Error fetching today's forecast: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }
