"""
Local routing API endpoints using GeoJSON road network data
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
from services.local_routing import calculate_local_route, get_routing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/routing", tags=["Local Routing"])

class RouteRequest(BaseModel):
    """Request model for route calculation"""
    start_lat: float = Field(..., description="Starting latitude")
    start_lng: float = Field(..., description="Starting longitude") 
    end_lat: float = Field(..., description="Ending latitude")
    end_lng: float = Field(..., description="Ending longitude")
    mode: str = Field("car", description="Transportation mode: car, motorcycle, or walking")

class RoutePoint(BaseModel):
    """A point in a route"""
    lat: float
    lng: float

class RouteSegment(BaseModel):
    """Information about a route segment"""
    distance: float = Field(..., description="Distance in meters")
    duration: float = Field(..., description="Duration in seconds")
    road_name: str = Field(..., description="Name of the road")
    speed_limit: int = Field(..., description="Speed limit in km/h")
    elevation_info: Optional[Dict[str, float]] = Field(None, description="Elevation information")
    flood_risk: bool = Field(False, description="Whether this segment has flood risk")

class RouteResponse(BaseModel):
    """Response model for route calculation"""
    success: bool
    route: List[RoutePoint]
    distance: float = Field(..., description="Total distance in meters")
    duration: float = Field(..., description="Total duration in seconds")
    segments: List[RouteSegment]
    terrain_summary: Optional[Dict[str, Any]] = Field(None, description="Summary of terrain factors")
    source: str = Field(default="local_geojson")
    message: Optional[str] = None

class NearestRoadRequest(BaseModel):
    """Request model for finding nearest road"""
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")
    max_distance: Optional[float] = Field(500, description="Maximum search distance in meters")

class NearestRoadResponse(BaseModel):
    """Response model for nearest road search"""
    success: bool
    nearest_point: Optional[RoutePoint] = None
    distance: Optional[float] = Field(None, description="Distance to nearest road in meters")
    message: Optional[str] = None

@router.post("/calculate", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    """
    Calculate route using local GeoJSON road network
    
    This endpoint uses the filtered Zamboanga City road network from QGIS
    to provide precise, locally-accurate routing.
    """
    try:
        logger.info(f"Calculating local route from ({request.start_lat}, {request.start_lng}) "
                   f"to ({request.end_lat}, {request.end_lng})")
        
        result = calculate_local_route(
            request.start_lat, request.start_lng,
            request.end_lat, request.end_lng,
            request.mode
        )
        
        if result:
            return RouteResponse(
                success=True,
                route=[RoutePoint(**point) for point in result["route"]],
                distance=result["distance"],
                duration=result["duration"],
                segments=[RouteSegment(**seg) for seg in result["segments"]],
                terrain_summary=result.get("terrain_summary"),
                source=result["source"],
                message=f"Route calculated with {len(result['route'])} waypoints"
            )
        else:
            return RouteResponse(
                success=False,
                route=[],
                distance=0,
                duration=0,
                segments=[],
                message="No route found using local road network"
            )
            
    except Exception as e:
        logger.error(f"Error calculating route: {e}")
        raise HTTPException(status_code=500, detail=f"Error calculating route: {str(e)}")

@router.get("/calculate", response_model=RouteResponse)
async def calculate_route_get(
    start_lat: float = Query(..., description="Starting latitude"),
    start_lng: float = Query(..., description="Starting longitude"),
    end_lat: float = Query(..., description="Ending latitude"),
    end_lng: float = Query(..., description="Ending longitude"),
    mode: str = Query("car", description="Transportation mode: car, motorcycle, or walking")
):
    """
    Calculate route using GET method (for easy testing)
    """
    request = RouteRequest(
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        mode=mode
    )
    return await calculate_route(request)

@router.post("/nearest-road", response_model=NearestRoadResponse)
async def find_nearest_road(request: NearestRoadRequest):
    """
    Find the nearest point on the road network
    
    Useful for snapping coordinates to actual roads
    """
    try:
        from services.local_routing import Coordinate
        
        service = get_routing_service()
        target = Coordinate(lat=request.lat, lng=request.lng)
        
        nearest = service.find_nearest_road_point(target, request.max_distance)
        
        if nearest:
            distance = target.distance_to(nearest)
            return NearestRoadResponse(
                success=True,
                nearest_point=RoutePoint(lat=nearest.lat, lng=nearest.lng),
                distance=distance,
                message=f"Found nearest road {distance:.1f}m away"
            )
        else:
            return NearestRoadResponse(
                success=False,
                message=f"No road found within {request.max_distance}m"
            )
            
    except Exception as e:
        logger.error(f"Error finding nearest road: {e}")
        raise HTTPException(status_code=500, detail=f"Error finding nearest road: {str(e)}")

@router.get("/network-info")
async def get_network_info():
    """
    Get information about the loaded road network
    """
    try:
        service = get_routing_service()
        
        if not service.loaded:
            return {"loaded": False, "message": "Road network not loaded"}
        
        # Count different road types
        road_types = {}
        total_length = 0
        
        for segment in service.road_segments:
            highway_type = segment.highway_type or "unknown"
            if highway_type not in road_types:
                road_types[highway_type] = {"count": 0, "length": 0}
            
            road_types[highway_type]["count"] += 1
            segment_length = segment.get_length()
            road_types[highway_type]["length"] += segment_length
            total_length += segment_length
        
        return {
            "loaded": True,
            "total_segments": len(service.road_segments),
            "total_nodes": len(service.routing_graph),
            "total_length_km": round(total_length / 1000, 2),
            "road_types": road_types,
            "geojson_path": service.geojson_path
        }
        
    except Exception as e:
        logger.error(f"Error getting network info: {e}")
        raise HTTPException(status_code=500, detail=f"Error getting network info: {str(e)}")

@router.post("/reload")
async def reload_network():
    """
    Reload the road network from GeoJSON file
    """
    try:
        service = get_routing_service()
        success = service.load_road_network()
        
        if success:
            return {"success": True, "message": "Road network reloaded successfully"}
        else:
            return {"success": False, "message": "Failed to reload road network"}
            
    except Exception as e:
        logger.error(f"Error reloading network: {e}")
        raise HTTPException(status_code=500, detail=f"Error reloading network: {str(e)}")

@router.get("/health")
async def health_check():
    """
    Check if the local routing service is healthy
    """
    try:
        service = get_routing_service()
        return {
            "healthy": service.loaded,
            "segments_loaded": len(service.road_segments),
            "nodes_created": len(service.routing_graph)
        }
    except Exception as e:
        return {"healthy": False, "error": str(e)}