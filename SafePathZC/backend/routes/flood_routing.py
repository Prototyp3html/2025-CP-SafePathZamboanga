"""
Flood-aware routing endpoint that generates 3 distinct routes based on flood risk analysis.

DATA SOURCES:
- OSRM (localhost:5000): Uses zcroadmap.geojson for accurate road routing with proper hierarchy
- terrain_roads.geojson: Provides flood risk data for each road segment
- Weather data: Real-time precipitation and wind for dynamic risk assessment

ROUTE CATEGORIES:
- Safe (Green): Lowest flood percentage - prioritizes flood-free roads
- Manageable (Orange): Moderate flood percentage - balanced approach
- Flood-Prone (Red): Higher flood percentage - typically shortest/fastest route
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Tuple
import httpx
import logging
from services.local_routing import analyze_route_flood_risk, get_routing_service, Coordinate
from services.transportation_modes import (
    TRANSPORTATION_MODES, 
    get_osrm_endpoint_for_mode, 
    adjust_route_for_transportation_mode,
    get_flood_safety_for_mode
)
import math

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/routing", tags=["flood-routing"])

class FloodRouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    waypoints: Optional[List[Dict[str, float]]] = None  # List of {lat, lng} dicts
    weather_data: Optional[Dict[str, Any]] = None
    transport_mode: str = "car"  # car, motorcycle, walking, public_transport, bicycle, truck

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
        
        # Build OSRM waypoint coordinates if waypoints provided
        waypoint_coords = []
        if request.waypoints and len(request.waypoints) > 0:
            logger.info(f"Including {len(request.waypoints)} waypoints in routing")
            waypoint_coords = [(wp['lng'], wp['lat']) for wp in request.waypoints]
        
        # Strategy 1: Try to get OSRM alternatives (or route through waypoints)
        logger.info("Strategy 1: Requesting OSRM routing...")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Build coordinate string: start;waypoint1;waypoint2;...;end
                coords_list = [(request.start_lng, request.start_lat)]
                coords_list.extend(waypoint_coords)  # Add user waypoints
                coords_list.append((request.end_lng, request.end_lat))
                
                coords_str = ";".join([f"{lng},{lat}" for lng, lat in coords_list])
                
                # Use transportation mode-specific OSRM endpoint
                osrm_base = get_osrm_endpoint_for_mode(request.transport_mode)
                osrm_url = f"{osrm_base}/{coords_str}"
                params = {
                    "overview": "full",
                    "geometries": "geojson",
                    "alternatives": "true" if not waypoint_coords else "false",  # OSRM doesn't support alternatives with waypoints
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
                                
                                # Apply transportation mode adjustments
                                route_info = {
                                    "geometry": geometry,
                                    "distance": route_data.get("distance", 0),
                                    "duration": route_data.get("duration", 0),
                                    "flood_percentage": flood_analysis["flooded_percentage"],
                                    "flooded_distance": flood_analysis["flooded_distance_m"],
                                    "risk_level": flood_analysis["risk_level"],
                                    "weather_impact": flood_analysis.get("weather_impact", "none")
                                }
                                
                                # Adjust for transportation mode
                                route_info = adjust_route_for_transportation_mode(route_info, request.transport_mode)
                                
                                all_routes.append(route_info)
        except Exception as e:
            logger.warning(f"OSRM alternatives failed: {e}")
        
        # Strategy 2: Generate waypoint routes with perpendicular offsets
        if len(all_routes) < 3:
            logger.info("Strategy 2: Generating waypoint routes...")
            
            # Smaller offset factors to avoid dead-end segments (reduced from 8%, 15% to 4%, 6%)
            offset_factors = [0.04, -0.04, 0.06, -0.06]  # 4%, -4%, 6%, -6% offsets
            
            # Calculate baseline distance for validation (direct route distance)
            baseline_distance = all_routes[0]["distance"] if len(all_routes) > 0 else distance * 111000  # Convert degrees to meters
            
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
                        # Build coordinate list: start;offset_waypoint;user_waypoints;end
                        coords_list = [(request.start_lng, request.start_lat)]
                        coords_list.append((waypoint_lng, waypoint_lat))  # Add offset waypoint
                        coords_list.extend(waypoint_coords)  # Add user waypoints
                        coords_list.append((request.end_lng, request.end_lat))
                        
                        coords_str = ";".join([f"{lng},{lat}" for lng, lat in coords_list])
                        
                        # Use transportation mode-specific OSRM endpoint
                        osrm_base = get_osrm_endpoint_for_mode(request.transport_mode)
                        osrm_url = f"{osrm_base}/{coords_str}"
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
                                route_distance = route_data.get("distance", 0)
                                
                                # Validate: Skip routes that are too much longer than baseline (>50% longer)
                                # This filters out routes with dead-end segments or unreasonable detours
                                if baseline_distance > 0 and route_distance > baseline_distance * 1.5:
                                    logger.info(f"Skipping waypoint route with offset {offset_factor}: too long ({route_distance:.0f}m vs baseline {baseline_distance:.0f}m)")
                                    continue
                                
                                if coordinates:
                                    # Analyze flood risk
                                    flood_analysis = analyze_route_flood_risk(
                                        coordinates,
                                        buffer_meters=50.0,
                                        weather_data=request.weather_data
                                    )
                                    
                                    # Apply transportation mode adjustments
                                    route_info = {
                                        "geometry": geometry,
                                        "distance": route_distance,
                                        "duration": route_data.get("duration", 0),
                                        "flood_percentage": flood_analysis["flooded_percentage"],
                                        "flooded_distance": flood_analysis["flooded_distance_m"],
                                        "risk_level": flood_analysis["risk_level"],
                                        "weather_impact": flood_analysis.get("weather_impact", "none")
                                    }
                                    
                                    # Adjust for transportation mode
                                    route_info = adjust_route_for_transportation_mode(route_info, request.transport_mode)
                                    
                                    all_routes.append(route_info)
                                    logger.info(f"✓ Added waypoint route with offset {offset_factor}: {route_distance:.0f}m")
                except Exception as e:
                    logger.warning(f"Waypoint route with offset {offset_factor} failed: {e}")
        
        # Check if we have enough routes
        if len(all_routes) == 0:
            raise HTTPException(status_code=500, detail="Could not generate any routes")
        
        logger.info(f"Generated {len(all_routes)} candidate routes. Selecting 3 distinct routes based on flood risk...")
        
        # Sort all routes by flood percentage (ascending - safest first)
        all_routes.sort(key=lambda r: r["flood_percentage"])
        
        # Log all candidate routes for debugging
        for i, route in enumerate(all_routes):
            logger.info(f"  Candidate {i+1}: {route['flood_percentage']:.1f}% flooded, {route['distance']:.0f}m, {route['duration']:.0f}s, risk={route['risk_level']}")
        
        # Strategy 3: Select 3 DISTINCT routes based on flood risk categories
        # Goal: Ensure green=safe, orange=moderate, red=high risk
        
        selected_routes = []
        used_indices = set()
        
        # SAFE ROUTE (Green): Find the route with LOWEST flood percentage
        safe_idx = 0
        safe_route = all_routes[safe_idx]
        selected_routes.append({
            **safe_route,
            "label": "safe",
            "color": "#22c55e",  # Green
            "description": f"Safe route: {safe_route['flood_percentage']:.1f}% flood risk"
        })
        used_indices.add(safe_idx)
        logger.info(f"✓ Selected SAFE route (index {safe_idx}): {safe_route['flood_percentage']:.1f}% flooded, {safe_route['distance']:.0f}m")
        
        # FLOOD-PRONE ROUTE (Red): Find the route with HIGHEST flood percentage OR shortest distance
        # Priority 1: Route with highest flood % that's significantly different from safe route
        flood_prone_idx = len(all_routes) - 1
        flood_prone_route = all_routes[flood_prone_idx]
        
        # Check if there's meaningful difference in flood risk
        flood_diff = flood_prone_route['flood_percentage'] - safe_route['flood_percentage']
        
        if flood_diff < 5.0 and len(all_routes) > 1:
            # All routes have similar flood %, so pick the shortest distance route as flood-prone
            shortest_idx = min(
                range(len(all_routes)), 
                key=lambda i: all_routes[i]["distance"] if i not in used_indices else float('inf')
            )
            if shortest_idx != safe_idx:
                flood_prone_idx = shortest_idx
                flood_prone_route = all_routes[flood_prone_idx]
        
        selected_routes.append({
            **flood_prone_route,
            "label": "flood-prone",
            "color": "#ef4444",  # Red
            "description": f"Flood-prone route: {flood_prone_route['flood_percentage']:.1f}% flood risk"
        })
        used_indices.add(flood_prone_idx)
        logger.info(f"✓ Selected FLOOD-PRONE route (index {flood_prone_idx}): {flood_prone_route['flood_percentage']:.1f}% flooded, {flood_prone_route['distance']:.0f}m")
        
        # MANAGEABLE ROUTE (Orange): Find a route in the MIDDLE range
        # Look for a route with moderate flood risk between safe and flood-prone
        manageable_route = None
        manageable_idx = None
        
        if len(all_routes) >= 3:
            # Calculate target flood percentage (midpoint between safe and flood-prone)
            target_flood_pct = (safe_route['flood_percentage'] + flood_prone_route['flood_percentage']) / 2
            
            # Find the route closest to the target percentage that hasn't been used
            best_diff = float('inf')
            for i, route in enumerate(all_routes):
                if i in used_indices:
                    continue
                
                diff = abs(route['flood_percentage'] - target_flood_pct)
                if diff < best_diff:
                    best_diff = diff
                    manageable_route = route
                    manageable_idx = i
        
        # Fallback: use middle index if no good candidate found
        if manageable_route is None:
            mid_idx = len(all_routes) // 2
            if mid_idx not in used_indices:
                manageable_idx = mid_idx
                manageable_route = all_routes[mid_idx]
            elif len(all_routes) > 1:
                # Find any unused route
                for i, route in enumerate(all_routes):
                    if i not in used_indices:
                        manageable_idx = i
                        manageable_route = route
                        break
        
        # Final fallback: duplicate safe route if still no manageable found
        if manageable_route is None:
            manageable_route = safe_route
            manageable_idx = safe_idx
        
        selected_routes.insert(1, {  # Insert in middle position (safe, manageable, flood-prone)
            **manageable_route,
            "label": "manageable",
            "color": "#f97316",  # Orange
            "description": f"Manageable route: {manageable_route['flood_percentage']:.1f}% flood risk"
        })
        logger.info(f"✓ Selected MANAGEABLE route (index {manageable_idx}): {manageable_route['flood_percentage']:.1f}% flooded, {manageable_route['distance']:.0f}m")
        
        # If we only have 1 or 2 unique routes, the duplicates will be marked but still shown
        if len(all_routes) == 1:
            logger.warning("⚠ Only 1 unique route generated - showing same route 3 times with different risk labels")
        elif len(all_routes) == 2:
            logger.warning("⚠ Only 2 unique routes generated - duplicating one route")
        
        # Reorder to ensure: [safe=green, manageable=orange, flood-prone=red]
        final_routes = [
            selected_routes[0],  # Safe (green)
            selected_routes[1],  # Manageable (orange)
            selected_routes[2],  # Flood-prone (red)
        ]
        
        # Summary log with colored indicators
        logger.info(f"✓ Final routes selected from {len(all_routes)} candidates:")
        logger.info(f"  🟢 Safe:        {final_routes[0]['flood_percentage']:5.1f}% flooded, {final_routes[0]['distance']:7.0f}m, {final_routes[0]['duration']:5.0f}s")
        logger.info(f"  🟠 Manageable:  {final_routes[1]['flood_percentage']:5.1f}% flooded, {final_routes[1]['distance']:7.0f}m, {final_routes[1]['duration']:5.0f}s")
        logger.info(f"  🔴 Flood-prone: {final_routes[2]['flood_percentage']:5.1f}% flooded, {final_routes[2]['distance']:7.0f}m, {final_routes[2]['duration']:5.0f}s")
        
        return FloodRouteResponse(
            routes=selected_routes,
            message=f"Successfully generated {len(selected_routes)} flood-aware routes"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating flood-aware routes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")