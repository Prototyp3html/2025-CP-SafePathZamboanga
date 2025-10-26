"""
Flood-aware routing endpoint that generates 3 distinct routes based on flood risk analysis.
Uses OSRM for routing + terrain_roads.geojson for flood data.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple
import httpx
import logging
from services.local_routing import analyze_route_flood_risk, get_routing_service, Coordinate
import math

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/routing", tags=["flood-routing"])

class FloodRouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    weather_data: Optional[Dict[str, Any]] = None

class FloodRouteResponse(BaseModel):
    routes: List[Dict[str, Any]]
    message: str

@router.post("/flood-routes", response_model=FloodRouteResponse)
async def get_flood_aware_routes(request: FloodRouteRequest):
    """
    Generate 3 distinct routes with different flood risk profiles:
    - Safest: Lowest flood exposure (avoids flooded roads heavily)
    - Balanced: Moderate flood exposure (balance between distance and flood risk)
    - Direct: Shortest distance (minimal flood avoidance)
    
    Uses OSRM for base routing + terrain_roads.geojson for flood analysis.
    """
    try:
        logger.info(f"Flood-aware routing: ({request.start_lat}, {request.start_lng}) -> ({request.end_lat}, {request.end_lng})")
        
        start_coord = Coordinate(lat=request.start_lat, lng=request.start_lng)
        end_coord = Coordinate(lat=request.end_lat, lng=request.end_lng)
        
        # Calculate perpendicular offset direction
        dx = request.end_lng - request.start_lng
        dy = request.end_lat - request.start_lat
        distance = math.sqrt(dx**2 + dy**2)
        
        # Perpendicular vector (rotate 90 degrees)
        perp_x = -dy / distance if distance > 0 else 0
        perp_y = dx / distance if distance > 0 else 0
        
        all_routes = []
        
        # Strategy 1: Try to get OSRM alternatives
        logger.info("Strategy 1: Requesting OSRM alternatives...")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                osrm_url = f"http://localhost:5000/route/v1/driving/{request.start_lng},{request.start_lat};{request.end_lng},{request.end_lat}"
                params = {
                    "overview": "full",
                    "geometries": "geojson",
                    "alternatives": "true",
                    "steps": "false"
                }
                
                response = await client.get(osrm_url, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if "routes" in data and len(data["routes"]) > 0:
                        logger.info(f"Got {len(data['routes'])} routes from OSRM")
                        
                        for route_data in data["routes"]:
                            geometry = route_data.get("geometry", {})
                            coordinates = geometry.get("coordinates", [])
                            
                            if coordinates:
                                # Analyze flood risk
                                flood_analysis = analyze_route_flood_risk(
                                    coordinates,
                                    buffer_meters=50.0,
                                    weather_data=request.weather_data
                                )
                                
                                all_routes.append({
                                    "geometry": geometry,
                                    "distance": route_data.get("distance", 0),
                                    "duration": route_data.get("duration", 0),
                                    "flood_percentage": flood_analysis["flooded_percentage"],
                                    "flooded_distance": flood_analysis["flooded_distance_m"],
                                    "risk_level": flood_analysis["risk_level"],
                                    "weather_impact": flood_analysis.get("weather_impact", "none")
                                })
        except Exception as e:
            logger.warning(f"OSRM alternatives failed: {e}")
        
        # Strategy 2: Generate waypoint routes with perpendicular offsets
        if len(all_routes) < 3:
            logger.info("Strategy 2: Generating waypoint routes...")
            
            offset_factors = [0.08, -0.08, 0.15, -0.15]  # 8%, -8%, 15%, -15% offsets
            
            for offset_factor in offset_factors:
                if len(all_routes) >= 5:  # Limit total routes
                    break
                
                try:
                    # Create waypoint with perpendicular offset
                    mid_lat = (request.start_lat + request.end_lat) / 2
                    mid_lng = (request.start_lng + request.end_lng) / 2
                    
                    waypoint_lat = mid_lat + perp_y * distance * offset_factor
                    waypoint_lng = mid_lng + perp_x * distance * offset_factor
                    
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        osrm_url = f"http://localhost:5000/route/v1/driving/{request.start_lng},{request.start_lat};{waypoint_lng},{waypoint_lat};{request.end_lng},{request.end_lat}"
                        params = {
                            "overview": "full",
                            "geometries": "geojson",
                            "steps": "false"
                        }
                        
                        response = await client.get(osrm_url, params=params)
                        
                        if response.status_code == 200:
                            data = response.json()
                            
                            if "routes" in data and len(data["routes"]) > 0:
                                route_data = data["routes"][0]
                                geometry = route_data.get("geometry", {})
                                coordinates = geometry.get("coordinates", [])
                                
                                if coordinates:
                                    # Analyze flood risk
                                    flood_analysis = analyze_route_flood_risk(
                                        coordinates,
                                        buffer_meters=50.0,
                                        weather_data=request.weather_data
                                    )
                                    
                                    all_routes.append({
                                        "geometry": geometry,
                                        "distance": route_data.get("distance", 0),
                                        "duration": route_data.get("duration", 0),
                                        "flood_percentage": flood_analysis["flooded_percentage"],
                                        "flooded_distance": flood_analysis["flooded_distance_m"],
                                        "risk_level": flood_analysis["risk_level"],
                                        "weather_impact": flood_analysis.get("weather_impact", "none")
                                    })
                except Exception as e:
                    logger.warning(f"Waypoint route with offset {offset_factor} failed: {e}")
        
        # Strategy 3: Sort by flood percentage and select diverse routes
        if len(all_routes) == 0:
            raise HTTPException(status_code=500, detail="Could not generate any routes")
        
        # Sort by flood percentage (ascending - safest first)
        all_routes.sort(key=lambda r: r["flood_percentage"])
        
        logger.info(f"Generated {len(all_routes)} candidate routes, selecting 3 distinct ones...")
        
        # Select 3 distinct routes:
        # 1. Safest (lowest flood %)
        # 2. Balanced (middle route)
        # 3. Direct (shortest distance OR highest flood % if distinct)
        
        selected_routes = []
        
        # Safest route (lowest flood %)
        safest = all_routes[0]
        selected_routes.append({
            **safest,
            "label": "safest",
            "color": "#22c55e",  # Green
            "description": f"Safest route: {safest['flood_percentage']:.1f}% flooded"
        })
        
        # Balanced route (middle)
        if len(all_routes) >= 2:
            mid_idx = len(all_routes) // 2
            balanced = all_routes[mid_idx]
            selected_routes.append({
                **balanced,
                "label": "balanced",
                "color": "#f97316",  # Orange
                "description": f"Balanced route: {balanced['flood_percentage']:.1f}% flooded"
            })
        
        # Direct route (shortest distance OR last in flood-sorted list)
        if len(all_routes) >= 3:
            # Find shortest distance route
            shortest = min(all_routes, key=lambda r: r["distance"])
            
            # Check if shortest is different from safest
            if abs(shortest["distance"] - safest["distance"]) > 100:  # At least 100m difference
                direct = shortest
            else:
                # Use highest flood % route instead
                direct = all_routes[-1]
            
            selected_routes.append({
                **direct,
                "label": "direct",
                "color": "#ef4444",  # Red
                "description": f"Direct route: {direct['flood_percentage']:.1f}% flooded"
            })
        
        # If only 1-2 routes, duplicate the safest route
        while len(selected_routes) < 3:
            selected_routes.append({
                **safest,
                "label": ["balanced", "direct"][len(selected_routes) - 1],
                "color": ["#f97316", "#ef4444"][len(selected_routes) - 1],
                "description": f"Route: {safest['flood_percentage']:.1f}% flooded"
            })
        
        logger.info(f"Selected routes - Safe: {selected_routes[0]['flood_percentage']:.1f}%, Balanced: {selected_routes[1]['flood_percentage']:.1f}%, Direct: {selected_routes[2]['flood_percentage']:.1f}%")
        
        return FloodRouteResponse(
            routes=selected_routes,
            message=f"Successfully generated {len(selected_routes)} flood-aware routes"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating flood-aware routes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")
