from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import httpx
import asyncio
from urllib.parse import quote

router = APIRouter()

# Nominatim API configuration
NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"
USER_AGENT = "SafePathZamboanga/1.0 (https://safepath-zamboanga.com)"

@router.get("/search")
async def search_locations(
    q: str = Query(..., description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results"),
    format: str = Query("json", description="Response format"),
):
    """
    Simple proxy to Nominatim API - filters to Zamboanga City only
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        url = f"{NOMINATIM_BASE_URL}/search"
        
        params = {
            "format": format,
            "q": q,
            "limit": limit * 3,  # Get more to filter down
            "addressdetails": 1,
            "extratags": 1,
            "countrycodes": "ph"
        }
        
        headers = {
            "User-Agent": USER_AGENT
        }
        
        logger.info(f"🔍 Searching Nominatim for: {q}")
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            results = response.json()
            
            # Filter to Zamboanga City coordinates only
            # Zamboanga City bounding box: lat 6.8-7.0, lon 121.9-122.2
            zamboanga_results = []
            for result in results:
                try:
                    lat = float(result.get("lat", 0))
                    lon = float(result.get("lon", 0))
                    # Keep only results within Zamboanga City bounds
                    if 6.8 <= lat <= 7.0 and 121.9 <= lon <= 122.2:
                        zamboanga_results.append(result)
                except (ValueError, TypeError):
                    continue
            
            # Return up to limit results
            filtered_results = zamboanga_results[:limit]
            
            logger.info(f"✅ Found {len(filtered_results)} results in Zamboanga City for: {q}")
            
            return {
                "status": "success",
                "results": filtered_results,
                "total": len(filtered_results),
                "query": q
            }
        
    except httpx.TimeoutException:
        logger.error(f"⏱️ Nominatim timeout for query: {q}")
        # Return empty instead of error so frontend uses fallback
        return {
            "status": "success",
            "results": [],
            "total": 0,
            "query": q
        }
    except httpx.HTTPStatusError as e:
        logger.error(f"❌ Nominatim error: {e.response.status_code}")
        return {
            "status": "success",
            "results": [],
            "total": 0,
            "query": q
        }
    except Exception as e:
        logger.error(f"❌ Unexpected error: {str(e)}")
        return {
            "status": "success",
            "results": [],
            "total": 0,
            "query": q
        }

@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    format: str = Query("json", description="Response format"),
    addressdetails: int = Query(1, description="Include address details")
):
    """
    Proxy endpoint for Nominatim reverse geocoding API
    """
    try:
        url = f"{NOMINATIM_BASE_URL}/reverse"
        
        params = {
            "format": format,
            "lat": lat,
            "lon": lon,
            "addressdetails": addressdetails
        }
        
        headers = {
            "User-Agent": USER_AGENT
        }
        
        # Make the request to Nominatim
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            
            result = response.json()
            
            return {
                "status": "success",
                "result": result,
                "coordinates": {"lat": lat, "lon": lon}
            }
            
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=408, 
            detail="Request timeout - Nominatim API is not responding"
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Nominatim API error: {e.response.text}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/health")
async def health_check():
    """
    Health check endpoint for the geocoding service
    """
    try:
        # Test connection to Nominatim
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{NOMINATIM_BASE_URL}/search", 
                                      params={"format": "json", "q": "Zamboanga", "limit": 1},
                                      headers={"User-Agent": USER_AGENT})
            nominatim_status = "healthy" if response.status_code == 200 else "unhealthy"
            
        return {
            "status": "healthy",
            "nominatim_api": nominatim_status,
            "message": "Geocoding service is operational"
        }
    except Exception as e:
        return {
            "status": "degraded",
            "nominatim_api": "unhealthy",
            "message": f"Service issues: {str(e)}"
        }