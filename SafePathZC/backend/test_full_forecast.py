import asyncio
from services.flood_forecast import flood_forecast_service
import json
from pathlib import Path

async def test():
    print("\n" + "="*80)
    print("FULL FLOOD FORECAST TEST WITH ROADS")
    print("="*80)
    
    # Get weather
    print("\n1️⃣  Fetching weather forecast...")
    weather = await flood_forecast_service.get_weather_forecast()
    if weather:
        for i in range(min(7, len(weather['daily']['time']))):
            date = weather['daily']['time'][i]
            rain = weather['daily']['precipitation_sum'][i]
            print(f"   {date}: {rain}mm")
    else:
        print("❌ Failed to fetch weather")
        return
    
    # Load roads
    print("\n2️⃣  Loading road data...")
    geojson_path = Path(__file__).parent / "data" / "terrain_roads.geojson"
    if geojson_path.exists():
        with open(geojson_path, 'r') as f:
            geojson = json.load(f)
        roads = geojson.get('features', [])
        print(f"   ✅ Loaded {len(roads)} roads")
    else:
        print(f"   ❌ Not found: {geojson_path}")
        return
    
    # Generate forecast
    print("\n3️⃣  Generating flood predictions...")
    forecast = flood_forecast_service.build_forecast_from_weather(weather, roads)
    
    total_predictions = 0
    for day_idx, day in enumerate(forecast):
        num_roads = len(day['predicted_flooded_roads'])
        total_predictions += num_roads
        if num_roads > 0:
            print(f"\n   📅 {day['date']}: {day['rainfall_mm']}mm → {num_roads} roads predicted")
            for road in day['predicted_flooded_roads'][:5]:
                print(f"      🔴 {road['road_name']}: {road['confidence']}% confidence")
            if num_roads > 5:
                print(f"      ... and {num_roads - 5} more roads")
    
    print(f"\n📊 Summary: {total_predictions} total predictions across 7 days")
    if total_predictions == 0:
        print("   ⚠️ No roads predicted to flood")
        print("   This might mean:")
        print("      - Forecast rainfall is too light (<2mm)")
        print("      - Road locations don't match flood-prone areas")
        print("      - Confidence threshold is too high")
    
    print("\n" + "="*80)

asyncio.run(test())
