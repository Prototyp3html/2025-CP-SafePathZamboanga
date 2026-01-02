"""
Test script for Flood Forecast API
Run this to debug the forecast feature
"""

import asyncio
import json
from pathlib import Path
import sys

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

async def test_flood_forecast():
    """Test the flood forecast service"""
    
    print("\n" + "="*80)
    print("FLOOD FORECAST API TEST")
    print("="*80 + "\n")
    
    # Test 1: Weather API
    print("📊 TEST 1: Weather Forecast API")
    print("-" * 80)
    try:
        from services.flood_forecast import flood_forecast_service
        
        weather_data = await flood_forecast_service.get_weather_forecast()
        if weather_data:
            daily_times = weather_data['daily']['time']
            daily_rainfall = weather_data['daily']['precipitation_sum']
            daily_prob = weather_data['daily']['precipitation_probability']
            
            print(f"✅ Weather API working!")
            print(f"   Days fetched: {len(daily_times)}")
            for i, (date, rain, prob) in enumerate(zip(daily_times[:3], daily_rainfall[:3], daily_prob[:3])):
                print(f"   Day {i+1}: {date} | {rain}mm rain | {prob}% probability")
        else:
            print("❌ Could not fetch weather data")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 2: Road Data Loading
    print("\n📍 TEST 2: Road Data Loading")
    print("-" * 80)
    try:
        geojson_path = Path(__file__).parent / "SafePathZC" / "backend" / "data" / "terrain_roads.geojson"
        print(f"Looking for: {geojson_path}")
        print(f"Exists: {geojson_path.exists()}")
        
        if geojson_path.exists():
            with open(geojson_path, 'r') as f:
                geojson = json.load(f)
            
            roads = geojson.get('features', [])
            print(f"✅ Loaded {len(roads)} roads")
            
            # Show first 3 roads structure
            if roads:
                for i, road in enumerate(roads[:3]):
                    geom_type = road.get('geometry', {}).get('type', 'unknown')
                    road_name = road.get('properties', {}).get('name', 'Unknown')
                    elevation = road.get('properties', {}).get('elevation', 'N/A')
                    print(f"\n   Road {i+1}: {road_name}")
                    print(f"   - Type: {geom_type}")
                    print(f"   - Elevation: {elevation}")
                    
                    geom = road.get('geometry', {})
                    if geom_type == 'LineString':
                        coords = geom.get('coordinates', [])
                        print(f"   - Coordinates: {len(coords)} points")
                        if coords:
                            print(f"     First point: {coords[0]}")
                            print(f"     Last point: {coords[-1]}")
                    elif geom_type == 'MultiLineString':
                        all_coords = geom.get('coordinates', [])
                        print(f"   - Multi-line segments: {len(all_coords)}")
                        if all_coords and all_coords[0]:
                            print(f"     First segment: {len(all_coords[0])} points")
        else:
            print("❌ terrain_roads.geojson not found!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    # Test 3: Full Forecast Generation
    print("\n🌦️ TEST 3: Full Forecast Generation")
    print("-" * 80)
    try:
        from services.flood_forecast import flood_forecast_service
        
        weather_data = await flood_forecast_service.get_weather_forecast()
        geojson_path = Path(__file__).parent / "SafePathZC" / "backend" / "data" / "terrain_roads.geojson"
        
        if weather_data and geojson_path.exists():
            with open(geojson_path, 'r') as f:
                geojson = json.load(f)
            
            roads = geojson.get('features', [])
            forecast = flood_forecast_service.build_forecast_from_weather(weather_data, roads)
            
            print(f"✅ Generated forecast for {len(forecast)} days")
            
            total_predictions = 0
            for day_idx, day in enumerate(forecast[:3]):
                num_roads = len(day['predicted_flooded_roads'])
                total_predictions += num_roads
                print(f"\n   {day['date']}: {day['rainfall_mm']}mm | {num_roads} roads predicted to flood")
                
                if day['predicted_flooded_roads']:
                    for road in day['predicted_flooded_roads'][:2]:
                        print(f"      - {road['road_name']}: {road['confidence']}% confidence")
            
            print(f"\n   Total predictions in first 3 days: {total_predictions}")
            
            if total_predictions == 0:
                print("\n   ⚠️ No roads predicted to flood!")
                print("   This could mean:")
                print("      1. Expected! Dec 23 has 0-2mm rain (below flood threshold)")
                print("      2. Or: Confidence threshold (>40%) is too high")
                print("      3. Or: Road elevation/proximity data not set properly")
                
                # Check rainfall threshold
                print("\n   🔍 Debugging rainfall threshold:")
                for day_idx, day in enumerate(forecast[:7]):
                    print(f"      {day['date']}: {day['rainfall_mm']}mm (threshold: >=2mm)")
                
        else:
            print("❌ Missing weather or road data")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "="*80)
    print("TEST COMPLETE")
    print("="*80 + "\n")

if __name__ == "__main__":
    asyncio.run(test_flood_forecast())
