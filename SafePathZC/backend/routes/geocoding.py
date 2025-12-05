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
    countrycodes: str = Query("ph", description="Country codes"),
    addressdetails: int = Query(1, description="Include address details"),
    extratags: int = Query(1, description="Include extra tags")
):
    """
    Proxy endpoint for Nominatim geocoding API with timeout resilience
    Falls back gracefully if Nominatim is slow
    """
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Zamboanga City bounding box (approximate)
        zamboanga_bbox = "6.8,7.0,121.9,122.2"
        url = f"{NOMINATIM_BASE_URL}/search"
        
        # First attempt: Search with full context - shorter timeout (5 seconds)
        search_query = quote(f"{q}, Zamboanga City, Philippines")
        
        params = {
            "format": format,
            "q": search_query,
            "limit": limit * 2,
            "countrycodes": countrycodes,
            "addressdetails": addressdetails,
            "extratags": extratags,
            "viewbox": zamboanga_bbox,
            "bounded": 0
        }
        
        headers = {
            "User-Agent": USER_AGENT
        }
        
        logger.info(f"🔍 Searching Nominatim for: {q}")
        
        try:
            # Try with shorter timeout first
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url, params=params, headers=headers)
                response.raise_for_status()
                results = response.json()
                
                if results:
                    sorted_results = sorted(
                        results,
                        key=lambda x: float(x.get("importance", 0)),
                        reverse=True
                    )[:limit]
                    
                    logger.info(f"✅ Nominatim returned {len(sorted_results)} results")
                    return {
                        "status": "success",
                        "results": sorted_results,
                        "total": len(sorted_results),
                        "query": q
                    }
        
        except (httpx.TimeoutException, asyncio.TimeoutError):
            logger.warning(f"⏱️ Nominatim timeout on first attempt, trying broader search with timeout...")
        
        # If timeout or no results, try broader search with even shorter timeout
        try:
            params_broad = {
                "format": format,
                "q": quote(q),
                "limit": limit * 2,
                "countrycodes": countrycodes,
                "viewbox": zamboanga_bbox,
                "bounded": 0
            }
            
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(url, params=params_broad, headers=headers)
                response.raise_for_status()
                results = response.json()
                
                # Filter to Zamboanga area
                zamboanga_results = []
                for result in results:
                    try:
                        lat = float(result.get("lat", 0))
                        lon = float(result.get("lon", 0))
                        if 6.8 <= lat <= 7.0 and 121.9 <= lon <= 122.2:
                            zamboanga_results.append(result)
                    except (ValueError, TypeError):
                        continue
                
                if zamboanga_results:
                    sorted_results = sorted(
                        zamboanga_results,
                        key=lambda x: float(x.get("importance", 0)),
                        reverse=True
                    )[:limit]
                    logger.info(f"✅ Broad search returned {len(sorted_results)} results")
                    return {
                        "status": "success",
                        "results": sorted_results,
                        "total": len(sorted_results),
                        "query": q
                    }
        
        except (httpx.TimeoutException, asyncio.TimeoutError):
            logger.warning(f"⏱️ Nominatim timeout on broad search too")
        
        # If both Nominatim attempts timeout/fail, return empty but don't error
        logger.warning(f"⚠️ Could not reach Nominatim for query: {q}, frontend will use fallback")
        return {
            "status": "success",
            "results": [],
            "total": 0,
            "query": q
        }
        
    except Exception as e:
        logger.error(f"❌ Unexpected error: {str(e)}")
        # Return empty results instead of error to allow frontend fallback
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