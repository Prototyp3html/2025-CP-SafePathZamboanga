import asyncio
from services.flood_forecast import flood_forecast_service
import json
from pathlib import Path

async def test():
    # Get weather
    weather = await flood_forecast_service.get_weather_forecast()
    if not weather:
        print("FAILED: Weather API")
        return
    
    # Load roads
    geojson_path = Path("data/terrain_roads.geojson")
    with open(geojson_path, 'r') as f:
        geojson = json.load(f)
    roads = geojson.get('features', [])
    
    # Generate forecast
    forecast = flood_forecast_service.build_forecast_from_weather(weather, roads)
    
    # Print results
    print("FLOOD FORECAST RESULTS")
    print("=" * 60)
    
    for day_idx, day in enumerate(forecast):
        num_roads = len(day['predicted_flooded_roads'])
        print(f"\n{day['date']}: {day['rainfall_mm']}mm - {num_roads} roads")
        for road in day['predicted_flooded_roads'][:3]:
            print(f"  {road['road_name']} ({road['confidence']}%)")

asyncio.run(test())
