"""
Simplified PostgreSQL routing API endpoints
Alternative to PostGIS for terrain-aware routing
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime

from services.simple_routing import simple_routing_service, RouteRequest, RouteResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/routing", tags=["Simple Routing"])

class SimpleRouteRequest(BaseModel):
    start_lat: float = Field(..., ge=-90, le=90, description="Starting latitude")
    start_lng: float = Field(..., ge=-180, le=180, description="Starting longitude") 
    end_lat: float = Field(..., ge=-90, le=90, description="Destination latitude")
    end_lng: float = Field(..., ge=-180, le=180, description="Destination longitude")
    vehicle_type: str = Field("car", description="Vehicle type: car, motorcycle, walking")
    avoid_floods: bool = Field(True, description="Avoid flooded roads")
    max_slope: Optional[float] = Field(None, description="Maximum slope percentage")

class SimpleRouteResponse(BaseModel):
    route: List[List[float]] = Field(..., description="Route coordinates [[lat, lng], ...]")
    distance_km: float = Field(..., description="Total distance in kilometers")
    estimated_time_minutes: float = Field(..., description="Estimated travel time in minutes")
    terrain_info: Dict[str, Any] = Field(..., description="Terrain analysis")
    calculation_time_ms: float = Field(..., description="Route calculation time in milliseconds")
    routing_method: str = Field("simplified_postgresql", description="Routing method used")

class RoutingHealthResponse(BaseModel):
    status: str
    database: str
    road_segments: int
    network_loaded: bool
    network_nodes: int
    message: Optional[str] = None

@router.post("/simple/route", response_model=SimpleRouteResponse)
async def calculate_simple_route(request: SimpleRouteRequest):
    """
    Calculate route using simplified PostgreSQL routing
    
    Fast database-based routing without PostGIS extensions.
    Provides terrain-aware routing with flood and slope considerations.
    """
    try:
        start_time = datetime.now()
        
        # Convert to internal request format
        route_request = RouteRequest(
            start_lat=request.start_lat,
            start_lng=request.start_lng,
            end_lat=request.end_lat,
            end_lng=request.end_lng,
            vehicle_type=request.vehicle_type,
            avoid_floods=request.avoid_floods,
            max_slope=request.max_slope
        )
        
        # Calculate route
        route_response = simple_routing_service.find_route(route_request)
        
        if not route_response:
            raise HTTPException(
                status_code=404,
                detail="No route found between the specified points"
            )
        
        return SimpleRouteResponse(
            route=route_response.route,
            distance_km=route_response.distance_km,
            estimated_time_minutes=route_response.estimated_time_minutes,
            terrain_info=route_response.terrain_info,
            calculation_time_ms=route_response.calculation_time_ms,
            routing_method="simplified_postgresql"
        )
        
    except Exception as e:
        logger.error(f"Simple routing failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Routing calculation failed: {str(e)}"
        )

@router.get("/simple/route", response_model=SimpleRouteResponse)
async def get_simple_route(
    start_lat: float,
    start_lng: float, 
    end_lat: float,
    end_lng: float,
    vehicle_type: str = "car",
    avoid_floods: bool = True,
    max_slope: Optional[float] = None
):
    """
    Calculate route using GET parameters (for easy testing)
    """
    request = SimpleRouteRequest(
        start_lat=start_lat,
        start_lng=start_lng,
        end_lat=end_lat,
        end_lng=end_lng,
        vehicle_type=vehicle_type,
        avoid_floods=avoid_floods,
        max_slope=max_slope
    )
    
    return await calculate_simple_route(request)

@router.get("/simple/health", response_model=RoutingHealthResponse)
async def get_simple_routing_health():
    """
    Check simplified routing service health
    """
    try:
        health_data = simple_routing_service.get_health_status()
        
        return RoutingHealthResponse(
            status=health_data['status'],
            database=health_data.get('database', 'unknown'),
            road_segments=health_data.get('road_segments', 0),
            network_loaded=health_data.get('network_loaded', False),
            network_nodes=health_data.get('network_nodes', 0),
            message=health_data.get('message')
        )
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return RoutingHealthResponse(
            status="error",
            database="unknown", 
            road_segments=0,
            network_loaded=False,
            network_nodes=0,
            message=str(e)
        )

@router.post("/simple/preload")
async def preload_simple_network():
    """
    Preload road network into memory for faster routing
    """
    try:
        start_time = datetime.now()
        
        success = simple_routing_service.load_road_network()
        
        load_time = (datetime.now() - start_time).total_seconds() * 1000
        
        if success:
            return {
                "status": "success",
                "message": "Road network loaded successfully",
                "load_time_ms": load_time,
                "nodes_loaded": len(simple_routing_service._road_network)
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to load road network"
            )
            
    except Exception as e:
        logger.error(f"Network preload failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Network preload failed: {str(e)}"
        )

@router.get("/simple/stats")
async def get_simple_routing_stats():
    """
    Get routing statistics and performance metrics
    """
    try:
        health_data = simple_routing_service.get_health_status()
        
        stats = {
            "service_type": "simplified_postgresql",
            "database_status": health_data.get('database', 'unknown'),
            "total_road_segments": health_data.get('road_segments', 0),
            "network_loaded": health_data.get('network_loaded', False),
            "network_nodes": health_data.get('network_nodes', 0),
            "performance": {
                "expected_calculation_time": "50-500ms",
                "database_type": "PostgreSQL (without PostGIS)",
                "algorithm": "Dijkstra with terrain costs"
            }
        }
        
        return stats
        
    except Exception as e:
        logger.error(f"Stats retrieval failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get stats: {str(e)}"
        )