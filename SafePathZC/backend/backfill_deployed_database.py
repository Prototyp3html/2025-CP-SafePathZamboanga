#!/usr/bin/env python3
"""
Backfill missing flood data from Dec 15-19, 2025 on DEPLOYED Railway PostgreSQL
This version uses the Railway PostgreSQL connection string instead of local SQLite
"""

import asyncio
import aiohttp
import os
import logging
from datetime import datetime, timedelta, timezone
import pytz

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PHILIPPINE_TZ = pytz.timezone('Asia/Manila')

# Zamboanga coordinates for weather
ZAMBOANGA_LAT = 6.9271
ZAMBOANGA_LON = 122.0723

async def get_historical_rainfall(start_date: str, end_date: str) -> dict:
    """
    Fetch historical daily rainfall from Open-Meteo
    
    Args:
        start_date: YYYY-MM-DD format (e.g., "2025-12-15")
        end_date: YYYY-MM-DD format (e.g., "2025-12-19")
    
    Returns:
        dict mapping date -> rainfall_mm
    """
    logger.info(f"Fetching historical rainfall for {start_date} to {end_date}...")
    
    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={ZAMBOANGA_LAT}&longitude={ZAMBOANGA_LON}"
        f"&start_date={start_date}&end_date={end_date}"
        f"&daily=precipitation_sum"
        f"&timezone=Asia%2FManila"
    )
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    
                    # Parse response
                    dates = data['daily']['time']
                    rainfall = data['daily']['precipitation_sum']
                    
                    result = {}
                    for date, rain_mm in zip(dates, rainfall):
                        # Handle None values (no precipitation)
                        rain_amount = rain_mm if rain_mm is not None else 0.0
                        result[date] = rain_amount
                        logger.info(f"  {date}: {rain_amount}mm")
                    
                    return result
                else:
                    logger.error(f"API error: {resp.status}")
                    return {}
    except Exception as e:
        logger.error(f"Failed to fetch historical data: {e}")
        return {}


async def backfill_deployed_flood_data():
    """
    Backfill flood data for Dec 15-19, 2025 on DEPLOYED Railway PostgreSQL
    """
    logger.info("=" * 70)
    logger.info("FLOOD DATA BACKFILL: December 15-19, 2025 (DEPLOYED DATABASE)")
    logger.info("=" * 70)
    
    # Check if we have Railway database connection
    railway_db_url = os.getenv("DATABASE_URL")
    if not railway_db_url:
        logger.error("❌ DATABASE_URL not found in environment!")
        logger.info("\nFor LOCAL backfill, use: python backfill_flood_data.py")
        logger.info("For DEPLOYED backfill, run on Railway or set DATABASE_URL env var")
        return
    
    logger.info(f"Using database: {railway_db_url.split('@')[1] if '@' in railway_db_url else 'PostgreSQL'}")
    
    # Get historical rainfall
    rainfall_data = await get_historical_rainfall("2025-12-15", "2025-12-19")
    
    if not rainfall_data:
        logger.error("Could not retrieve historical rainfall data!")
        logger.info("\nManual Alternative:")
        logger.info("If you know the daily rainfall amounts, you can run manually:")
        logger.info("  python flood_data_updater.py 15  # 15mm on first day")
        logger.info("  python flood_data_updater.py 22  # 22mm on second day")
        logger.info("  etc.")
        return
    
    logger.info("\n" + "=" * 70)
    logger.info("Running flood analysis for each day on DEPLOYED database...")
    logger.info("=" * 70)
    
    from services.flood_data_updater import update_flood_data
    from models import SessionLocal
    
    # Process each day
    for date_str in sorted(rainfall_data.keys()):
        rainfall_mm = rainfall_data[date_str]
        
        logger.info(f"\n📅 Processing {date_str} with {rainfall_mm}mm rainfall...")
        
        try:
            # Create a fresh database session for each day (will use Railway DB)
            db_session = SessionLocal()
            
            # Run updater with historical rainfall
            output_path = await update_flood_data(
                manual_rainfall_mm=rainfall_mm,
                db_session=db_session
            )
            
            if output_path:
                logger.info(f"✅ Successfully processed {date_str} (DEPLOYED DATABASE)")
            else:
                logger.error(f"❌ Failed to process {date_str} - no output")
            
            db_session.close()
            
            # Small delay between runs to avoid API rate limits
            await asyncio.sleep(2)
            
        except Exception as e:
            logger.error(f"❌ Error processing {date_str}: {e}")
            continue
    
    logger.info("\n" + "=" * 70)
    logger.info("✅ DEPLOYED BACKFILL COMPLETE!")
    logger.info("=" * 70)
    logger.info("\nYour DEPLOYED flood hotspots and events from Dec 15-19 should now be visible.")
    logger.info("Check your deployed app to see the data!")


if __name__ == "__main__":
    logger.info("""
    ⚠️  DEPLOYED BACKFILL SCRIPT - Railway PostgreSQL
    
    This script will:
    1. Connect to your DEPLOYED Railway PostgreSQL database
    2. Fetch actual rainfall data for Dec 15-19 from Open-Meteo
    3. Run the flood updater for each day with that rainfall
    4. Save hotspots and events to DEPLOYED database with correct timestamps
    
    ⚠️  WARNING: 
    - Make sure DATABASE_URL env variable is set to your Railway database!
    - This may take 5-10 minutes to complete.
    
    Proceed? (Press Enter to continue or Ctrl+C to cancel)
    """)
    input()
    
    # Run the backfill on deployed database
    asyncio.run(backfill_deployed_flood_data())
