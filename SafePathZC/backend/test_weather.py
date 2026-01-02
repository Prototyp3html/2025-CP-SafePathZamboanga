import asyncio
from services.flood_forecast import flood_forecast_service
import json

async def test():
    print("\n✅ Testing Weather API...")
    weather = await flood_forecast_service.get_weather_forecast()
    if weather:
        print("✅ Weather API works!")
        print(f"   Fields available: {list(weather.get('daily', {}).keys())}")
        for i in range(min(7, len(weather['daily']['time']))):
            date = weather['daily']['time'][i]
            rain = weather['daily']['precipitation_sum'][i]
            print(f"  {date}: {rain}mm")
    else:
        print("❌ Weather API failed")

    print("\n✅ Testing Flood Risk Calculation...")
    # Test with low elevation (flood prone)
    result = flood_forecast_service.calculate_forecast_flood_risk(
        rainfall_mm=10,  # 10mm rain
        elevation=2,     # 2m elevation
        distance_to_water=100  # 100m to water
    )
    print(f"Test 1 (10mm, 2m elevation): will_flood={result['will_flood']}, confidence={result['confidence']}%")
    
    # Test with dry day
    result2 = flood_forecast_service.calculate_forecast_flood_risk(
        rainfall_mm=0,
        elevation=5,
        distance_to_water=500
    )
    print(f"Test 2 (0mm, 5m elevation): will_flood={result2['will_flood']}, confidence={result2['confidence']}%")

asyncio.run(test())
