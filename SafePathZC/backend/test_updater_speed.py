#!/usr/bin/env python3
"""
Test the flood updater performance with low rainfall
Should be fast (< 10 seconds) when rainfall < 1mm
"""

import asyncio
import time
from services.flood_data_updater import FloodDataUpdater

async def test_low_rainfall_update():
    print("Testing flood updater with 0mm rainfall...")
    start = time.time()
    
    try:
        async with FloodDataUpdater() as updater:
            output_path = await updater.generate_updated_terrain_geojson(manual_rainfall_mm=0.0)
            elapsed = time.time() - start
            
            if output_path:
                print(f"✅ Update completed in {elapsed:.1f}s")
                print(f"   Output: {output_path}")
                if elapsed < 30:
                    print("   🎉 FAST! (< 30s threshold)")
                else:
                    print(f"   ⚠️  SLOW! ({elapsed:.1f}s - expected < 30s)")
            else:
                print("❌ Update failed - no output")
                
    except Exception as e:
        elapsed = time.time() - start
        print(f"❌ Error after {elapsed:.1f}s: {e}")

if __name__ == "__main__":
    asyncio.run(test_low_rainfall_update())
