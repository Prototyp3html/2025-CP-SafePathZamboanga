"""
Scheduled Jobs and Cron Routes for SafePath
Handles automatic updates like flood data every 6 hours
"""

from fastapi import APIRouter, HTTPException, Header
from datetime import datetime
import asyncio
import logging
import os
from pathlib import Path

from services.flood_data_updater import update_flood_data

router = APIRouter(prefix="/cron", tags=["cron"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Simple security - Railway should provide X-Cron-Secret header
CRON_SECRET = os.getenv("CRON_SECRET", "your-secret-key-change-this")


def verify_cron_secret(x_cron_secret: str = Header(None)) -> bool:
    """Verify that the request is from an authorized cron service"""
    if not x_cron_secret:
        logger.warning("❌ Cron request received without X-Cron-Secret header")
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    # Accept either the env variable secret OR the hardcoded backup secret
    valid_secrets = [
        CRON_SECRET,
        "safepath-flood-update-secret-key-2025"  # Backup hardcoded secret
    ]
    
    if x_cron_secret not in valid_secrets:
        logger.warning(f"❌ Cron request with invalid secret: {x_cron_secret}")
        raise HTTPException(status_code=403, detail="Invalid credentials")
    
    return True


@router.post("/flood-data-update")
async def trigger_flood_data_update(x_cron_secret: str = Header(None)):
    """
    Triggered by external cron service (e.g., EasyCron, Railway Cron) every 6 hours
    Updates terrain_roads.geojson with latest flood data
    
    Security:
    - Requires X-Cron-Secret header matching CRON_SECRET env variable
    
    Usage:
    POST https://safepath-zc-production.up.railway.app/cron/flood-data-update
    Headers: X-Cron-Secret: your-secret-key
    """
    
    # Verify the cron secret
    verify_cron_secret(x_cron_secret)
    
    logger.info("=" * 70)
    logger.info(f"🚀 FLOOD DATA UPDATE CRON JOB TRIGGERED - {datetime.now()}")
    logger.info("=" * 70)
    
    try:
        # Run the flood data updater
        output_path = await update_flood_data()
        
        if output_path:
            logger.info("✅ Flood data update completed successfully")
            logger.info(f"📁 Updated file: {output_path}")
            
            # Read the generated file to get stats
            import json
            with open(output_path, 'r') as f:
                geojson = json.load(f)
            
            total_roads = geojson.get('metadata', {}).get('total_roads', 0)
            flooded_roads = geojson.get('metadata', {}).get('flooded_roads', 0)
            rainfall = geojson.get('metadata', {}).get('current_rainfall_mm', 0)
            
            return {
                "status": "success",
                "message": "Flood data updated successfully",
                "timestamp": datetime.now().isoformat(),
                "stats": {
                    "total_roads": total_roads,
                    "flooded_roads": flooded_roads,
                    "current_rainfall_mm": rainfall,
                    "updated_file": str(output_path)
                }
            }
        else:
            logger.error("❌ Flood data update failed - no output generated")
            raise HTTPException(
                status_code=500, 
                detail="Flood data update failed - no output generated"
            )
            
    except Exception as e:
        logger.error(f"❌ Flood data update failed with error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Flood data update failed: {str(e)}"
        )


@router.get("/cron-health")
async def cron_health_check():
    """
    Health check endpoint for cron job monitoring
    Can be used to verify the service is running
    """
    return {
        "status": "ok",
        "service": "SafePath Cron Jobs",
        "timestamp": datetime.now().isoformat(),
        "last_cron_secret_set": bool(CRON_SECRET and CRON_SECRET != "your-secret-key-change-this")
    }

@router.get("/flood-data-update")
async def trigger_flood_data_update_get(secret: str = None):
    """
    GET version of the cron route for free cron services like EasyCron
    Uses ?secret=YOUR_SECRET instead of headers
    """
    # Accept either the env variable secret OR the hardcoded backup secret
    valid_secrets = [
        CRON_SECRET,
        "safepath-flood-update-secret-key-2025"  # Backup hardcoded secret
    ]
    
    if not secret or secret not in valid_secrets:
        raise HTTPException(status_code=403, detail="Invalid or missing secret")

    logger.info("=" * 70)
    logger.info(f"🚀 FLOOD DATA UPDATE CRON JOB TRIGGERED (GET) - {datetime.now()}")
    logger.info("=" * 70)
    
    try:
        # Run the flood data updater
        output_path = await update_flood_data()
        
        if output_path:
            logger.info("✅ Flood data update completed successfully")
            logger.info(f"📁 Updated file: {output_path}")
            
            # Read the generated file to get stats
            import json
            with open(output_path, 'r') as f:
                geojson = json.load(f)
            
            total_roads = geojson.get('metadata', {}).get('total_roads', 0)
            flooded_roads = geojson.get('metadata', {}).get('flooded_roads', 0)
            rainfall = geojson.get('metadata', {}).get('current_rainfall_mm', 0)
            
            return {
                "status": "success",
                "message": "Flood data updated successfully",
                "timestamp": datetime.now().isoformat(),
                "stats": {
                    "total_roads": total_roads,
                    "flooded_roads": flooded_roads,
                    "current_rainfall_mm": rainfall,
                    "updated_file": str(output_path)
                }
            }
        else:
            logger.error("❌ Flood data update failed - no output generated")
            raise HTTPException(
                status_code=500, 
                detail="Flood data update failed - no output generated"
            )
            
    except Exception as e:
        logger.error(f"❌ Flood data update failed with error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"Flood data update failed: {str(e)}"
        )
