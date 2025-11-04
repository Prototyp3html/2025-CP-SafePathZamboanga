from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import List, Optional, Tuple, Dict
import os
import requests
import httpx  # Added for async HTTP requests
import math
import json
import time
import asyncio
import logging
from dotenv import load_dotenv
from services.local_routing import get_routing_service, get_flood_service, Coordinate

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import models
from models import Base, RouteHistory, FavoriteRoute, SearchHistory, AdminUser, Report, User

# Import admin routes
from routes.admin import router as admin_router, init_admin_user
from routes.user_auth import router as user_auth_router, init_demo_user
from routes.forum import router as forum_router
from routes.flood_routing import router as flood_routing_router
from routes.geocoding import router as geocoding_router

# Load environment variables
load_dotenv()

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://safepathzc_user:safepath123@localhost:5432/safepathzc")

try:
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    print("Database connected successfully")
except Exception as e:
    print(f"Database connection error: {e}")
    # For development, you might want to continue without DB
    # For production, you might want to exit
    pass

# Pydantic models for API

# Pydantic models for API
class RouteHistoryCreate(BaseModel):
    from_location: str
    to_location: str
    from_lat: Optional[float] = None
    from_lng: Optional[float] = None
    to_lat: Optional[float] = None
    to_lng: Optional[float] = None
    duration: str
    distance: str
    status: str = "completed"
    weather_condition: Optional[str] = None
    route_type: str = "safe"
    waypoints: Optional[str] = None

class RouteHistoryResponse(BaseModel):
    id: int
    from_location: str
    to_location: str
    from_lat: Optional[float]
    from_lng: Optional[float]
    to_lat: Optional[float]
    to_lng: Optional[float]
    date: datetime
    duration: str
    distance: str
    status: str
    weather_condition: Optional[str]
    route_type: str
    
    class Config:
        from_attributes = True

class FavoriteRouteCreate(BaseModel):
    name: str
    from_location: str
    to_location: str
    from_lat: Optional[float] = None
    from_lng: Optional[float] = None
    to_lat: Optional[float] = None
    to_lng: Optional[float] = None
    frequency: str = "Weekly"
    avg_duration: str
    risk_level: str = "low"

class FavoriteRouteResponse(BaseModel):
    id: int
    name: str
    from_location: str
    to_location: str
    from_lat: Optional[float]
    from_lng: Optional[float]
    to_lat: Optional[float]
    to_lng: Optional[float]
    frequency: str
    avg_duration: str
    last_used: datetime
    risk_level: str
    
    class Config:
        from_attributes = True

class SearchHistoryCreate(BaseModel):
    query: str
    results_count: int = 0

class SearchHistoryResponse(BaseModel):
    id: int
    query: str
    timestamp: datetime
    results_count: int
    
    class Config:
        from_attributes = True

# New Pydantic models for routing and elevation endpoints
class RouteRequest(BaseModel):
    start: List[float]  # [lat, lon]
    end: List[float]    # [lat, lon]

class RouteResponse(BaseModel):
    route: dict  # GeoJSON LineString
    distance: float  # in kilometers
    duration: float  # in seconds
    waypoints: List[List[float]]  # array of [lat, lon] coordinates

class LocalRouteRequest(BaseModel):
    start: List[float]  # [lat, lng]
    end: List[float]    # [lat, lng]

class LocalRouteResponse(BaseModel):
    success: bool
    routes: List[Dict] = Field(..., description="List of calculated routes (direct, balanced, safest)")
    message: str
    snapped_waypoints: Optional[List[List[float]]] = None

class CoordinatePoint(BaseModel):
    lat: float
    lon: float

class ElevationRequest(BaseModel):
    points: List[CoordinatePoint]

class ElevationPoint(BaseModel):
    lat: float
    lon: float
    elevation: float
    slope: Optional[float] = None

class ElevationResponse(BaseModel):
    elevations: List[ElevationPoint]

# Weather endpoint models
class WeatherRequest(BaseModel):
    lat: float
    lon: float

class WeatherResponse(BaseModel):
    rainfall_mm: float
    temperature_c: float
    humidity: int
    wind_speed: float
    risk_level: str  # "Safe", "Caution", "Risky"

class BulletinResponse(BaseModel):
    title: Optional[str] = None
    issued_at: Optional[str] = None
    signal_levels: Optional[List[str]] = None
    summary: Optional[str] = None
    source: str = "PAGASA"
    message: Optional[str] = None

# Risk analysis endpoint models
class RiskPoint(BaseModel):
    lat: float
    lon: float
    elevation: Optional[float] = None
    slope: Optional[float] = None
    rainfall_mm: Optional[float] = None

class RiskRequest(BaseModel):
    points: List[RiskPoint]

class RiskSegment(BaseModel):
    lat: float
    lon: float
    risk_score: int
    risk_level: str

class RiskResponse(BaseModel):
    segments: List[RiskSegment]
    overall_risk: int
    overall_level: str

class RouteOption(BaseModel):
    id: str
    points: List[RiskPoint]

class SafeRouteRequest(BaseModel):
    routes: List[RouteOption]

class EvaluatedRoute(BaseModel):
    id: str
    overall_risk: int
    overall_level: str

class SafeRouteResponse(BaseModel):
    evaluated_routes: List[EvaluatedRoute]
    recommended: EvaluatedRoute

# Enhanced safe route filtering models
class SafeRouteFilterRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float

class RouteSegment(BaseModel):
    lat: float
    lng: float
    elevation: Optional[float] = None
    slope: Optional[float] = None
    rainfall_mm: Optional[float] = None
    risk_score: int
    risk_level: str

class DetailedRoute(BaseModel):
    id: str
    segments: List[RouteSegment]
    overall_risk: int
    overall_level: str
    distance: float
    duration: float
    geometry: dict  # GeoJSON LineString

class EnhancedSafeRouteResponse(BaseModel):
    evaluated_routes: List[DetailedRoute]
    recommended: DetailedRoute

# FastAPI app
app = FastAPI(title="SafePathZC Routes API", version="1.0.0")

# CORS configuration for deployment
origins = [
    "https://safepath-zamboanga-city.vercel.app",  # Your actual Vercel URL
    "https://safepath-zc.vercel.app",             # Alternative Vercel URL
    "https://safepathzc-production.up.railway.app",  # Railway backend URL
    "https://safepath-zc-production.up.railway.app", # Alternative Railway URL
    "https://safepath-zamboanga-city-production.up.railway.app", # Another possible Railway URL
    "http://localhost:5173",                      # Local development
    "http://localhost:5174",                      # Local development (Vite alternate port)
    "http://localhost:3000",                      # Alternative local
    "http://127.0.0.1:5173",                     # Local IP
    "http://127.0.0.1:5174",                     # Local IP (alternate port)
    "*"  # Allow all origins temporarily for admin access
]

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include admin routes
app.include_router(admin_router)
app.include_router(user_auth_router)
app.include_router(forum_router)
app.include_router(flood_routing_router)  # Flood-aware routing with 3 distinct routes
app.include_router(geocoding_router, prefix="/api/geocoding", tags=["geocoding"])

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Public Reports API for map markers
@app.get("/api/reports", tags=["reports"])
async def get_public_reports(
    limit: int = 100,
    status: str = None,
    db: Session = Depends(get_db)
):
    """Get public reports for map display (no authentication required)"""
    try:
        query = db.query(Report)
        
        # Only show approved and visible reports for public access
        query = query.filter(Report.status == "approved", Report.is_visible == True)
        
        # Optional status filter
        if status:
            query = query.filter(Report.status == status)
        
        reports = query.order_by(Report.created_at.desc()).limit(limit).all()
        
        # Format response with minimal data needed for map markers
        formatted_reports = []
        for report in reports:
            formatted_reports.append({
                "id": report.id,
                "title": report.title,
                "description": report.description,
                "category": report.category,
                "urgency": report.urgency,
                "status": report.status,
                "location": {
                    "address": report.location_address,
                    "coordinates": {
                        "lat": float(report.latitude) if report.latitude else None,
                        "lng": float(report.longitude) if report.longitude else None
                    }
                },
                "created_at": report.created_at.isoformat() if report.created_at else None,
                "is_visible": report.is_visible
            })
        
        return formatted_reports
        
    except Exception as e:
        print(f"❌ Error fetching public reports: {e}")
        return []

# Root endpoint for health check
@app.get("/")
async def root():
    return {"message": "SafePathZC Routes API is running", "status": "healthy", "version": "1.0.0"}

# Enhanced Routing and Risk Analysis Endpoints

# Helper functions for OSRM routing
OSRM_ALIGNMENT_THRESHOLD_METERS = 75.0
DEFAULT_ALIGNMENT_SPEED_MPS = 8.33  # ~30 km/h fallback when OSRM provides no timing context

async def get_osrm_route(start_lng: float, start_lat: float, end_lng: float, end_lat: float, alternatives: bool = False, transport_mode: str = "car"):
    """Get route from OSRM routing service with robust error handling and road snapping
    
    Args:
        transport_mode: Transportation mode (car, motorcycle, walking, bicycle, etc.)
                       This determines which OSRM endpoint and profile to use
    """
    try:
        # Import transportation mode configuration
        from services.transportation_modes import get_osrm_endpoint_for_mode, TRANSPORTATION_MODES
        
        # Get the appropriate OSRM endpoint URL for this transport mode
        # This automatically selects the right OSRM container (driving/walking/bicycle)
        osrm_endpoint = get_osrm_endpoint_for_mode(transport_mode)
        url = f"{osrm_endpoint}/{start_lng},{start_lat};{end_lng},{end_lat}"
        
        print(f"🚗 Using OSRM endpoint for '{transport_mode}': {osrm_endpoint}")
        
        params = {
            "geometries": "geojson",
            "overview": "full", 
            "steps": "false"
        }
        
        if alternatives:
            # Use alternatives=true to get alternative routes (OSRM will return up to 3 alternatives)
            params["alternatives"] = "true"
        
        print(f"OSRM Request: {url} with params: {params}")
        
        response = requests.get(url, params=params, timeout=8)
        
        if response.status_code == 200:
            data = response.json()
            if "routes" in data and len(data["routes"]) > 0:
                # Only snap to roads if local routing service is available
                try:
                    from services.local_routing import snap_route_to_roads
                    # Snap each route to actual road geometries
                    for route in data["routes"]:
                        if "geometry" in route and "coordinates" in route["geometry"]:
                            original_coords = route["geometry"]["coordinates"]
                            # Snap to roads (coordinates are [lng, lat])
                            snapped_coords = snap_route_to_roads(
                                [(coord[0], coord[1]) for coord in original_coords],
                                snap_distance_m=30.0  # Snap within 30 meters
                            )
                            # Update geometry with snapped coordinates
                            route["geometry"]["coordinates"] = [
                                [lng, lat] for lng, lat in snapped_coords
                            ]
                            print(f"  Snapped route: {len(original_coords)} → {len(snapped_coords)} points")
                except ImportError:
                    print("Road snapping service not available, using original coordinates")
                return data
            else:
                raise Exception("No routes found in OSRM response")
        else:
            raise Exception(f"OSRM API returned {response.status_code}: {response.text}")
            
    except requests.exceptions.Timeout:
        print("OSRM timeout - generating fallback route")
        return generate_fallback_route(start_lng, start_lat, end_lng, end_lat)
    except requests.exceptions.ConnectionError:
        print("OSRM connection failed - generating fallback route")
        return generate_fallback_route(start_lng, start_lat, end_lng, end_lat)
    except Exception as e:
        print(f"OSRM error: {e} - generating fallback route")
        return generate_fallback_route(start_lng, start_lat, end_lng, end_lat)

def generate_fallback_route(start_lng: float, start_lat: float, end_lng: float, end_lat: float):
    """Generate a simple fallback route when OSRM is not available"""
    import math
    
    # Calculate distance using Haversine formula
    def haversine_distance(lat1, lon1, lat2, lon2):
        R = 6371  # Earth radius in kilometers
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat / 2) * math.sin(dlat / 2) +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
             math.sin(dlon / 2) * math.sin(dlon / 2))
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    
    distance_km = haversine_distance(start_lat, start_lng, end_lat, end_lng)
    duration_seconds = (distance_km / 30) * 3600  # Assume 30 km/h average speed
    
    # Create simple direct route
    return {
        "routes": [{
            "distance": distance_km * 1000,  # Convert to meters
            "duration": duration_seconds,
            "geometry": {
                "type": "LineString",
                "coordinates": [[start_lng, start_lat], [end_lng, end_lat]]
            }
        }],
        "code": "Ok",
        "fallback": True  # Indicate this is a fallback route
    }

async def get_osrm_route_with_waypoints(
    start_lng: float, 
    start_lat: float, 
    end_lng: float, 
    end_lat: float, 
    waypoints: List[List[float]],
    alternatives: bool = False,
    transport_mode: str = "car"
):
    """Get route from OSRM with waypoints (multi-stop route)
    
    Args:
        transport_mode: Transportation mode (car, motorcycle, walking, bicycle, etc.)
    """
    try:
        from services.local_routing import snap_route_to_roads
        from services.transportation_modes import get_osrm_endpoint_for_mode
        
        # Get the appropriate OSRM endpoint URL for this transport mode
        base_url = get_osrm_endpoint_for_mode(transport_mode)
        
        print(f"🚗 Using OSRM endpoint for '{transport_mode}': {base_url}")
        
        # Build coordinates string: start;waypoint1;waypoint2;...;end
        coords_parts = [f"{start_lng},{start_lat}"]
        for wp in waypoints:
            coords_parts.append(f"{wp[0]},{wp[1]}")  # wp is [lng, lat]
        coords_parts.append(f"{end_lng},{end_lat}")
        
        coords_string = ";".join(coords_parts)
        url = f"{base_url}/{coords_string}"
        
        params = {
            "geometries": "geojson",
            "overview": "full",
            "steps": "false"
        }
        
        # Request alternative routes if specified
        if alternatives:
            params["alternatives"] = "true"
        
        print(f"🗺️ OSRM Waypoint Request: {url}")
        print(f"   Route: A → {' → '.join([chr(67+i) for i in range(len(waypoints))])} → B")
        print(f"   Alternatives: {alternatives}")
        
        response = requests.get(url, params=params, timeout=8)
        
        if response.status_code == 200:
            data = response.json()
            if "routes" in data and len(data["routes"]) > 0:
                num_routes = len(data["routes"])
                print(f"   ✅ Got {num_routes} route(s) through waypoints: {data['routes'][0]['distance']/1000:.1f}km")
                if alternatives and num_routes == 1:
                    print(f"   ⚠️ OSRM only returned 1 route despite requesting alternatives")
                
                # Snap each route to actual road geometries
                for route in data["routes"]:
                    if "geometry" in route and "coordinates" in route["geometry"]:
                        original_coords = route["geometry"]["coordinates"]
                        # Snap to roads (coordinates are [lng, lat])
                        snapped_coords = snap_route_to_roads(
                            [(coord[0], coord[1]) for coord in original_coords],
                            snap_distance_m=30.0  # Snap within 30 meters
                        )
                        # Update geometry with snapped coordinates
                        route["geometry"]["coordinates"] = [
                            [lng, lat] for lng, lat in snapped_coords
                        ]
                        print(f"   Snapped waypoint route: {len(original_coords)} → {len(snapped_coords)} points")
                
                # Extract snapped waypoint coordinates from OSRM response
                if "waypoints" in data:
                    snapped_waypoints = []
                    for wp in data["waypoints"]:
                        snapped_waypoints.append({
                            "location": wp.get("location", []),  # [lng, lat]
                            "name": wp.get("name", ""),
                            "hint": wp.get("hint", "")
                        })
                    print(f"   📍 OSRM snapped waypoints to roads:")
                    for i, wp in enumerate(snapped_waypoints[1:-1], 1):  # Skip start and end
                        loc = wp["location"]
                        print(f"      Point {chr(66+i)}: [{loc[0]:.6f}, {loc[1]:.6f}] on {wp.get('name', 'unnamed road')}")
                    # Attach snapped waypoints to response for frontend
                    data["snapped_waypoints"] = snapped_waypoints
                
                return data
            else:
                raise Exception("No routes found in OSRM response")
        else:
            raise Exception(f"OSRM API returned {response.status_code}: {response.text}")
            
    except Exception as e:
        print(f"⚠️ OSRM waypoint routing error: {e}")
        # Fall back to direct route without waypoints
        print("   Falling back to direct route (ignoring waypoints)")
        return await get_osrm_route(start_lng, start_lat, end_lng, end_lat, alternatives=False, transport_mode=transport_mode)

# Helper function for elevation data
async def get_elevation_batch(coordinates: List[List[float]]):
    """Get elevation data for multiple coordinates with robust error handling"""
    try:
        # Limit batch size to avoid timeouts
        if len(coordinates) > 10:
            coordinates = coordinates[:10]
        
        # Open-Elevation API with shorter timeout
        locations = [{"latitude": coord[1], "longitude": coord[0]} for coord in coordinates]
        response = requests.post(
            "https://api.open-elevation.com/api/v1/lookup",
            json={"locations": locations},
            timeout=5  # Reduced timeout
        )
        
        if response.status_code == 200:
            data = response.json()
            return [result["elevation"] for result in data["results"]]
        else:
            raise Exception(f"Elevation API returned {response.status_code}")
            
    except Exception as e:
        print(f"Elevation API error: {e}")
        # Fallback to estimated elevation based on Zamboanga geography
        elevations = []
        for coord in coordinates:
            lng, lat = coord
            # Zamboanga-specific elevation estimation
            city_center_distance = ((lat - 6.9214)**2 + (lng - 122.0794)**2)**0.5 * 111  # km
            
            if city_center_distance < 5:  # Urban coastal area
                estimated_elevation = max(1, 3 + (city_center_distance * 2))
            elif city_center_distance < 15:  # Suburban hills
                estimated_elevation = 8 + (city_center_distance * 1.5)
            else:  # Rural mountains
                estimated_elevation = 20 + (city_center_distance * 2)
                
            elevations.append(min(200, max(1, estimated_elevation)))
        return elevations

# Helper function for weather data
async def get_weather_data(lat: float, lng: float):
    """Get current weather data with robust error handling"""
    try:
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lng,
                "current": "precipitation,rain,weather_code",
                "timezone": "Asia/Manila",
                "forecast_days": 1
            },
            timeout=10  # Increased timeout to 10 seconds
        )
        
        if response.status_code == 200:
            data = response.json()
            current = data.get("current", {})
            return {
                "precipitation": current.get("precipitation", 0),
                "rain": current.get("rain", 0),
                "weather_code": current.get("weather_code", 0)
            }
        else:
            print(f"Weather API returned {response.status_code}, using fallback data")
            raise Exception(f"Weather API returned {response.status_code}")
            
    except requests.exceptions.ConnectTimeout:
        print(f"Weather API connection timeout for coordinates ({lat}, {lng}), using fallback data")
        return {
            "precipitation": 0,
            "rain": 0,
            "weather_code": 1  # Clear sky
        }
    except requests.exceptions.ReadTimeout:
        print(f"Weather API read timeout for coordinates ({lat}, {lng}), using fallback data")
        return {
            "precipitation": 0,
            "rain": 0,
            "weather_code": 1  # Clear sky
        }
    except requests.exceptions.RequestException as e:
        print(f"Weather API network error: {e}, using fallback data")
        return {
            "precipitation": 0,
            "rain": 0,
            "weather_code": 1  # Clear sky
        }
    except Exception as e:
        print(f"Weather API unexpected error: {e}, using fallback data")
        # Fallback weather data (assume clear conditions)
        return {
            "precipitation": 0,
            "rain": 0,
            "weather_code": 1  # Clear sky
        }

# Risk calculation function
def calculate_risk_score(elevation: float, slope: float, weather: dict, lat: float, lng: float):
    """Calculate comprehensive risk score for a location"""
    risk_score = 0.0
    
    # Elevation factor (higher elevation = lower risk)
    if elevation < 5:
        risk_score += 4.0
    elif elevation < 15:
        risk_score += 2.5
    elif elevation < 30:
        risk_score += 1.0
    
    # Slope factor (steep slopes can be risky)
    if slope > 15:
        risk_score += 1.5
    elif slope > 8:
        risk_score += 0.8
    
    # Weather factor
    precipitation = weather.get("precipitation", 0)
    rain = weather.get("rain", 0)
    
    if rain > 10:
        risk_score += 3.0
    elif rain > 5:
        risk_score += 2.0
    elif precipitation > 2:
        risk_score += 1.0
    
    # Coastal proximity (closer to water = higher risk)
    coast_distance = min(
        abs(lat - 6.9),  # Distance from southern coast
        abs(lng - 122.08)  # Distance from western coast
    )
    
    if coast_distance < 0.01:  # Very close to coast
        risk_score += 2.0
    elif coast_distance < 0.02:
        risk_score += 1.0
    
    return min(risk_score, 10.0)  # Cap at 10

def remove_dead_ends(coordinates: List[List[float]], dead_end_threshold: float = 0.00005) -> List[List[float]]:
    """
    ULTRA-AGGRESSIVE dead-end removal with multi-pass progressive cleaning.
    
    Removes "there and back" patterns where route goes somewhere then returns close to origin.
    Uses multiple passes with increasingly strict thresholds to catch dead-ends at all scales.
    
    Args:
        coordinates: List of [lng, lat] coordinate pairs
        dead_end_threshold: Base distance threshold (degrees, ~5m)
    
    Returns:
        Route with dead-ends aggressively removed
    """
    if len(coordinates) < 5:
        return coordinates
    
    cleaned = coordinates.copy()
    
    # MULTI-PASS APPROACH: Start with VERY strict threshold, progressively loosen
    # This catches tight loops first, then progressively larger dead-ends
    # Reduced thresholds from previous version for MORE aggressive cleaning
    thresholds = [
        0.00003,  # ~3m - catch tiny loops
        0.00005,  # ~5m - catch very small dead-ends
        0.00008,  # ~8m - catch small dead-ends
        0.0001,   # ~10m - catch medium dead-ends
        0.00015,  # ~15m - catch larger dead-ends
    ]
    
    for threshold in thresholds:
        changes_made = True
        iterations = 0
        max_iterations = 30  # Increased from 20 for more thorough cleaning
        
        while changes_made and iterations < max_iterations:
            changes_made = False
            iterations += 1
            i = 0
            
            while i < len(cleaned) - 4:
                current = cleaned[i]
                
                # Look ahead to find if we return close to current position
                # Start checking from i+3 (reduced from i+4) to catch tighter loops
                for j in range(i + 3, len(cleaned)):
                    next_point = cleaned[j]
                    
                    # Calculate distance between current and future point
                    dist = ((next_point[0] - current[0])**2 + (next_point[1] - current[1])**2) ** 0.5
                    
                    # If we return close to where we were, it's likely a dead-end
                    if dist < threshold:
                        # Calculate total detour distance
                        detour_dist = 0
                        for k in range(i, j):
                            p1 = cleaned[k]
                            p2 = cleaned[k + 1]
                            detour_dist += ((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2) ** 0.5
                        
                        # ULTRA STRICT: If detour is ANY amount but returns close, it's a dead-end
                        # Changed from "2x threshold" to "1.5x threshold" for maximum strictness
                        if detour_dist > threshold * 1.5:
                            # Remove the dead-end section
                            cleaned = cleaned[:i+1] + cleaned[j:]
                            changes_made = True
                            break
                
                if changes_made:
                    break
                i += 1
    
    # ADDITIONAL PASS: Remove sharp U-turns (180-degree turns)
    # This catches dead-ends that might have been missed by distance checking
    final_cleaned = [cleaned[0]] if cleaned else []
    
    for i in range(1, len(cleaned) - 1):
        if len(final_cleaned) < 2:
            final_cleaned.append(cleaned[i])
            continue
            
        prev = final_cleaned[-1]
        curr = cleaned[i]
        next_point = cleaned[i + 1]
        
        # Calculate vectors
        vec1_x = curr[0] - prev[0]
        vec1_y = curr[1] - prev[1]
        vec2_x = next_point[0] - curr[0]
        vec2_y = next_point[1] - curr[1]
        
        # Normalize vectors
        len1 = (vec1_x**2 + vec1_y**2) ** 0.5
        len2 = (vec2_x**2 + vec2_y**2) ** 0.5
        
        if len1 > 0 and len2 > 0:
            vec1_x /= len1
            vec1_y /= len1
            vec2_x /= len2
            vec2_y /= len2
            
            # Dot product: -1 = opposite directions (180° turn)
            dot = vec1_x * vec2_x + vec1_y * vec2_y
            
            # If angle > 135 degrees (dot < -0.7), skip this point (it's a sharp U-turn)
            if dot > -0.7:
                final_cleaned.append(curr)
        else:
            final_cleaned.append(curr)
    
    if cleaned:
        final_cleaned.append(cleaned[-1])
    
    return final_cleaned

def simplify_route(coordinates: List[List[float]], tolerance: float = 0.00003, waypoints: List[List[float]] = None) -> List[List[float]]:
    """
    Remove backtracking, dead-ends, and redundant points from route coordinates.
    This cleans up messy OSRM routes that have U-turns and side explorations.
    PRESERVES waypoint coordinates to ensure routes visually pass through them.
    
    Args:
        coordinates: List of [lng, lat] coordinate pairs
        tolerance: Distance tolerance for simplification (degrees, ~3m) - REDUCED for better road alignment
        waypoints: List of [lng, lat] waypoint coordinates that must be preserved
    
    Returns:
        Simplified list of coordinates
    """
    if len(coordinates) < 3:
        return coordinates
    
    # Build set of waypoint coordinates for fast lookup
    waypoint_set = set()
    if waypoints:
        for wp in waypoints:
            # Store as tuple with reasonable precision
            waypoint_set.add((round(wp[0], 6), round(wp[1], 6)))
    
    original_count = len(coordinates)
    
    # Step 1: Remove exact duplicates
    cleaned = [coordinates[0]]
    for coord in coordinates[1:]:
        if coord != cleaned[-1]:
            cleaned.append(coord)
    
    if len(cleaned) < 3:
        return cleaned
    
    # Step 2: AGGRESSIVE dead-end removal (NEW!)
    cleaned = remove_dead_ends(cleaned, dead_end_threshold=0.0003)
    
    if len(cleaned) < 3:
        return cleaned
    
    # Step 3: Remove sharp backtracking (angle-based)
    no_backtrack = [cleaned[0]]
    
    for i in range(1, len(cleaned) - 1):
        prev = no_backtrack[-1]
        curr = cleaned[i]
        next_point = cleaned[i + 1]
        
        # Calculate vectors
        vec_to_curr = [curr[0] - prev[0], curr[1] - prev[1]]
        vec_to_next = [next_point[0] - curr[0], next_point[1] - curr[1]]
        
        # Dot product to check if going backwards (angle > 120 degrees)
        dot = vec_to_curr[0] * vec_to_next[0] + vec_to_curr[1] * vec_to_next[1]
        mag_curr = (vec_to_curr[0]**2 + vec_to_curr[1]**2) ** 0.5
        mag_next = (vec_to_next[0]**2 + vec_to_next[1]**2) ** 0.5
        
        if mag_curr > 0 and mag_next > 0:
            cos_angle = dot / (mag_curr * mag_next)
            # If angle < -0.3 (> 107 degrees), it's sharp backtracking
            if cos_angle > -0.3:
                no_backtrack.append(curr)
        else:
            no_backtrack.append(curr)
    
    no_backtrack.append(cleaned[-1])
    
    # Step 4: Apply Ramer-Douglas-Peucker simplification to remove redundant points
    def perpendicular_distance(point, line_start, line_end):
        """Calculate perpendicular distance from point to line segment"""
        if line_start == line_end:
            return ((point[0] - line_start[0])**2 + (point[1] - line_start[1])**2) ** 0.5
        
        # Line equation: ax + by + c = 0
        dx = line_end[0] - line_start[0]
        dy = line_end[1] - line_start[1]
        
        numerator = abs(dy * point[0] - dx * point[1] + line_end[0] * line_start[1] - line_end[1] * line_start[0])
        denominator = (dx**2 + dy**2) ** 0.5
        
        return numerator / denominator if denominator > 0 else 0
    
    def rdp_simplify(points, epsilon):
        """Recursive Douglas-Peucker algorithm"""
        if len(points) < 3:
            return points
        
        # Find point with maximum distance from line start-end
        dmax = 0
        index = 0
        end = len(points) - 1
        
        for i in range(1, end):
            d = perpendicular_distance(points[i], points[0], points[end])
            if d > dmax:
                index = i
                dmax = d
        
        # Check if the point with max distance is a waypoint
        point_key = (round(points[index][0], 6), round(points[index][1], 6))
        is_waypoint = point_key in waypoint_set
        
        # If max distance > epsilon, OR point is a waypoint, keep it and recursively simplify
        if dmax > epsilon or is_waypoint:
            # Recursive call
            rec_results1 = rdp_simplify(points[:index + 1], epsilon)
            rec_results2 = rdp_simplify(points[index:], epsilon)
            
            # Combine results (remove duplicate middle point)
            return rec_results1[:-1] + rec_results2
        else:
            return [points[0], points[end]]
    
    simplified = rdp_simplify(no_backtrack, tolerance)
    
    print(f"     🧹 Route simplified: {len(coordinates)} → {len(simplified)} points (removed {len(coordinates) - len(simplified)} redundant points)")
    
    return simplified

@app.get("/route")
async def get_route(
    start: str = Query(..., description="Start coordinates as lng,lat"),
    end: str = Query(..., description="End coordinates as lng,lat"),
    alternatives: bool = Query(False, description="Include alternative routes"),
    waypoints: str = Query(None, description="Optional waypoints as lng,lat;lng,lat"),
    transport_mode: str = Query("car", description="Transportation mode: car, motorcycle, walking, public_transport, bicycle, truck")
):
    """Get routing data between two points using HYBRID APPROACH: OSRM for routing + GeoJSON for flood analysis
    
    NOW SUPPORTS TRANSPORT MODE SELECTION - Different vehicles will use different OSRM routing profiles!
    - car/truck/public_transport: Use driving profile (main roads)
    - motorcycle/bicycle: Use bicycle profile (can use smaller roads)
    - walking: Use foot profile (sidewalks, pedestrian paths)
    """
    try:
        # Parse coordinates
        start_coords = [float(x) for x in start.split(",")]
        end_coords = [float(x) for x in end.split(",")]
        
        if len(start_coords) != 2 or len(end_coords) != 2:
            raise HTTPException(status_code=400, detail="Invalid coordinate format")
        
        start_lng, start_lat = start_coords
        end_lng, end_lat = end_coords
        
        # Parse waypoints if provided
        waypoint_coords = []
        if waypoints:
            try:
                waypoint_list = waypoints.split(';')
                for wp in waypoint_list:
                    wp_coords = [float(x) for x in wp.split(",")]
                    if len(wp_coords) == 2:
                        waypoint_coords.append(wp_coords)
                print(f"🗺️ Route includes {len(waypoint_coords)} waypoint(s)")
                for i, wp in enumerate(waypoint_coords):
                    print(f"   Waypoint {i+1}: lng={wp[0]:.6f}, lat={wp[1]:.6f}")
            except Exception as e:
                print(f"⚠️ Error parsing waypoints: {e}")
                # Continue without waypoints rather than failing
        else:
            print("⚠️ NO WAYPOINTS PROVIDED - routes will be direct A→B")
        
        print(f"\n🎯 HYBRID ROUTING: Getting OSRM routes and analyzing flood risk...")
        if waypoint_coords:
            print(f"   ✅ Including {len(waypoint_coords)} waypoints in ALL 3 routes (green, orange, red)")
        else:
            print(f"   ⚠️ NO waypoints - generating simple A→B routes")
        
        # Step 1: Get 3 GUARANTEED DIFFERENT routes using multiple strategies
        routes = []
        route_metadata = []  # Track how each route was generated
        snapped_waypoints = []  # Store OSRM-snapped waypoint coordinates
        snapped_wp_coords = []  # Initialize empty list for snapped waypoint coordinates
        
        try:
            print("🔄 Generating route variations...")
            
            # ROUTE 1: Direct/Fastest route (shortest path)
            # If waypoints exist, route through them
            print(f"  📍 Route 1: Direct/fastest route (using {transport_mode} profile)...")
            if waypoint_coords:
                # Build route through all waypoints: start -> wp1 -> wp2 -> ... -> end
                print(f"     ✅ GREEN ROUTE WILL USE WAYPOINTS!")
                print(f"     🔍 Direct route waypoints: {waypoint_coords}")
                print(f"     🔍 Direct route: A({start_lng:.6f},{start_lat:.6f}) -> ", end="")
                for i, wp in enumerate(waypoint_coords):
                    print(f"{chr(67+i)}({wp[0]:.6f},{wp[1]:.6f}) -> ", end="")
                print(f"B({end_lng:.6f},{end_lat:.6f})")
                
                direct_route = await get_osrm_route_with_waypoints(
                    start_lng, start_lat, end_lng, end_lat, waypoint_coords, alternatives=False, transport_mode=transport_mode
                )
                
                # Extract snapped waypoints from OSRM response (actual road coordinates)
                snapped_wp_coords = []
                if direct_route.get("snapped_waypoints"):
                    snapped_waypoints = direct_route["snapped_waypoints"]
                    # Extract just the coordinates from middle waypoints (skip start/end)
                    for i in range(1, len(snapped_waypoints) - 1):
                        loc = snapped_waypoints[i]["location"]
                        if loc and len(loc) == 2:
                            snapped_wp_coords.append(loc)  # [lng, lat]
            else:
                print(f"     ⚠️⚠️⚠️ GREEN ROUTE GOING DIRECT A→B (NO WAYPOINTS!) ⚠️⚠️⚠️")
                direct_route = await get_osrm_route(start_lng, start_lat, end_lng, end_lat, alternatives=False, transport_mode=transport_mode)
                
            if direct_route.get("routes"):
                aligned_direct, _ = align_osrm_routes(
                    direct_route["routes"], start_lat, start_lng, end_lat, end_lng
                )
                
                if aligned_direct:
                    route = aligned_direct[0]
                    # Simplify route with MINIMAL tolerance to preserve road geometry
                    # Use SNAPPED waypoint coordinates (where OSRM actually routed)
                    direct_coords = route["geometry"]["coordinates"]
                    simplified_direct = simplify_route(direct_coords, tolerance=0.00003, waypoints=snapped_wp_coords)
                    route["geometry"]["coordinates"] = simplified_direct
                    
                    # Debug: Check if waypoints are in the route
                    if waypoint_coords:
                        print(f"     🔍 Checking if waypoints are in direct route geometry...")
                        for i, wp in enumerate(waypoint_coords):
                            letter = chr(67 + i)  # C, D, E...
                            # Check if any coordinate is close to this waypoint (within ~100m)
                            found = False
                            for coord in simplified_direct:
                                dist = ((coord[0] - wp[0])**2 + (coord[1] - wp[1])**2) ** 0.5
                                if dist < 0.001:  # ~100m in degrees
                                    found = True
                                    print(f"        ✅ Point {letter} found in route at lng={coord[0]:.6f}, lat={coord[1]:.6f}")
                                    break
                            if not found:
                                print(f"        ⚠️ Point {letter} NOT found in route! Waypoint is at lng={wp[0]:.6f}, lat={wp[1]:.6f}")
                    
                    routes.append(route)
                    route_metadata.append("direct")
                    print(f"     ✅ Direct route: {route['distance']/1000:.1f}km")
            
            # Calculate perpendicular direction for side detours
            route_vector_lng = end_lng - start_lng
            route_vector_lat = end_lat - start_lat
            route_length = (route_vector_lng**2 + route_vector_lat**2) ** 0.5
            
            # Perpendicular vectors (rotate 90 degrees)
            perp_lng = -route_vector_lat / route_length if route_length > 0 else 0
            perp_lat = route_vector_lng / route_length if route_length > 0 else 0
            
            # ROUTE 2 & 3: Generate alternative routes with detours
            # For waypoints: Create variations by adding detours BETWEEN waypoint segments
            # For no waypoints: Create detours along the main route
            if len(routes) < 3:
                print("  📍 Routes 2 & 3: Generating detour variations...")
                
                if waypoint_coords:
                    # WITH WAYPOINTS: Generate detours between each waypoint segment
                    # This creates 3 different physical routes that ALL pass through the waypoints
                    print("     Creating waypoint segment detours (all routes pass through A→C→D→B)...")
                    
                    # Build list of all points: start -> waypoint1 -> waypoint2 -> ... -> end
                    all_points = [[start_lng, start_lat]] + waypoint_coords + [[end_lng, end_lat]]
                    
                    print(f"     🗺️ Waypoint routing plan:")
                    for i, point in enumerate(all_points):
                        if i == 0:
                            print(f"        Start (A): lng={point[0]:.6f}, lat={point[1]:.6f}")
                        elif i == len(all_points) - 1:
                            print(f"        End (B): lng={point[0]:.6f}, lat={point[1]:.6f}")
                        else:
                            letter = chr(66 + i)  # B=66, so waypoint 1 = C, waypoint 2 = D, etc.
                            print(f"        Waypoint {i} ({letter}): lng={point[0]:.6f}, lat={point[1]:.6f}")
                    
                    # Generate 2 detour variations (right and left)
                    for detour_type in ["right", "left"]:
                        try:
                            detour_coords = []
                            detour_dist = 0
                            detour_dur = 0
                            detour_snapped_waypoints = []  # Collect snapped waypoint coordinates
                            
                            # For each segment between waypoints (A→C, C→D, D→B)
                            for seg_idx in range(len(all_points) - 1):
                                seg_start = all_points[seg_idx]
                                seg_end = all_points[seg_idx + 1]
                                
                                # Determine segment label (A→C, C→D, etc.)
                                start_label = "A" if seg_idx == 0 else chr(66 + seg_idx)
                                end_label = "B" if seg_idx == len(all_points) - 2 else chr(67 + seg_idx)
                                print(f"        Segment {seg_idx + 1}: {start_label} → {end_label}")
                                
                                # Calculate segment vector and midpoint
                                seg_vec_lng = seg_end[0] - seg_start[0]
                                seg_vec_lat = seg_end[1] - seg_start[1]
                                seg_length = (seg_vec_lng**2 + seg_vec_lat**2) ** 0.5
                                
                                if seg_length > 0.01:  # Only add detour if segment is long enough
                                    # Calculate perpendicular direction for this segment
                                    perp_seg_lng = -seg_vec_lat / seg_length
                                    perp_seg_lat = seg_vec_lng / seg_length
                                    
                                    # Create detour point at segment midpoint
                                    mid_lng = seg_start[0] + seg_vec_lng * 0.5
                                    mid_lat = seg_start[1] + seg_vec_lat * 0.5
                                    
                                    # Offset amount (smaller for tighter detours)
                                    offset = 0.01 if detour_type == "right" else 0.015  # ~1km vs ~1.5km
                                    direction = 1 if detour_type == "right" else -1
                                    
                                    detour_lng = mid_lng + (perp_seg_lng * offset * direction)
                                    detour_lat = mid_lat + (perp_seg_lat * offset * direction)
                                    
                                    # Route: segment_start -> detour_point -> segment_end (MUST go through segment_end!)
                                    # Use 3-point routing to ensure we hit the waypoint
                                    detour_segment = await get_osrm_route_with_waypoints(
                                        seg_start[0], seg_start[1], seg_end[0], seg_end[1],
                                        [[detour_lng, detour_lat]],  # Detour point as intermediate waypoint
                                        alternatives=False,
                                        transport_mode=transport_mode
                                    )
                                    
                                    if detour_segment.get("routes"):
                                        coords = detour_segment["routes"][0]["geometry"]["coordinates"]
                                        
                                        # Extract snapped waypoint from this segment (the endpoint if it's a user waypoint)
                                        if detour_segment.get("snapped_waypoints") and seg_end != all_points[-1]:
                                            # Get the last waypoint (which is the segment endpoint)
                                            snapped_wps = detour_segment["snapped_waypoints"]
                                            if len(snapped_wps) >= 2:
                                                endpoint_snapped = snapped_wps[-1]["location"]
                                                if endpoint_snapped and len(endpoint_snapped) == 2:
                                                    detour_snapped_waypoints.append(endpoint_snapped)
                                        
                                        # Debug: Check if this segment passes through the waypoint
                                        if seg_end == all_points[-1]:
                                            print(f"          → Final segment to destination")
                                        else:
                                            waypoint_at_end = f"Waypoint at end: lng={seg_end[0]:.6f}, lat={seg_end[1]:.6f}"
                                            route_end = f"Route ends at: lng={coords[-1][0]:.6f}, lat={coords[-1][1]:.6f}"
                                            print(f"          → {waypoint_at_end}")
                                            print(f"          → {route_end}")
                                        
                                        if detour_coords:
                                            coords = coords[1:]  # Skip duplicate with previous segment
                                        
                                        detour_coords.extend(coords)
                                        detour_dist += detour_segment["routes"][0]["distance"]
                                        detour_dur += detour_segment["routes"][0]["duration"]
                                    else:
                                        # Fallback: direct route for this segment
                                        direct_seg = await get_osrm_route(seg_start[0], seg_start[1], seg_end[0], seg_end[1], alternatives=False, transport_mode=transport_mode)
                                        if direct_seg.get("routes"):
                                            coords = direct_seg["routes"][0]["geometry"]["coordinates"]
                                            if detour_coords:
                                                coords = coords[1:]
                                            detour_coords.extend(coords)
                                            detour_dist += direct_seg["routes"][0]["distance"]
                                            detour_dur += direct_seg["routes"][0]["duration"]
                                else:
                                    # Segment too short for detour, use direct route
                                    direct_seg = await get_osrm_route(seg_start[0], seg_start[1], seg_end[0], seg_end[1], alternatives=False, transport_mode=transport_mode)
                                    if direct_seg.get("routes"):
                                        coords = direct_seg["routes"][0]["geometry"]["coordinates"]
                                        if detour_coords:
                                            coords = coords[1:]
                                        detour_coords.extend(coords)
                                        detour_dist += direct_seg["routes"][0]["distance"]
                                        detour_dur += direct_seg["routes"][0]["duration"]
                            
                            # Add this detour route
                            if detour_coords and len(detour_coords) > 1:
                                # Use SNAPPED waypoint coordinates for protection (where OSRM actually routed)
                                detour_coords = simplify_route(detour_coords, tolerance=0.00003, waypoints=detour_snapped_waypoints)
                                
                                # Debug: Check if waypoints are in the detour route
                                print(f"     🔍 Checking if waypoints are in {detour_type} detour route...")
                                for i, wp in enumerate(waypoint_coords):
                                    letter = chr(67 + i)  # C, D, E...
                                    found = False
                                    for coord in detour_coords:
                                        dist = ((coord[0] - wp[0])**2 + (coord[1] - wp[1])**2) ** 0.5
                                        if dist < 0.001:  # ~100m in degrees
                                            found = True
                                            print(f"        ✅ Point {letter} found in route at lng={coord[0]:.6f}, lat={coord[1]:.6f}")
                                            break
                                    if not found:
                                        print(f"        ⚠️ Point {letter} NOT found in route! Waypoint is at lng={wp[0]:.6f}, lat={wp[1]:.6f}")
                                
                                alt_route = {
                                    "geometry": {"coordinates": detour_coords, "type": "LineString"},
                                    "distance": detour_dist,
                                    "duration": detour_dur,
                                    "weight": detour_dur,
                                    "weight_name": "routability"
                                }
                                aligned, _ = align_route_geometry_with_request(alt_route, start_lat, start_lng, end_lat, end_lng)
                                routes.append(aligned)
                                route_metadata.append(f"{detour_type}_detour_waypoints")
                                print(f"     ✅ {detour_type.capitalize()} detour through waypoints: {detour_dist/1000:.1f}km")
                                
                                if len(routes) >= 3:
                                    break
                        
                        except Exception as e:
                            print(f"     ⚠️ {detour_type.capitalize()} detour generation failed: {e}")
                
                else:
                    # NO WAYPOINTS: Use original perpendicular detour strategy
                    # Waypoints along the route
                    wp_25_lng = start_lng + route_vector_lng * 0.25
                    wp_25_lat = start_lat + route_vector_lat * 0.25
                    
                    wp_50_lng = start_lng + route_vector_lng * 0.50
                    wp_50_lat = start_lat + route_vector_lat * 0.50
                    
                    wp_75_lng = start_lng + route_vector_lng * 0.75
                    wp_75_lat = start_lat + route_vector_lat * 0.75
                    
                    offset = 0.018  # ~2km offset
                    
                    # RIGHT detour waypoint
                    wp_50_right_lng = wp_50_lng + (perp_lng * offset)
                    wp_50_right_lat = wp_50_lat + (perp_lat * offset)
                    
                    # LEFT detour waypoint
                    wp_50_left_lng = wp_50_lng - (perp_lng * offset)
                    wp_50_left_lat = wp_50_lat - (perp_lat * offset)
                    
                    try:
                        # Parallelize ALL segment calls for both routes
                        segments_to_fetch = [
                            # RIGHT detour segments
                            (start_lng, start_lat, wp_25_lng, wp_25_lat, "r1"),
                            (wp_25_lng, wp_25_lat, wp_50_right_lng, wp_50_right_lat, "r2"),
                            (wp_50_right_lng, wp_50_right_lat, wp_75_lng, wp_75_lat, "r3"),
                            (wp_75_lng, wp_75_lat, end_lng, end_lat, "r4"),
                            # LEFT detour segments
                            (start_lng, start_lat, wp_25_lng, wp_25_lat, "l1"),
                            (wp_25_lng, wp_25_lat, wp_50_left_lng, wp_50_left_lat, "l2"),
                            (wp_50_left_lng, wp_50_left_lat, wp_75_lng, wp_75_lat, "l3"),
                            (wp_75_lng, wp_75_lat, end_lng, end_lat, "l4"),
                        ]
                        
                        # Fetch all segments in parallel (8 calls → ~1-2 seconds instead of 8 seconds!)
                        segment_results = await asyncio.gather(*[
                            get_osrm_route(s[0], s[1], s[2], s[3], alternatives=False, transport_mode=transport_mode)
                            for s in segments_to_fetch
                        ], return_exceptions=True)
                        
                        # Build RIGHT detour route
                        right_coords = []
                        right_dist = 0
                        right_dur = 0
                        
                        for i in range(4):  # First 4 segments
                            result = segment_results[i]
                            if isinstance(result, Exception) or not result.get("routes"):
                                continue
                            coords = result["routes"][0]["geometry"]["coordinates"]
                            if right_coords:
                                coords = coords[1:]  # Skip duplicate
                            right_coords.extend(coords)
                            right_dist += result["routes"][0]["distance"]
                            right_dur += result["routes"][0]["duration"]
                        
                        if right_coords and len(right_coords) > 1:
                            # Simplify route with MINIMAL tolerance to preserve road geometry
                            right_coords = simplify_route(right_coords, tolerance=0.00003)  # Reduced from 0.00015 to ~3m
                            
                            alt_route = {
                                "geometry": {"coordinates": right_coords, "type": "LineString"},
                                "distance": right_dist,
                                "duration": right_dur,
                                "weight": right_dur,
                                "weight_name": "routability"
                            }
                            aligned, _ = align_route_geometry_with_request(alt_route, start_lat, start_lng, end_lat, end_lng)
                            routes.append(aligned)
                            route_metadata.append("right_detour")
                            print(f"     ✅ Right detour: {right_dist/1000:.1f}km")
                        
                        # Build LEFT detour route
                        left_coords = []
                        left_dist = 0
                        left_dur = 0
                        
                        for i in range(4, 8):  # Last 4 segments
                            result = segment_results[i]
                            if isinstance(result, Exception) or not result.get("routes"):
                                continue
                            coords = result["routes"][0]["geometry"]["coordinates"]
                            if left_coords:
                                coords = coords[1:]  # Skip duplicate
                            left_coords.extend(coords)
                            left_dist += result["routes"][0]["distance"]
                            left_dur += result["routes"][0]["duration"]
                        
                        if left_coords and len(left_coords) > 1:
                            # Simplify route with MINIMAL tolerance to preserve road geometry
                            left_coords = simplify_route(left_coords, tolerance=0.00003)  # Reduced from 0.00015 to ~3m
                            
                            alt_route = {
                                "geometry": {"coordinates": left_coords, "type": "LineString"},
                                "distance": left_dist,
                                "duration": left_dur,
                                "weight": left_dur,
                                "weight_name": "routability"
                            }
                            aligned, _ = align_route_geometry_with_request(alt_route, start_lat, start_lng, end_lat, end_lng)
                            routes.append(aligned)
                            route_metadata.append("left_detour")
                            print(f"     ✅ Left detour: {left_dist/1000:.1f}km")
                        
                    except Exception as e:
                        print(f"     ⚠️ Parallel detour generation failed: {e}")
            
            if not routes:
                raise HTTPException(status_code=500, detail="Could not generate any routes from OSRM")
            
            # If we still only have 1 route (detour generation failed), duplicate it
            # This ensures we always provide 3 options for comparison
            if len(routes) == 1:
                print(f"  ⚠️ Only generated 1 route - duplicating for 3 risk level classifications")
                routes = [
                    routes[0].copy(),
                    routes[0].copy(),
                    routes[0].copy()
                ]
                route_metadata = ["route_1", "route_2", "route_3"]
            else:
                print(f"  ✅ Successfully generated {len(routes)} distinct routes!")

            
            print(f"\n☁️ Fetching current weather conditions for Zamboanga City...")
            weather_data = await fetch_zamboanga_weather()
            print(f"   Weather: {weather_data['condition']}, {weather_data['precipitation_mm']}mm rain, {weather_data['wind_kph']}kph wind")
            
            print(f"\n🔬 Step 2: Analyzing flood risk for {len(routes)} routes (with weather impact)...")
            
            # Step 2: Analyze each route for flood risk using our GeoJSON terrain data
            from services.local_routing import analyze_route_flood_risk
            
            route_analyses = []
            for i, route in enumerate(routes):
                try:
                    # Extract coordinates from route geometry
                    coords = route.get("geometry", {}).get("coordinates", [])
                    if not coords:
                        print(f"⚠️ Route {i+1} has no coordinates, skipping analysis")
                        continue
                    
                    # Convert to (lng, lat) tuples for analysis
                    route_coords = [(lng, lat) for lng, lat in coords]
                    
                    # Analyze flood risk WITH WEATHER DATA
                    analysis = analyze_route_flood_risk(route_coords, buffer_meters=50.0, weather_data=weather_data)
                    
                    route_analyses.append({
                        "route": route,
                        "analysis": analysis,
                        "route_index": i
                    })
                    
                    print(f"✅ Route {i+1}: {analysis['flooded_percentage']:.1f}% flooded, risk: {analysis['risk_level']}")
                    
                except Exception as e:
                    print(f"❌ Failed to analyze route {i+1}: {e}")
                    # Still include the route but with minimal analysis
                    route_analyses.append({
                        "route": route,
                        "analysis": {
                            "flood_score": 0,
                            "flooded_percentage": 0,
                            "risk_level": "unknown",
                            "flooded_distance_m": 0,
                            "safe_distance_m": route.get("distance", 0),
                            "segments_analyzed": 0
                        },
                        "route_index": i
                    })
            
            if not route_analyses:
                raise HTTPException(status_code=500, detail="Could not analyze any routes for flood risk")
            
            # Step 3: Sort routes by flood percentage (lowest to highest)
            route_analyses.sort(key=lambda x: x["analysis"]["flooded_percentage"])
            
            print(f"\n📊 Step 3: Sorted {len(route_analyses)} routes by flood risk (lowest to highest)")
            for i, ra in enumerate(route_analyses):
                meta = route_metadata[ra["route_index"]] if ra["route_index"] < len(route_metadata) else "unknown"
                print(f"  Position {i+1}: {ra['analysis']['flooded_percentage']:.1f}% flooded ({meta} route)")
            
            # Step 4: Assign routes to safe/manageable/prone based on LOWEST to HIGHEST flood %
            # The SAFEST route (lowest flood %) = safe
            # The MIDDLE route = manageable  
            # The WORST route (highest flood %) = prone
            final_routes = []
            final_analyses = []
            
            labels = ["safe", "manageable", "prone"]
            
            for i, route_data in enumerate(route_analyses[:3]):  # Take top 3
                route = route_data["route"]
                analysis = route_data["analysis"]
                flood_pct = analysis['flooded_percentage']
                metadata_idx = route_data.get("route_index", i)
                meta = route_metadata[metadata_idx] if metadata_idx < len(route_metadata) else "unknown"
                
                # Assign label based on SORTED position
                classification = labels[i] if i < len(labels) else "prone"
                
                # Generate description based on actual flood percentage
                if flood_pct < 15:
                    risk_desc = "Low risk"
                elif flood_pct < 35:
                    risk_desc = "Moderate risk"
                else:
                    risk_desc = "High risk"
                
                description = f"{risk_desc}: {flood_pct:.1f}% flooded ({meta})"
                
                final_routes.append(route)

                final_analyses.append({
                    "risk_level": classification,
                    "distance": route.get("distance", 0),
                    "duration": route.get("duration", 0),
                    "description": description,
                    "flood_score": analysis["flood_score"],
                    "flooded_percentage": analysis["flooded_percentage"],
                    "flooded_distance_m": analysis["flooded_distance_m"],
                    "safe_distance_m": analysis["safe_distance_m"],
                    "segments_analyzed": analysis["segments_analyzed"]
                })
                
                print(f"  🎯 Route {i+1} classified as '{classification}': {description}")
            
            print(f"\n✅ HYBRID ROUTING COMPLETE: Returning {len(final_routes)} flood-analyzed routes\n")
            
            response_data = {
                "routes": final_routes,
                "analyses": final_analyses,
                "source": "hybrid_osrm_geojson",
                "weather": {
                    "condition": weather_data["condition"],
                    "temperature_c": weather_data["temperature_c"],
                    "precipitation_mm": weather_data["precipitation_mm"],
                    "wind_kph": weather_data["wind_kph"],
                    "humidity": weather_data["humidity"]
                }
            }
            
            # Include snapped waypoints if available (OSRM road-snapped coordinates)
            if snapped_waypoints:
                # Extract just the waypoint locations (excluding start and end)
                waypoint_locations = []
                for i, wp in enumerate(snapped_waypoints):
                    if i > 0 and i < len(snapped_waypoints) - 1:  # Skip first (start) and last (end)
                        loc = wp["location"]
                        waypoint_locations.append({
                            "lng": loc[0],
                            "lat": loc[1],
                            "name": wp.get("name", ""),
                            "letter": chr(67 + len(waypoint_locations))  # C, D, E, ...
                        })
                
                if waypoint_locations:
                    response_data["snapped_waypoints"] = waypoint_locations
                    print(f"📍 Returning {len(waypoint_locations)} snapped waypoint(s) for accurate marker placement")
            
            return response_data
            
        except Exception as osrm_error:
            print(f"❌ OSRM routing failed: {osrm_error}")
            raise HTTPException(status_code=500, detail=f"Routing service failed: {str(osrm_error)}")
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinate format")
    except Exception as e:
        print(f"❌ Route endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")

@app.get("/elevation")
async def get_elevation(
    locations: str = Query(..., description="Comma-separated lat,lng pairs")
):
    """Get elevation data for specified locations"""
    try:
        # Parse location coordinates
        coords = []
        for loc in locations.split(";"):
            lat, lng = [float(x) for x in loc.split(",")]
            coords.append([lng, lat])
        
        elevations = await get_elevation_batch(coords)
        
        return {
            "elevations": [
                {
                    "latitude": coord[1],
                    "longitude": coord[0],
                    "elevation": elev
                }
                for coord, elev in zip(coords, elevations)
            ]
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinate format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Elevation service error: {str(e)}")

@app.get("/weather")
async def get_weather(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude")
):
    """Get current weather data for a location"""
    try:
        weather_data = await get_weather_data(lat, lng)
        return weather_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weather service error: {str(e)}")

@app.get("/bulletin")
async def get_weather_bulletin():
    """Get weather bulletin and alerts for Zamboanga City"""
    try:
        # Get weather for central Zamboanga City
        weather_data = await get_weather_data(6.9214, 122.0790)
        
        # Determine alert level based on weather conditions
        precipitation = weather_data.get("precipitation", 0)
        rain = weather_data.get("rain", 0)
        
        if rain > 15 or precipitation > 20:
            alert_level = "high"
            message = "Heavy Rain Warning: Exercise caution in low-lying areas below 5m elevation"
        elif rain > 8 or precipitation > 10:
            alert_level = "medium"
            message = "Moderate Rain Alert: Monitor weather conditions and avoid flood-prone areas"
        elif rain > 2 or precipitation > 5:
            alert_level = "low"
            message = "Light Rain Advisory: Stay updated on weather conditions"
        else:
            alert_level = "none"
            message = "No weather alerts at this time"
        
        return {
            "alert_level": alert_level,
            "message": message,
            "weather": weather_data,
            "timestamp": datetime.utcnow().isoformat(),
            "location": "Zamboanga City"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulletin service error: {str(e)}")

@app.post("/safe-route-filter")
async def filter_safe_route(request: dict):
    """Enhanced safe route filtering with comprehensive risk analysis and error handling"""
    try:
        coordinates = request.get("coordinates", [])
        max_risk_score = request.get("max_risk_score", 7.0)
        weather_weight = request.get("weather_weight", 0.3)
        elevation_weight = request.get("elevation_weight", 0.3)
        terrain_weight = request.get("terrain_weight", 0.4)
        
        if not coordinates:
            raise HTTPException(status_code=400, detail="No coordinates provided")
        
        print(f"Processing route with {len(coordinates)} coordinates...")
        
        # Initialize fallback values
        elevations = []
        weather_data = {"precipitation": 0, "rain": 0, "weather_code": 1}
        
        # Simplified processing to avoid external API timeouts
        try:
            # Get elevation data for route points (sample fewer points to avoid timeouts)
            sample_coords = coordinates[::max(1, len(coordinates)//10)]  # Sample fewer points
            print(f"Getting elevation for {len(sample_coords)} sample points...")
            elevations = await get_elevation_batch(sample_coords)
            print(f"Successfully retrieved {len(elevations)} elevation values")
            
        except Exception as elevation_error:
            print(f"Elevation API error: {elevation_error}, using fallback elevation data")
            # Use fallback elevation data based on Zamboanga geography
            elevations = []
            for coord in sample_coords:
                lng, lat = coord
                city_center_distance = ((lat - 6.9214)**2 + (lng - 122.0794)**2)**0.5 * 111
                if city_center_distance < 5:
                    elevation = max(1, 3 + (city_center_distance * 2))
                elif city_center_distance < 15:
                    elevation = 8 + (city_center_distance * 1.5)
                else:
                    elevation = 20 + (city_center_distance * 2)
                elevations.append(min(200, max(1, elevation)))
        
        try:
            # Get weather data for the route area (use midpoint)
            mid_idx = len(coordinates) // 2
            mid_coord = coordinates[mid_idx]
            print(f"Getting weather data for coordinates: {mid_coord}")
            weather_data = await get_weather_data(mid_coord[1], mid_coord[0])
            print(f"Successfully retrieved weather data: {weather_data}")
            
        except Exception as weather_error:
            print(f"Weather API error: {weather_error}, using clear weather fallback")
            weather_data = {"precipitation": 0, "rain": 0, "weather_code": 1}
        
        # Calculate risk scores for sampled points
        risk_scores = []
        risk_points = []
        
        try:
            sample_coords = coordinates[::max(1, len(coordinates)//10)]
            
            for i, coord in enumerate(sample_coords):
                lng, lat = coord
                elevation = elevations[i] if i < len(elevations) else 10.0
                
                # Calculate slope (simplified using elevation differences)
                slope = 0.0
                if i > 0 and i < len(elevations) - 1:
                    prev_elev = elevations[i-1] if i-1 < len(elevations) else elevation
                    next_elev = elevations[i+1] if i+1 < len(elevations) else elevation
                    slope = abs(next_elev - prev_elev) / 2.0
                
                # Calculate comprehensive risk score
                risk_score = calculate_risk_score(elevation, slope, weather_data, lat, lng)
                risk_scores.append(risk_score)
                
                # Mark high-risk points
                if risk_score > max_risk_score:
                    risk_points.append({
                        "coordinates": [lng, lat],
                        "risk_score": risk_score,
                        "elevation": elevation,
                        "reasons": []
                    })
                    
                    # Add specific risk reasons
                    if elevation < 5:
                        risk_points[-1]["reasons"].append("Very low elevation (flood prone)")
                    if weather_data.get("rain", 0) > 5:
                        risk_points[-1]["reasons"].append("Active rainfall")
                    if slope > 10:
                        risk_points[-1]["reasons"].append("Steep terrain")
                        
        except Exception as risk_calc_error:
            print(f"Risk calculation error: {risk_calc_error}, using fallback risk scores")
            # Fallback: assign moderate risk scores
            risk_scores = [5.0] * len(sample_coords)
            risk_points = []
        
        # Filter coordinates (keep original route, provide warnings instead)
        filtered_coordinates = coordinates
        warnings = []
        
        if len(risk_points) > len(sample_coords) * 0.3:  # More than 30% high risk
            warnings.append("High-risk route: Consider alternative path")
        elif risk_points:
            warnings.append(f"Route has {len(risk_points)} high-risk areas")
        else:
            warnings.append("Route analysis completed successfully")
        
        # Calculate average risk score
        average_risk_score = sum(risk_scores) / len(risk_scores) if risk_scores else 4.0
        
        print(f"Route analysis completed - Average risk: {average_risk_score:.2f}, High-risk points: {len(risk_points)}")
        
        return {
            "filtered_coordinates": filtered_coordinates,
            "original_coordinates": coordinates,
            "average_risk_score": average_risk_score,
            "max_risk_score": max(risk_scores) if risk_scores else 6.0,
            "risk_points": risk_points,
            "warnings": warnings,
            "weather_conditions": weather_data,
            "analysis_metadata": {
                "total_points_analyzed": len(sample_coords),
                "high_risk_points": len(risk_points),
                "weather_weight": weather_weight,
                "elevation_weight": elevation_weight,
                "terrain_weight": terrain_weight,
                "analysis_successful": True
            }
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Unexpected error in safe-route-filter: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        
        # Return a fallback response instead of raising an error
        return {
            "filtered_coordinates": request.get("coordinates", []),
            "original_coordinates": request.get("coordinates", []),
            "average_risk_score": 5.0,  # Moderate risk fallback
            "max_risk_score": 6.0,
            "risk_points": [],
            "warnings": [f"Route analysis failed: {str(e)}", "Using fallback risk assessment"],
            "weather_conditions": {"precipitation": 0, "rain": 0, "weather_code": 1},
            "analysis_metadata": {
                "total_points_analyzed": 0,
                "high_risk_points": 0,
                "weather_weight": 0.3,
                "elevation_weight": 0.3,
                "terrain_weight": 0.4,
                "analysis_successful": False,
                "error": str(e)
            }
        }

# API Routes

@app.get("/")
async def root():
    return {"message": "SafePathZC Routes API", "status": "running"}

# Route History Endpoints
@app.get("/api/routes/history", response_model=List[RouteHistoryResponse])
async def get_route_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get route history with pagination and search"""
    query = db.query(RouteHistory)
    
    if search:
        query = query.filter(
            (RouteHistory.from_location.ilike(f"%{search}%")) |
            (RouteHistory.to_location.ilike(f"%{search}%"))
        )
    
    routes = query.order_by(RouteHistory.date.desc()).offset(skip).limit(limit).all()
    return routes

@app.post("/api/routes/history", response_model=RouteHistoryResponse)
async def create_route_history(route: RouteHistoryCreate, db: Session = Depends(get_db)):
    """Create a new route history entry"""
    db_route = RouteHistory(**route.dict())
    db.add(db_route)
    db.commit()
    db.refresh(db_route)
    return db_route

@app.delete("/api/routes/history/{route_id}")
async def delete_route_history(route_id: int, db: Session = Depends(get_db)):
    """Delete a route history entry"""
    route = db.query(RouteHistory).filter(RouteHistory.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    db.delete(route)
    db.commit()
    return {"message": "Route deleted successfully"}

@app.patch("/api/routes/history/{route_id}")
async def update_route_status(route_id: int, update_data: dict, db: Session = Depends(get_db)):
    """Update route status (for GPS completion tracking)"""
    route = db.query(RouteHistory).filter(RouteHistory.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    
    # Update allowed fields
    if "status" in update_data:
        route.status = update_data["status"]
    
    db.commit()
    db.refresh(route)
    return {"message": f"Route status updated to {route.status}", "route": route}

# Favorite Routes Endpoints
@app.get("/api/routes/favorites", response_model=List[FavoriteRouteResponse])
async def get_favorite_routes(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get favorite routes"""
    favorites = db.query(FavoriteRoute).order_by(FavoriteRoute.last_used.desc()).offset(skip).limit(limit).all()
    return favorites

@app.post("/api/routes/favorites", response_model=FavoriteRouteResponse)
async def create_favorite_route(route: FavoriteRouteCreate, db: Session = Depends(get_db)):
    """Create a new favorite route"""
    try:
        print(f"Received route data: {route.dict()}")
        db_route = FavoriteRoute(**route.dict())
        db.add(db_route)
        db.commit()
        db.refresh(db_route)
        print(f"Successfully created route with ID: {db_route.id}")
        return db_route
    except Exception as e:
        print(f"Error creating favorite route: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/routes/favorites/{route_id}", response_model=FavoriteRouteResponse)
async def update_favorite_route(route_id: int, route: FavoriteRouteCreate, db: Session = Depends(get_db)):
    """Update a favorite route"""
    db_route = db.query(FavoriteRoute).filter(FavoriteRoute.id == route_id).first()
    if not db_route:
        raise HTTPException(status_code=404, detail="Favorite route not found")
    
    for key, value in route.dict().items():
        setattr(db_route, key, value)
    
    db_route.last_used = datetime.utcnow()
    db.commit()
    db.refresh(db_route)
    return db_route

@app.delete("/api/routes/favorites/{route_id}")
async def delete_favorite_route(route_id: int, db: Session = Depends(get_db)):
    """Delete a favorite route"""
    route = db.query(FavoriteRoute).filter(FavoriteRoute.id == route_id).first()
    if not route:
        raise HTTPException(status_code=404, detail="Favorite route not found")
    
    db.delete(route)
    db.commit()
    return {"message": "Favorite route deleted successfully"}

# Search History Endpoints
@app.get("/api/search/history", response_model=List[SearchHistoryResponse])
async def get_search_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get search history"""
    searches = db.query(SearchHistory).order_by(SearchHistory.timestamp.desc()).offset(skip).limit(limit).all()
    return searches

@app.post("/api/search/history", response_model=SearchHistoryResponse)
async def create_search_history(search: SearchHistoryCreate, db: Session = Depends(get_db)):
    """Create a new search history entry"""
    db_search = SearchHistory(**search.dict())
    db.add(db_search)
    db.commit()
    db.refresh(db_search)
    return db_search

@app.delete("/api/search/history")
async def clear_search_history(db: Session = Depends(get_db)):
    """Clear all search history"""
    db.query(SearchHistory).delete()
    db.commit()
    return {"message": "Search history cleared successfully"}

# Helper functions for routing and elevation
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula (returns meters)"""
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def calculate_slope(elev1: float, elev2: float, distance_m: float) -> float:
    """Calculate slope percentage between two points"""
    if distance_m == 0:
        return 0.0
    return ((elev2 - elev1) / distance_m) * 100


def align_route_geometry_with_request(route: dict, start_lat: float, start_lng: float,
                                      end_lat: float, end_lng: float,
                                      threshold_m: float = OSRM_ALIGNMENT_THRESHOLD_METERS) -> Tuple[dict, List[dict]]:
    """Ensure an OSRM route actually starts and ends at the requested coordinates.

    OSRM snaps input coordinates to its own network. When OSM lacks coverage near the
    requested points, the geometry can terminate hundreds of metres away (often on a
    cul-de-sac). To keep the UI from drawing lines that stop prematurely, this helper
    appends short connector segments back to the caller's exact start/end positions.

    Returns the mutated route dictionary plus a list describing any adjustments that
    were applied so the caller can log or surface the behaviour."""

    geometry = route.setdefault("geometry", {"type": "LineString", "coordinates": []})
    coords = geometry.setdefault("coordinates", [])

    adjustments = []
    added_distance = 0.0

    if coords:
        start_gap = calculate_distance(start_lat, start_lng, coords[0][1], coords[0][0])
        if start_gap > threshold_m:
            coords.insert(0, [start_lng, start_lat])
            adjustments.append({"position": "start", "gap_m": start_gap})
            added_distance += start_gap
    else:
        # No geometry from OSRM – fall back to a direct line between the requested points.
        coords.extend([[start_lng, start_lat], [end_lng, end_lat]])
        straight_distance = calculate_distance(start_lat, start_lng, end_lat, end_lng)
        adjustments.append({"position": "start", "gap_m": straight_distance})
        adjustments.append({"position": "end", "gap_m": 0.0})
        added_distance += straight_distance

    end_gap = calculate_distance(end_lat, end_lng, coords[-1][1], coords[-1][0])
    if end_gap > threshold_m:
        coords.append([end_lng, end_lat])
        adjustments.append({"position": "end", "gap_m": end_gap})
        added_distance += end_gap

    if added_distance > 0:
        original_distance = route.get("distance", 0.0)
        original_duration = route.get("duration", 0.0)
        route["distance"] = original_distance + added_distance

        if original_distance > 0 and original_duration > 0:
            avg_speed = original_distance / original_duration
        else:
            avg_speed = DEFAULT_ALIGNMENT_SPEED_MPS

        if avg_speed <= 0:
            avg_speed = DEFAULT_ALIGNMENT_SPEED_MPS

        extra_duration = added_distance / avg_speed
        route["duration"] = original_duration + extra_duration

        legs = route.get("legs") or []
        if legs:
            last_leg = legs[-1]
            last_leg["distance"] = last_leg.get("distance", 0.0) + added_distance
            last_leg["duration"] = last_leg.get("duration", 0.0) + extra_duration
            last_leg["weight"] = last_leg.get("weight", last_leg["duration"])

        metadata = route.setdefault("metadata", {})
        metadata["safepath_adjustments"] = adjustments

    return route, adjustments


def align_osrm_routes(routes: List[dict], start_lat: float, start_lng: float,
                      end_lat: float, end_lng: float) -> Tuple[List[dict], List[List[dict]]]:
    """Align every OSRM route with the requested coordinates."""

    aligned_routes = []
    adjustments_summary = []

    for route in routes:
        aligned_route, adjustments = align_route_geometry_with_request(
            route, start_lat, start_lng, end_lat, end_lng
        )
        aligned_routes.append(aligned_route)
        if adjustments:
            adjustments_summary.append(adjustments)

    return aligned_routes, adjustments_summary

# Phase 2 - Routing API
@app.post("/api/route", response_model=RouteResponse)
async def get_route(route_request: RouteRequest):
    """
    Get route between two points using OSRM API
    
    Input: {"start": [lat, lon], "end": [lat, lon]}
    Returns: GeoJSON LineString with distance and duration
    """
    try:
        start_lat, start_lon = route_request.start
        end_lat, end_lon = route_request.end
        
        # Use environment variable for OSRM URL, fallback to public OSRM
        osrm_base_url = os.getenv("OSRM_DRIVING_URL", "http://router.project-osrm.org")
        osrm_url = f"{osrm_base_url}/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
        params = {
            "overview": "full",
            "geometries": "geojson"
        }
        
        # Make request to OSRM with timeout
        response = requests.get(osrm_url, params=params, timeout=10)
        response.raise_for_status()
        
        osrm_data = response.json()
        
        # Check if routes were found
        if not osrm_data.get("routes"):
            raise HTTPException(status_code=404, detail="No route found between the specified points")
        
        route_data = osrm_data["routes"][0]
        
        # Extract route information
        geometry = route_data["geometry"]
        distance_km = route_data["distance"] / 1000  # Convert meters to kilometers
        duration_seconds = route_data["duration"]
        
        # Convert coordinates to [lat, lon] format for waypoints
        waypoints = [[coord[1], coord[0]] for coord in geometry["coordinates"]]
        
        # Create GeoJSON LineString
        geojson_route = {
            "type": "LineString",
            "coordinates": geometry["coordinates"]  # [lon, lat] format for GeoJSON
        }
        
        return RouteResponse(
            route=geojson_route,
            distance=round(distance_km, 2),
            duration=round(duration_seconds),
            waypoints=waypoints
        )
        
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="OSRM API request timed out")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"OSRM API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Phase 3 - Elevation & Slope API
@app.post("/api/elevation", response_model=ElevationResponse)
async def get_elevation_data(elevation_request: ElevationRequest):
    """
    Get elevation data and calculate slopes for a list of coordinates
    
    Input: {"points": [{"lat": ..., "lon": ...}, ...]}
    Returns: Array of {lat, lon, elevation, slope}
    """
    try:
        points = elevation_request.points
        
        if not points:
            raise HTTPException(status_code=400, detail="No points provided")
        
        # Prepare coordinates for Open-Elevation API
        locations = "|".join([f"{point.lat},{point.lon}" for point in points])
        
        # Call Open-Elevation API
        elevation_url = "https://api.open-elevation.com/api/v1/lookup"
        params = {"locations": locations}
        
        # Make request with timeout
        response = requests.get(elevation_url, params=params, timeout=15)
        response.raise_for_status()
        
        elevation_data = response.json()
        
        # Check if results were returned
        if not elevation_data.get("results"):
            raise HTTPException(status_code=404, detail="No elevation data found for the specified points")
        
        results = elevation_data["results"]
        elevation_points = []
        
        for i, result in enumerate(results):
            elevation = result.get("elevation")
            if elevation is None:
                # Use a default elevation if API returns null
                elevation = 0.0
            
            # Calculate slope for points after the first one
            slope = None
            if i > 0:
                prev_result = results[i-1]
                prev_elevation = prev_result.get("elevation", 0.0)
                
                # Calculate distance between consecutive points
                distance_m = calculate_distance(
                    results[i-1]["latitude"], results[i-1]["longitude"],
                    result["latitude"], result["longitude"]
                )
                
                # Calculate slope percentage
                slope = calculate_slope(prev_elevation, elevation, distance_m)
                slope = round(slope, 2)
            
            elevation_point = ElevationPoint(
                lat=result["latitude"],
                lon=result["longitude"],
                elevation=round(elevation, 1),
                slope=slope
            )
            elevation_points.append(elevation_point)
        
        return ElevationResponse(elevations=elevation_points)
        
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="Open-Elevation API request timed out")
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Open-Elevation API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

# Helper functions for weather endpoints
def get_risk_level(rainfall_mm: float) -> str:
    """Determine risk level based on rainfall amount"""
    if rainfall_mm < 5:
        return "Safe"
    elif rainfall_mm <= 10:
        return "Caution"
    else:
        return "Risky"

async def fetch_weather_data(lat: float, lon: float) -> dict:
    """Fetch weather data from Open-Meteo API (free, no API key required)"""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,rain,wind_speed_10m",
        "hourly": "rain",
        "forecast_days": 1,
        "timezone": "Asia/Manila"
    }
    
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=503, detail=f"Weather API error: {str(e)}")

async def fetch_zamboanga_weather() -> dict:
    """Fetch current weather conditions for Zamboanga City from WeatherAPI.com"""
    WEATHER_API_KEY = "11b60f9fe8df4418a12152441251310"
    LOCATION = "Zamboanga City, Philippines"
    
    try:
        response = requests.get(
            f"https://api.weatherapi.com/v1/current.json",
            params={
                "key": WEATHER_API_KEY,
                "q": LOCATION,
                "aqi": "no"
            },
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        return {
            "temperature_c": data["current"]["temp_c"],
            "condition": data["current"]["condition"]["text"],
            "precipitation_mm": data["current"]["precip_mm"],
            "wind_kph": data["current"]["wind_kph"],
            "humidity": data["current"]["humidity"],
            "condition_code": data["current"]["condition"]["code"]
        }
    except Exception as e:
        logger.warning(f"Weather fetch failed: {e}, using safe defaults")
        # Return safe defaults if API fails
        return {
            "temperature_c": 28.0,
            "condition": "Clear",
            "precipitation_mm": 0.0,
            "wind_kph": 10.0,
            "humidity": 70,
            "condition_code": 1000
        }

@app.get("/api/weather/warnings")
async def get_weather_warnings():
    """Get weather warnings and forecast for the weather dashboard"""
    WEATHER_API_KEY = "11b60f9fe8df4418a12152441251310"
    LOCATION = "Zamboanga City, Philippines"
    
    try:
        # Make request with longer timeout and error handling
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://api.weatherapi.com/v1/forecast.json",
                params={
                    "key": WEATHER_API_KEY,
                    "q": LOCATION,
                    "days": 1,
                    "aqi": "no",
                    "alerts": "yes"  # Include alerts
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Extract relevant data for the dashboard
                current = data.get("current", {})
                forecast = data.get("forecast", {}).get("forecastday", [{}])[0] if data.get("forecast", {}).get("forecastday") else {}
                alerts = data.get("alerts", {}).get("alert", [])
                
                return {
                    "success": True,
                    "current": {
                        "temperature_c": current.get("temp_c", 28),
                        "condition": current.get("condition", {}).get("text", "Clear"),
                        "precipitation_mm": current.get("precip_mm", 0),
                        "wind_kph": current.get("wind_kph", 10),
                        "humidity": current.get("humidity", 70),
                        "pressure_mb": current.get("pressure_mb", 1013),
                        "uv": current.get("uv", 5)
                    },
                    "forecast": {
                        "max_temp_c": forecast.get("day", {}).get("maxtemp_c", 32),
                        "min_temp_c": forecast.get("day", {}).get("mintemp_c", 24),
                        "condition": forecast.get("day", {}).get("condition", {}).get("text", "Partly cloudy"),
                        "chance_of_rain": forecast.get("day", {}).get("daily_chance_of_rain", 20),
                        "total_precip_mm": forecast.get("day", {}).get("totalprecip_mm", 0)
                    },
                    "alerts": [
                        {
                            "headline": alert.get("headline", ""),
                            "desc": alert.get("desc", ""),
                            "severity": alert.get("severity", ""),
                            "areas": alert.get("areas", "")
                        } for alert in alerts
                    ],
                    "last_updated": current.get("last_updated", "")
                }
            else:
                raise Exception(f"WeatherAPI returned status {response.status_code}")
                
    except httpx.TimeoutException:
        logger.warning("Weather API timeout, returning fallback data")
        return {
            "success": False,
            "error": "timeout",
            "fallback": True,
            "current": {
                "temperature_c": 28,
                "condition": "Data unavailable",
                "precipitation_mm": 0,
                "wind_kph": 10,
                "humidity": 70,
                "pressure_mb": 1013,
                "uv": 5
            },
            "forecast": {
                "max_temp_c": 32,
                "min_temp_c": 24,
                "condition": "Partly cloudy",
                "chance_of_rain": 20,
                "total_precip_mm": 0
            },
            "alerts": [],
            "last_updated": "Service unavailable"
        }
    except Exception as e:
        logger.error(f"Weather warnings API error: {e}")
        return {
            "success": False,
            "error": str(e),
            "fallback": True,
            "current": {
                "temperature_c": 28,
                "condition": "Service error",
                "precipitation_mm": 0,
                "wind_kph": 10,
                "humidity": 70,
                "pressure_mb": 1013,
                "uv": 5
            },
            "forecast": {
                "max_temp_c": 32,
                "min_temp_c": 24,
                "condition": "Partly cloudy",
                "chance_of_rain": 20,
                "total_precip_mm": 0
            },
            "alerts": [],
            "last_updated": "Service error"
        }

async def fetch_pagasa_bulletin() -> dict:
    """Fetch PAGASA bulletin data using web scraping - ZAMBOANGA/MINDANAO FOCUSED"""
    try:
        # PAGASA weather bulletins URL
        pagasa_url = "https://www.pagasa.dost.gov.ph/"
        
        # Fetch the page
        response = requests.get(pagasa_url, timeout=15)
        response.raise_for_status()
        
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(response.content, 'html.parser')
        
        bulletins = []
        
        # Try to find weather advisories/bulletins
        # PAGASA typically has these in specific sections
        advisory_sections = soup.find_all('div', class_=['advisory', 'bulletin', 'weather-update'])
        
        if not advisory_sections:
            # Fallback: Look for any content with weather keywords
            advisory_sections = soup.find_all(['article', 'div'], string=lambda text: text and any(
                keyword in text.lower() for keyword in ['advisory', 'bulletin', 'warning', 'rainfall', 'typhoon']
            ))
        
        # Geographic keywords for Zamboanga/Mindanao region
        zamboanga_keywords = [
            'zamboanga', 'mindanao', 'region ix', 'region 9', 'peninsula',
            'basilan', 'sulu', 'tawi-tawi', 'zamboanga del sur', 'zamboanga sibugay',
            'zamboanga del norte', 'southern philippines', 'barmm', 'bangsamoro'
        ]
        
        for section in advisory_sections[:10]:  # Check more sections for regional content
            title_elem = section.find(['h1', 'h2', 'h3', 'h4', 'strong'])
            title = title_elem.get_text(strip=True) if title_elem else "Weather Advisory"
            
            # Get the text content
            text_content = section.get_text(strip=True)
            
            # FILTER: Only include bulletins mentioning Zamboanga/Mindanao
            is_relevant = any(keyword in text_content.lower() for keyword in zamboanga_keywords)
            
            # Also include general Philippines-wide warnings (typhoons, etc.)
            is_general_warning = any(word in text_content.lower() for word in ['typhoon', 'tropical cyclone', 'nationwide'])
            
            if not is_relevant and not is_general_warning:
                continue  # Skip this bulletin - not relevant to Zamboanga
            
            # Try to find timestamp
            time_elem = section.find(['time', 'span'], class_=['date', 'time', 'timestamp'])
            timestamp = time_elem.get_text(strip=True) if time_elem else "Recently updated"
            
            if len(text_content) > 50:  # Only include substantial content
                bulletins.append({
                    "title": title,
                    "content": text_content[:500],  # Limit to 500 chars
                    "timestamp": timestamp,
                    "type": "advisory" if "advisory" in title.lower() else 
                            "typhoon" if "typhoon" in title.lower() else
                            "rainfall" if "rainfall" in title.lower() or "rain" in title.lower() else
                            "general",
                    "region_specific": is_relevant  # Flag if specifically mentions Zamboanga/Mindanao
                })
        
        if bulletins:
            # Sort: Region-specific bulletins first
            bulletins.sort(key=lambda x: (not x.get("region_specific", False), x.get("timestamp", "")))
            
            return {
                "success": True,
                "bulletins": bulletins[:5],  # Limit to 5 most relevant
                "source": "PAGASA",
                "region_filter": "Zamboanga/Mindanao",
                "fetched_at": datetime.now().isoformat()
            }
        else:
            # No bulletins found, return safe status
            return {
                "success": True,
                "bulletins": [],
                "message": "No active weather bulletins for Zamboanga/Mindanao region",
                "source": "PAGASA",
                "region_filter": "Zamboanga/Mindanao",
                "fetched_at": datetime.now().isoformat()
            }
            
    except Exception as e:
        logger.warning(f"Failed to fetch PAGASA bulletin: {e}")
        return {
            "success": False,
            "bulletins": [],
            "message": "Unable to fetch PAGASA data at this time",
            "error": str(e),
            "source": "PAGASA",
            "fetched_at": datetime.now().isoformat()
        }

# Weather endpoints
@app.post("/api/weather", response_model=WeatherResponse)
async def get_weather(request: WeatherRequest):
    """Get current weather data and rainfall forecast with risk assessment"""
    try:
        weather_data = await fetch_weather_data(request.lat, request.lon)
        
        current = weather_data.get("current", {})
        hourly = weather_data.get("hourly", {})
        
        # Extract current weather data
        temperature_c = current.get("temperature_2m", 0.0)
        humidity = current.get("relative_humidity_2m", 0)
        wind_speed = current.get("wind_speed_10m", 0.0)
        current_rain = current.get("rain", 0.0)
        
        # Get next hour rainfall forecast (or use current rainfall)
        rainfall_mm = current_rain
        if hourly.get("rain") and len(hourly["rain"]) > 0:
            rainfall_mm = hourly["rain"][0] if hourly["rain"][0] is not None else current_rain
        
        # Calculate risk level
        risk_level = get_risk_level(rainfall_mm)
        
        return WeatherResponse(
            rainfall_mm=round(rainfall_mm, 2),
            temperature_c=round(temperature_c, 1),
            humidity=int(humidity),
            wind_speed=round(wind_speed, 1),
            risk_level=risk_level
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Weather service error: {str(e)}")

@app.get("/api/pagasa/bulletins")
async def get_pagasa_bulletins():
    """Get latest PAGASA weather bulletins and advisories"""
    try:
        bulletin_data = await fetch_pagasa_bulletin()
        
        return {
            "success": bulletin_data.get("success", True),
            "bulletins": bulletin_data.get("bulletins", []),
            "message": bulletin_data.get("message", ""),
            "source": "PAGASA (https://www.pagasa.dost.gov.ph/)",
            "fetched_at": bulletin_data.get("fetched_at"),
            "count": len(bulletin_data.get("bulletins", []))
        }
        
    except Exception as e:
        logger.error(f"PAGASA bulletin endpoint error: {e}")
        raise HTTPException(status_code=503, detail=f"Unable to fetch PAGASA bulletins: {str(e)}")

@app.get("/api/bulletin", response_model=BulletinResponse)
async def get_typhoon_bulletin():
    """Get latest PAGASA typhoon bulletin (legacy endpoint)"""
    try:
        bulletin_data = await fetch_pagasa_bulletin()
        
        return BulletinResponse(
            title=bulletin_data.get("title"),
            issued_at=bulletin_data.get("issued_at"),
            signal_levels=bulletin_data.get("signal_levels"),
            summary=bulletin_data.get("summary"),
            source="PAGASA",
            message=bulletin_data.get("message")
        )
        
    except Exception as e:
        return BulletinResponse(
            title=None,
            issued_at=None,
            signal_levels=None,
            summary=None,
            source="PAGASA",
            message="No current typhoon bulletins"
        )

# Helper functions for risk analysis
def calculate_risk_score(point: RiskPoint) -> int:
    """Calculate risk score for a single point based on elevation, slope, and rainfall"""
    risk_score = 0
    
    # Elevation risk: < 5m adds 25 points
    if point.elevation is not None and point.elevation < 5:
        risk_score += 25
    
    # Slope risk: downhill < -5% adds 10 points
    if point.slope is not None and point.slope < -5:
        risk_score += 10
    
    # Rainfall risk
    if point.rainfall_mm is not None:
        if point.rainfall_mm >= 20:
            risk_score += 40
        elif point.rainfall_mm >= 10:
            risk_score += 25
    
    return min(risk_score, 100)  # Cap at 100

def get_risk_classification(risk_score: int) -> str:
    """Convert risk score to risk level classification"""
    if risk_score <= 24:
        return "Safe"
    elif risk_score <= 49:
        return "Caution"
    elif risk_score <= 74:
        return "Risky"
    else:
        return "Avoid"

def analyze_route_risk(points: List[RiskPoint]) -> dict:
    """Analyze risk for a complete route and return segments and overall risk"""
    segments = []
    total_risk = 0
    
    for point in points:
        risk_score = calculate_risk_score(point)
        risk_level = get_risk_classification(risk_score)
        
        segments.append(RiskSegment(
            lat=point.lat,
            lon=point.lon,
            risk_score=risk_score,
            risk_level=risk_level
        ))
        
        total_risk += risk_score
    
    overall_risk = int(total_risk / len(points)) if points else 0
    overall_level = get_risk_classification(overall_risk)
    
    return {
        "segments": segments,
        "overall_risk": overall_risk,
        "overall_level": overall_level
    }

# Risk analysis endpoints
@app.post("/api/risk", response_model=RiskResponse)
async def calculate_route_risk(request: RiskRequest):
    """Calculate risk scores for route points based on elevation, slope, and rainfall"""
    try:
        if not request.points:
            raise HTTPException(status_code=400, detail="No points provided for risk analysis")
        
        risk_analysis = analyze_route_risk(request.points)
        
        return RiskResponse(
            segments=risk_analysis["segments"],
            overall_risk=risk_analysis["overall_risk"],
            overall_level=risk_analysis["overall_level"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Risk analysis error: {str(e)}")

@app.post("/api/safe-route", response_model=SafeRouteResponse)
async def find_safest_route(request: SafeRouteRequest):
    """Compare multiple routes and recommend the safest option"""
    try:
        if not request.routes:
            raise HTTPException(status_code=400, detail="No routes provided for comparison")
        
        evaluated_routes = []
        
        # Analyze each route
        for route in request.routes:
            if not route.points:
                continue  # Skip routes with no points
                
            risk_analysis = analyze_route_risk(route.points)
            
            evaluated_route = EvaluatedRoute(
                id=route.id,
                overall_risk=risk_analysis["overall_risk"],
                overall_level=risk_analysis["overall_level"]
            )
            
            evaluated_routes.append(evaluated_route)
        
        if not evaluated_routes:
            raise HTTPException(status_code=400, detail="No valid routes found for analysis")
        
        # Find the route with the lowest risk score
        recommended = min(evaluated_routes, key=lambda x: x.overall_risk)
        
        return SafeRouteResponse(
            evaluated_routes=evaluated_routes,
            recommended=recommended
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Safe route analysis error: {str(e)}")

# Enhanced safe route filtering functions
async def get_route_with_alternatives(start_lat: float, start_lng: float, end_lat: float, end_lng: float) -> List[dict]:
    """Get default route and alternatives from OSRM"""
    routes = []
    
    # Get default route
    try:
        coordinates = f"{start_lng},{start_lat};{end_lng},{end_lat}"
        # Use environment variable for OSRM URL
        osrm_base_url = os.getenv("OSRM_DRIVING_URL", "http://router.project-osrm.org")
        url = f"{osrm_base_url}/route/v1/driving/{coordinates}"
        params = {
            "overview": "full",
            "geometries": "geojson"
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get("routes"):
            route = data["routes"][0]
            routes.append({
                "id": "default",
                "geometry": route["geometry"],
                "distance": route["distance"] / 1000,  # Convert to km
                "duration": route["duration"]
            })
    except Exception as e:
        print(f"Error getting default route: {e}")
    
    # Get alternative routes
    try:
        # Use environment variable for OSRM URL
        osrm_base_url = os.getenv("OSRM_DRIVING_URL", "http://router.project-osrm.org")
        url = f"{osrm_base_url}/route/v1/driving/{coordinates}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "alternatives": "true",
            "alternative": 2
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data.get("routes") and len(data["routes"]) > 1:
            for i, route in enumerate(data["routes"][1:], 1):
                routes.append({
                    "id": f"alt{i}",
                    "geometry": route["geometry"],
                    "distance": route["distance"] / 1000,  # Convert to km
                    "duration": route["duration"]
                })
    except Exception as e:
        print(f"Error getting alternative routes: {e}")
    
    return routes

async def get_weather_for_coordinates(coordinates: List[List[float]]) -> List[float]:
    """Get weather data for a list of coordinates"""
    weather_data = []
    
    # Sample every 5th coordinate to reduce API calls
    sample_coords = coordinates[::5] if len(coordinates) > 10 else coordinates
    
    for coord in sample_coords:
        try:
            lat, lng = coord[1], coord[0]  # GeoJSON is [lng, lat]
            weather_result = await fetch_weather_data(lat, lng)
            
            current = weather_result.get("current", {})
            rainfall = current.get("rain", 0.0)
            
            # Extend the rainfall data to cover multiple points
            points_per_sample = len(coordinates) // len(sample_coords) if len(sample_coords) > 0 else 1
            weather_data.extend([rainfall] * points_per_sample)
            
        except Exception as e:
            weather_data.extend([0.0] * (len(coordinates) // len(sample_coords)))
    
    # Ensure we have the right number of data points
    while len(weather_data) < len(coordinates):
        weather_data.append(0.0)
    
    return weather_data[:len(coordinates)]

async def analyze_detailed_route(route: dict) -> DetailedRoute:
    """Analyze a route with detailed segment information"""
    coordinates = route["geometry"]["coordinates"]
    
    # Get elevation data
    elevation_request = {
        "locations": [{"latitude": coord[1], "longitude": coord[0]} for coord in coordinates[::5]]  # Sample coordinates
    }
    
    try:
        elevation_response = requests.post(
            "https://api.open-elevation.com/api/v1/lookup",
            json=elevation_request,
            timeout=10
        )
        elevation_response.raise_for_status()
        elevation_data = elevation_response.json()["results"]
    except Exception:
        elevation_data = [{"elevation": 0}] * len(coordinates)
    
    # Get weather data
    weather_data = await get_weather_for_coordinates(coordinates)
    
    # Create detailed segments
    segments = []
    total_risk = 0
    
    for i, coord in enumerate(coordinates):
        lat, lng = coord[1], coord[0]
        
        # Get elevation (interpolate if needed)
        elev_idx = min(i // 5, len(elevation_data) - 1)
        elevation = elevation_data[elev_idx]["elevation"]
        
        # Calculate slope
        slope = 0.0
        if i > 0:
            prev_coord = coordinates[i-1]
            prev_elev_idx = min((i-1) // 5, len(elevation_data) - 1)
            prev_elevation = elevation_data[prev_elev_idx]["elevation"]
            
            distance = calculate_distance(prev_coord[1], prev_coord[0], lat, lng) * 1000  # Convert to meters
            if distance > 0:
                slope = ((elevation - prev_elevation) / distance) * 100  # Percentage
        
        # Get rainfall
        rainfall_idx = min(i, len(weather_data) - 1)
        rainfall = weather_data[rainfall_idx]
        
        # Create risk point and calculate risk
        risk_point = RiskPoint(
            lat=lat,
            lon=lng,
            elevation=elevation,
            slope=slope,
            rainfall_mm=rainfall
        )
        
        risk_score = calculate_risk_score(risk_point)
        risk_level = get_risk_classification(risk_score)
        
        segment = RouteSegment(
            lat=lat,
            lng=lng,
            elevation=elevation,
            slope=round(slope, 2),
            rainfall_mm=round(rainfall, 2),
            risk_score=risk_score,
            risk_level=risk_level
        )
        
        segments.append(segment)
        total_risk += risk_score
    
    overall_risk = int(total_risk / len(segments)) if segments else 0
    overall_level = get_risk_classification(overall_risk)
    
    return DetailedRoute(
        id=route["id"],
        segments=segments,
        overall_risk=overall_risk,
        overall_level=overall_level,
        distance=route["distance"],
        duration=route["duration"],
        geometry=route["geometry"]
    )

@app.post("/api/safe-route-filter", response_model=EnhancedSafeRouteResponse)
async def find_safest_route_with_filtering(request: SafeRouteFilterRequest):
    """Find the safest route using Option A: Filter after routing"""
    try:
        # Step 1: Get default route and alternatives from OSRM
        routes = await get_route_with_alternatives(
            request.start_lat, request.start_lng,
            request.end_lat, request.end_lng
        )
        
        if not routes:
            raise HTTPException(status_code=404, detail="No routes found")
        
        # Step 2: Analyze each route with detailed risk assessment
        detailed_routes = []
        
        for route in routes:
            try:
                detailed_route = await analyze_detailed_route(route)
                detailed_routes.append(detailed_route)
            except Exception as e:
                print(f"Error analyzing route {route['id']}: {e}")
                continue
        
        if not detailed_routes:
            raise HTTPException(status_code=500, detail="Failed to analyze any routes")
        
        # Step 3: Find the route with the lowest overall risk
        recommended = min(detailed_routes, key=lambda x: x.overall_risk)
        
        return EnhancedSafeRouteResponse(
            evaluated_routes=detailed_routes,
            recommended=recommended
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enhanced safe route analysis error: {str(e)}")

# Analytics endpoints
@app.get("/api/analytics/routes-summary")
async def get_routes_summary(db: Session = Depends(get_db)):
    """Get summary statistics for routes"""
    total_routes = db.query(RouteHistory).count()
    completed_routes = db.query(RouteHistory).filter(RouteHistory.status == "completed").count()
    favorite_routes = db.query(FavoriteRoute).count()
    recent_searches = db.query(SearchHistory).count()
    
    return {
        "total_routes": total_routes,
        "completed_routes": completed_routes,
        "completion_rate": round((completed_routes / total_routes * 100) if total_routes > 0 else 0, 1),
        "favorite_routes": favorite_routes,
        "recent_searches": recent_searches
    }

# Routing services are initialized via get_routing_service() and get_flood_service()

@app.on_event("startup")
async def startup_event():
    """Initialize routing and flood services on startup"""
    try:
        # Initialize routing service (zcroadmap.geojson - has highway classification)
        routing_service = get_routing_service()
        print(f"✓ Routing service loaded with {len(routing_service.road_segments)} road segments from zcroadmap.geojson")
        
        # Initialize flood service (terrain_roads.geojson - has flood data)
        flood_service = get_flood_service()
        print(f"✓ Flood service loaded with {len(flood_service.road_segments)} road segments from terrain_roads.geojson")
        
    except Exception as e:
        print(f"✗ Failed to load routing services: {e}")
            
    # Initialize admin user
    db = SessionLocal()
    try:
        # Create admin tables
        from models import Base
        Base.metadata.create_all(bind=engine)
        init_admin_user(db)
        init_demo_user(db)
    finally:
        db.close()

async def get_local_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float, mode: str = "car", risk_profile: str = "safe"):
    """Get route using local routing service with specific transportation mode and flood risk profile
    
    Args:
        mode: Transportation mode (car/motorcycle/walking) - affects speed and road preferences
        risk_profile: Flood risk tolerance (safe/manageable/prone) - affects flood avoidance
    """
    routing_service = get_routing_service()
    
    if not routing_service or not routing_service.loaded:
        return None
    
    try:
        # Create coordinate objects
        start_coord = Coordinate(lat=start_lat, lng=start_lng)
        end_coord = Coordinate(lat=end_lat, lng=end_lng)
        
        # Calculate route using local routing with specific mode and risk profile
        route = routing_service.calculate_route(start_coord, end_coord, mode, risk_profile)
        
        if not route:
            return None
        
        # Get route information with mode-specific calculations
        route_info = routing_service.get_route_info(route, mode)
        
        return {
            "success": True,
            "route": [{"lat": coord.lat, "lng": coord.lng} for coord in route],
            "distance": route_info["distance"],
            "duration": route_info["duration"],
            "source": "local_geojson_terrain",
            "risk_profile": risk_profile
        }
        
    except Exception as e:
        print(f"Local routing error: {e}")
        return None

@app.post("/api/routing/calculate", response_model=LocalRouteResponse)
async def calculate_local_route(route_request: LocalRouteRequest):
    """
    Calculate route using local GeoJSON road network data
    
    Input: {"start": [lat, lng], "end": [lat, lng]}
    Returns: Route with waypoints following actual roads in Zamboanga City
    """
    routing_service = get_routing_service()
    
    if not routing_service or not routing_service.loaded:
        raise HTTPException(status_code=503, detail="Local routing service not available")
    
    try:
        start_lat, start_lng = route_request.start
        end_lat, end_lng = route_request.end
        
        # Create coordinate objects
        start_coord = Coordinate(lat=start_lat, lng=start_lng)
        end_coord = Coordinate(lat=end_lat, lng=end_lng)
        
        # Calculate route using local routing
        route = routing_service.calculate_route(start_coord, end_coord)
        
        if not route:
            return LocalRouteResponse(
                success=False,
                route=[],
                distance=0,
                duration=0,
                message="No route found between the specified points"
            )
        
        # Convert route coordinates to [lat, lng] format
        waypoints = [[coord.lat, coord.lng] for coord in route]
        
        # Get route information
        route_info = routing_service.get_route_info(route)
        
        return LocalRouteResponse(
            success=True,
            route=waypoints,
            distance=route_info["distance"],
            duration=route_info["duration"],
            message=f"Route calculated with {len(waypoints)} waypoints"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating route: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)


@app.get("/local-route")
async def local_route(
    start: str = Query(..., description="Start coordinates as 'lat,lng'"),
    end: str = Query(..., description="End coordinates as 'lat,lng'"),
    waypoints: Optional[str] = Query(None, description="Optional waypoints as 'lng,lat;lng,lat;...'"),
    transport_mode: str = Query("car", description="Transportation mode: car, motorcycle, walking, public_transport, bicycle, truck")
):
    """
    Calculate flood-aware routes using OSRM + terrain flood data.
    REDIRECTS to the new /api/routing/flood-routes endpoint for better performance.
    
    Example: /local-route?start=6.9214,122.0790&end=6.9100,122.0850
    """
    try:
        # Parse start coordinate (lat,lng)
        start_parts = start.split(',')
        if len(start_parts) != 2:
            raise HTTPException(status_code=400, detail="Start coordinate must be in format 'lat,lng'")
        start_lat, start_lng = float(start_parts[0]), float(start_parts[1])
        
        # Parse end coordinate (lat,lng)
        end_parts = end.split(',')
        if len(end_parts) != 2:
            raise HTTPException(status_code=400, detail="End coordinate must be in format 'lat,lng'")
        end_lat, end_lng = float(end_parts[0]), float(end_parts[1])
        
        # Parse waypoints if provided (lng,lat;lng,lat;...)
        waypoint_list = None
        if waypoints:
            waypoint_list = []
            for wp_str in waypoints.split(';'):
                wp_parts = wp_str.split(',')
                if len(wp_parts) == 2:
                    waypoint_list.append({
                        "lng": float(wp_parts[0]),
                        "lat": float(wp_parts[1])
                    })
        
        # Use the new OSRM-based flood routing endpoint (much faster!)
        from routes.flood_routing import get_flood_aware_routes, FloodRouteRequest
        
        request = FloodRouteRequest(
            start_lat=start_lat,
            start_lng=start_lng,
            end_lat=end_lat,
            end_lng=end_lng,
            waypoints=waypoint_list,
            weather_data=None,
            transport_mode=transport_mode
        )
        
        response = await get_flood_aware_routes(request)
        
        # Convert to the format expected by frontend
        return {
            "success": True,
            "routes": response.routes,
            "analyses": [
                {
                    "waypoints": [{"lat": coord[1], "lng": coord[0]} for coord in route["geometry"]["coordinates"]],
                    "distance": f"{route['distance'] / 1000:.1f} km",
                    "time": f"{int(route['duration'] / 60)} min",
                    "flooded_distance_m": route.get("flooded_distance", 0),
                    "flooded_percentage": route.get("flood_percentage", 0),
                    "risk_level": route.get("label", "unknown"),
                    "description": f"{route.get('flood_percentage', 0):.1f}% flooded ({route.get('flooded_distance', 0)/1000:.2f} km)"
                }
                for route in response.routes
            ],
            "message": response.message
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid coordinate format: {str(e)}")
    except Exception as e:
        logger.error(f"Error calculating route: {e}", exc_info=True) 
        raise HTTPException(status_code=500, detail=f"Error calculating route: {str(e)}")