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
    Proxy endpoint for Nominatim geocoding API to avoid CORS issues
    """
    try:
        # Construct the Nominatim URL
        search_query = quote(f"{q}, Zamboanga City, Philippines")
        url = f"{NOMINATIM_BASE_URL}/search"
        
        params = {
            "format": format,
            "q": search_query,
            "limit": limit,
            "countrycodes": countrycodes,
            "addressdetails": addressdetails,
            "extratags": extratags
        }
        
        headers = {
            "User-Agent": USER_AGENT
        }
        
        # Make the request to Nominatim
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, headers=headers)
            response.raise_for_status()
            
            results = response.json()
            
            # Filter results to ensure they're in Zamboanga area
            zamboanga_results = []
            for result in results:
                display_name = result.get("display_name", "").lower()
                if any(keyword in display_name for keyword in ["zamboanga", "zamboanga city", "zamboanga del sur"]):
                    zamboanga_results.append(result)
            
            return {
                "status": "success",
                "results": zamboanga_results,
                "total": len(zamboanga_results),
                "query": q
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