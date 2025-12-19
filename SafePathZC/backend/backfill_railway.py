#!/usr/bin/env python3
"""
Quick backfill command for Railway PostgreSQL
Usage:
  python backfill_railway.py "postgresql://user:pass@host:5432/db"
"""

import sys
import asyncio
import aiohttp
import logging
from datetime import datetime
import pytz
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PHILIPPINE_TZ = pytz.timezone('Asia/Manila')
ZAMBOANGA_LAT = 6.9271
ZAMBOANGA_LON = 122.0723

async def get_historical_rainfall(start_date: str, end_date: str) -> dict:
    """Fetch historical rainfall from Open-Meteo"""
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
                    dates = data['daily']['time']
                    rainfall = data['daily']['precipitation_sum']
                    
                    result = {}
                    for date, rain_mm in zip(dates, rainfall):
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

async def backfill_railway_database(database_url: str):
    """Backfill flood data on Railway PostgreSQL"""
    logger.info("=" * 70)
    logger.info("FLOOD DATA BACKFILL: December 15-19, 2025 (RAILWAY DATABASE)")
    logger.info("=" * 70)
    
    # Test database connection
    try:
        engine = create_engine(database_url)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            logger.info("✅ Successfully connected to Railway PostgreSQL")
    except Exception as e:
        logger.error(f"❌ Failed to connect to database: {e}")
        logger.info(f"\nMake sure the connection string is correct:")
        logger.info(f"  postgresql://user:password@host:port/database")
        return
    
    # Get historical rainfall
    rainfall_data = await get_historical_rainfall("2025-12-15", "2025-12-19")
    
    if not rainfall_data:
        logger.error("Could not retrieve historical rainfall data!")
        return
    
    logger.info("\n" + "=" * 70)
    logger.info("Running flood analysis for each day on RAILWAY database...")
    logger.info("=" * 70)
    
    # Import after confirming database connection works
    import os
    os.environ["DATABASE_URL"] = database_url
    
    from services.flood_data_updater import update_flood_data
    from models import SessionLocal
    
    # Process each day
    for date_str in sorted(rainfall_data.keys()):
        rainfall_mm = rainfall_data[date_str]
        logger.info(f"\n📅 Processing {date_str} with {rainfall_mm}mm rainfall...")
        
        try:
            db_session = SessionLocal()
            output_path = await update_flood_data(
                manual_rainfall_mm=rainfall_mm,
                db_session=db_session
            )
            
            if output_path:
                logger.info(f"✅ Successfully processed {date_str} (RAILWAY DATABASE)")
            else:
                logger.error(f"❌ Failed to process {date_str}")
            
            db_session.close()
            await asyncio.sleep(2)
            
        except Exception as e:
            logger.error(f"❌ Error processing {date_str}: {e}")
            continue
    
    logger.info("\n" + "=" * 70)
    logger.info("✅ RAILWAY BACKFILL COMPLETE!")
    logger.info("=" * 70)
    logger.info("\nYour deployed flood hotspots should now be visible!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        logger.info("""
❌ Missing Railway PostgreSQL connection string!

USAGE:
  python backfill_railway.py "postgresql://user:password@host:5432/database"

EXAMPLE:
  python backfill_railway.py "postgresql://safepathzc_user:safepath123@rail.proxy.rlwy.net:54321/railway"

WHERE TO FIND YOUR CONNECTION STRING:
  1. Go to https://railway.app
  2. Select your SafePathZamboanga project
  3. Click on the PostgreSQL plugin
  4. Look for "Connection String" or "DATABASE_URL"
  5. Copy the full connection string

        """)
        sys.exit(1)
    
    db_url = sys.argv[1]
    asyncio.run(backfill_railway_database(db_url))
