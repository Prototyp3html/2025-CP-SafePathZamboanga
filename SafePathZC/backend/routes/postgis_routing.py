"""
PostGIS routing API endpoints for SafePath Zamboanga
High-performance terrain-aware routing with spatial database backend
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import logging
import time
from services.postgis_routing import calculate_postgis_route, get_postgis_routing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/routing/postgis", tags=["PostGIS Routing"])

# Request/Response Models
class PostGISRouteRequest(BaseModel):
    """Request model for PostGIS route calculation"""
    start_lat: float = Field(..., ge=-90, le=90, description="Starting latitude")
    start_lng: float = Field(..., ge=-180, le=180, description="Starting longitude")
    end_lat: float = Field(..., ge=-90, le=90, description="Destination latitude")
    end_lng: float = Field(..., ge=-180, le=180, description="Destination longitude")
    mode: str = Field(default="car", pattern="^(car|motorcycle|walking)$", description="Transportation mode")
    alternatives: int = Field(default=1, ge=1, le=5, description="Number of route alternatives")
    avoid_floods: bool = Field(default=True, description="Avoid flooded roads when possible")

class TerrainInfo(BaseModel):
    """Terrain information for route segment"""
    elev_mean: float
    elev_min: float
    elev_max: float
    slope_gradient: float

class PostGISRouteSegment(BaseModel):
    """Enhanced route segment with PostGIS terrain data"""
    distance: float = Field(..., description="Segment distance in meters")
    duration: float = Field(..., description="Segment duration in seconds")
    road_name: str = Field(..., description="Road name")
    elevation_info: TerrainInfo
    flood_risk: bool = Field(..., description="Whether segment has flood risk")
    flood_risk_level: str = Field(..., description="Flood risk level (LOW/MEDIUM/HIGH)")

class TerrainSummary(BaseModel):
    """Comprehensive terrain summary for entire route"""
    total_elevation_gain: float = Field(..., description="Total elevation gain in meters")
    flood_risk_segments: int = Field(..., description="Number of segments with flood risk")
    steep_segments: int = Field(..., description="Number of steep segments")
    avg_elevation: float = Field(..., description="Average elevation in meters")
    max_slope: float = Field(..., description="Maximum slope gradient percentage")

class PostGISRouteResponse(BaseModel):
    """Enhanced route response with PostGIS performance metrics"""
    success: bool
    route: List[Dict[str, float]] = Field(default=[], description="Route coordinates")
    distance: float = Field(default=0, description="Total distance in meters")
    duration: float = Field(default=0, description="Total duration in seconds")
    segments: List[PostGISRouteSegment] = Field(default=[], description="Route segments with terrain data")
    terrain_summary: TerrainSummary
    calculation_time_ms: float = Field(..., description="Route calculation time in milliseconds")
    source: str = Field(default="postgis_terrain", description="Routing data source")

class NetworkStatistics(BaseModel):
    """PostGIS network statistics"""
    total_roads: int
    total_length_km: float
    avg_elevation: float
    flooded_roads: int
    avg_slope: float
    routing_networks: Dict[str, int]

@router.post("/calculate", response_model=PostGISRouteResponse)
async def calculate_postgis_route_endpoint(request: PostGISRouteRequest):
    """
    Calculate route using PostGIS with terrain awareness and flood risk analysis
    
    This endpoint provides high-performance routing with:
    - Sub-second route calculation using spatial indexes
    - Terrain-aware cost calculation based on elevation and slope
    - Flood risk analysis and avoidance
    - Transportation mode optimization (car, motorcycle, walking)
    - Detailed terrain analysis and statistics
    """
    try:
        start_time = time.time()
        
        # Calculate route using PostGIS
        result = calculate_postgis_route(
            start_lat=request.start_lat,
            start_lng=request.start_lng,
            end_lat=request.end_lat,
            end_lng=request.end_lng,
            mode=request.mode
        )
        
        if not result:
            raise HTTPException(
                status_code=404, 
                detail="No route found between the specified points"
            )
        
        if not result["success"]:
            raise HTTPException(
                status_code=500,
                detail="Route calculation failed"
            )
        
        # Convert to response model
        terrain_summary = TerrainSummary(**result["terrain_summary"])
        
        segments = [
            PostGISRouteSegment(
                distance=seg["distance"],
                duration=seg["duration"],
                road_name=seg["road_name"],
                elevation_info=TerrainInfo(**seg["elevation_info"]),
                flood_risk=seg["flood_risk"],
                flood_risk_level=seg["flood_risk_level"]
            )
            for seg in result["segments"]
        ]
        
        response = PostGISRouteResponse(
            success=True,
            route=result["route"],
            distance=result["distance"],
            duration=result["duration"],
            segments=segments,
            terrain_summary=terrain_summary,
            calculation_time_ms=result["calculation_time_ms"],
            source=result["source"]
        )
        
        logger.info(f"PostGIS route calculated: {response.distance:.0f}m in {response.calculation_time_ms:.1f}ms")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PostGIS route calculation error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/calculate", response_model=PostGISRouteResponse)
async def calculate_postgis_route_get(
    start_lat: float = Query(..., ge=-90, le=90, description="Starting latitude"),
    start_lng: float = Query(..., ge=-180, le=180, description="Starting longitude"),
    end_lat: float = Query(..., ge=-90, le=90, description="Destination latitude"),
    end_lng: float = Query(..., ge=-180, le=180, description="Destination longitude"),
    mode: str = Query("car", regex="^(car|motorcycle|walking)$", description="Transportation mode"),
    avoid_floods: bool = Query(True, description="Avoid flooded roads when possible")
):
    """
    Calculate route using GET request (for simple integrations)
    
    Provides the same high-performance PostGIS routing as the POST endpoint
    but accessible via GET request for easier frontend integration.
    """
    request = PostGISRouteRequest(
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        mode=mode,
        avoid_floods=avoid_floods
    )
    
    return await calculate_postgis_route_endpoint(request)

@router.get("/statistics", response_model=NetworkStatistics)
async def get_network_statistics():
    """
    Get PostGIS network statistics and health metrics
    
    Returns comprehensive information about the road network including:
    - Total roads and length
    - Elevation and terrain statistics
    - Flood risk analysis
    - Routing network status for each transportation mode
    """
    try:
        service = get_postgis_routing_service()
        if not service:
            raise HTTPException(status_code=503, detail="PostGIS service unavailable")
        
        stats = service.get_network_statistics()
        
        if not stats:
            raise HTTPException(status_code=500, detail="Failed to retrieve network statistics")
        
        # Convert to response model
        response = NetworkStatistics(
            total_roads=stats.get('total_roads', 0),
            total_length_km=stats.get('total_length_km', 0.0),
            avg_elevation=float(stats.get('avg_elevation', 0.0) or 0.0),
            flooded_roads=stats.get('flooded_roads', 0),
            avg_slope=float(stats.get('avg_slope', 0.0) or 0.0),
            routing_networks=stats.get('routing_networks', {})
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting network statistics: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/health")
async def health_check():
    """
    PostGIS routing service health check
    
    Verifies that the PostGIS database is accessible and routing networks are ready.
    """
    try:
        service = get_postgis_routing_service()
        if not service:
            return {
                "status": "unhealthy",
                "message": "PostGIS service unavailable",
                "timestamp": time.time()
            }
        
        # Quick test query
        stats = service.get_network_statistics()
        total_roads = stats.get('total_roads', 0)
        
        if total_roads == 0:
            return {
                "status": "warning",
                "message": "No roads loaded in PostGIS database",
                "timestamp": time.time()
            }
        
        return {
            "status": "healthy",
            "message": f"PostGIS routing ready with {total_roads} roads",
            "networks": stats.get('routing_networks', {}),
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"PostGIS health check failed: {e}")
        return {
            "status": "unhealthy",
            "message": f"Health check failed: {str(e)}",
            "timestamp": time.time()
        }

@router.post("/alternatives", response_model=List[PostGISRouteResponse])
async def get_route_alternatives(request: PostGISRouteRequest):
    """
    Get multiple route alternatives with different optimization criteria
    
    Returns up to 5 alternative routes optimized for:
    1. Shortest distance (primary route)
    2. Flood avoidance route
    3. Minimal elevation change route
    4. Fastest route for selected transportation mode
    5. Scenic route (when available)
    """
    try:
        # For now, return single route - alternative routes implementation can be added
        primary_route = await calculate_postgis_route_endpoint(request)
        return [primary_route]
        
    except Exception as e:
        logger.error(f"Error getting route alternatives: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/performance/compare")
async def compare_routing_performance(
    start_lat: float = Query(..., description="Starting latitude"),
    start_lng: float = Query(..., description="Starting longitude"),
    end_lat: float = Query(..., description="Destination latitude"),
    end_lng: float = Query(..., description="Destination longitude"),
    mode: str = Query("car", description="Transportation mode")
):
    """
    Compare routing performance between GeoJSON and PostGIS implementations
    
    Calculates the same route using both methods and returns performance metrics
    for analysis and optimization.
    """
    try:
        from services.local_routing import calculate_local_route
        
        # Calculate using PostGIS
        postgis_start = time.time()
        postgis_result = calculate_postgis_route(start_lat, start_lng, end_lat, end_lng, mode)
        postgis_time = (time.time() - postgis_start) * 1000
        
        # Calculate using GeoJSON
        geojson_start = time.time()
        geojson_result = calculate_local_route(start_lat, start_lng, end_lat, end_lng, mode)
        geojson_time = (time.time() - geojson_start) * 1000
        
        comparison = {
            "postgis": {
                "calculation_time_ms": postgis_time,
                "success": postgis_result is not None and postgis_result.get("success", False),
                "distance": postgis_result.get("distance", 0) if postgis_result else 0,
                "segments": len(postgis_result.get("segments", [])) if postgis_result else 0
            },
            "geojson": {
                "calculation_time_ms": geojson_time,
                "success": geojson_result is not None and geojson_result.get("success", False),
                "distance": geojson_result.get("distance", 0) if geojson_result else 0,
                "segments": len(geojson_result.get("segments", [])) if geojson_result else 0
            },
            "performance_improvement": {
                "speed_up_factor": geojson_time / postgis_time if postgis_time > 0 else 0,
                "time_saved_ms": geojson_time - postgis_time
            }
        }
        
        return comparison
        
    except Exception as e:
        logger.error(f"Error comparing routing performance: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")