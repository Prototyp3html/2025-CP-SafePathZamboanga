#!/usr/bin/env python3
"""
Scheduled Flood Data Update Script
Run this script via cron job or Windows Task Scheduler to keep flood data updated
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime
import logging

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from services.flood_data_updater import update_flood_data

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(Path(__file__).parent / 'logs' / 'flood_updates.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


async def main():
    """Main update function"""
    logger.info("=" * 70)
    logger.info(f"SCHEDULED FLOOD DATA UPDATE - {datetime.now()}")
    logger.info("=" * 70)
    
    try:
        output_path = await update_flood_data()
        
        if output_path:
            logger.info("✅ Flood data update completed successfully")
            logger.info(f"📁 Updated file: {output_path}")
            return 0
        else:
            logger.error("❌ Flood data update failed - no output generated")
            return 1
            
    except Exception as e:
        logger.error(f"❌ Flood data update failed with error: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    # Ensure logs directory exists
    log_dir = Path(__file__).parent / 'logs'
    log_dir.mkdir(exist_ok=True)
    
    # Run the update
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
