from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Optional, Tuple
import os
import requests
import math
import json
import time
from dotenv import load_dotenv
from services.local_routing import LocalRoutingService, Coordinate

# Import models
from models import Base, RouteHistory, FavoriteRoute, SearchHistory, AdminUser, Report, User

# Import admin routes
from routes.admin import router as admin_router, init_admin_user
from routes.user_auth import router as user_auth_router, init_demo_user

# Load environment variables
load_dotenv()

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://safepathzc_user:safepath123@localhost:5432/safepathzc")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables
Base.metadata.create_all(bind=engine)

# Pydantic models for API

class FavoriteRoute(Base):
    __tablename__ = "favorite_routes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    from_location = Column(String, nullable=False)
    to_location = Column(String, nullable=False)
    from_lat = Column(Float, nullable=True)
    from_lng = Column(Float, nullable=True)
    to_lat = Column(Float, nullable=True)
    to_lng = Column(Float, nullable=True)
    frequency = Column(String, default="Weekly")  # Daily, Weekly, Monthly
    avg_duration = Column(String, nullable=False)
    last_used = Column(DateTime, default=datetime.utcnow)
    risk_level = Column(String, default="low")  # low, moderate, high
    user_id = Column(String, default="default_user")

class SearchHistory(Base):
    __tablename__ = "search_history"
    
    id = Column(Integer, primary_key=True, index=True)
    query = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    results_count = Column(Integer, default=0)
    user_id = Column(String, default="default_user")

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    role = Column(String, default="user")  # user, admin, moderator
    is_active = Column(Boolean, default=True)
    community_points = Column(Integer, default=0)
    routes_used = Column(Integer, default=0)
    reports_submitted = Column(Integer, default=0)
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)

class AdminUser(Base):
    __tablename__ = "admin_users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, default="admin")  # admin, moderator
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False)  # flood, road_closure, accident, emergency, infrastructure, other
    urgency = Column(String, default="medium")  # low, medium, high, critical
    status = Column(String, default="pending")  # pending, approved, rejected, under_review
    is_visible = Column(Boolean, default=False)
    
    # Location data
    location_lat = Column(Float, nullable=False)
    location_lng = Column(Float, nullable=False)
    location_address = Column(String, nullable=False)
    
    # Reporter data
    reporter_name = Column(String, nullable=False)
    reporter_email = Column(String, nullable=False)
    reporter_id = Column(String, default="anonymous")
    
    # Admin data
    admin_notes = Column(Text, nullable=True)
    verification_score = Column(Float, default=0.0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

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
    route: List[List[float]]  # Array of [lat, lng] coordinates
    distance: float  # in meters
    duration: float  # in seconds
    message: str

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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include admin routes
app.include_router(admin_router)
app.include_router(user_auth_router)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Root endpoint for health check
@app.get("/")
async def root():
    return {"message": "SafePathZC Routes API is running", "status": "healthy", "version": "1.0.0"}

# Enhanced Routing and Risk Analysis Endpoints

# Helper functions for OSRM routing
OSRM_ALIGNMENT_THRESHOLD_METERS = 75.0
DEFAULT_ALIGNMENT_SPEED_MPS = 8.33  # ~30 km/h fallback when OSRM provides no timing context

async def get_osrm_route(start_lng: float, start_lat: float, end_lng: float, end_lat: float, alternatives: bool = False):
    """Get route from OSRM routing service with robust error handling"""
    try:
        base_url = "http://router.project-osrm.org/route/v1/driving"
        url = f"{base_url}/{start_lng},{start_lat};{end_lng},{end_lat}"
        
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
                return data
            else:
                raise Exception("No routes found in OSRM response")
        else:
            raise Exception(f"OSRM API returned {response.status_code}: {response.text}")
            
    except requests.exceptions.Timeout:
        print("OSRM timeout - generating fallback route")
        # Generate a simple fallback route
        return {
            "routes": [{
                "distance": 5000,  # 5km estimate
                "duration": 600,   # 10min estimate
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[start_lng, start_lat], [end_lng, end_lat]]
                }
            }],
            "code": "Ok"
        }
    except Exception as e:
        print(f"OSRM error: {e}")
        raise HTTPException(status_code=500, detail=f"Routing service error: {str(e)}")

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

@app.get("/route")
async def get_route(
    start: str = Query(..., description="Start coordinates as lng,lat"),
    end: str = Query(..., description="End coordinates as lng,lat"),
    alternatives: bool = Query(False, description="Include alternative routes")
):
    """Get routing data between two points using local road network"""
    try:
        # Parse coordinates
        start_coords = [float(x) for x in start.split(",")]
        end_coords = [float(x) for x in end.split(",")]
        
        if len(start_coords) != 2 or len(end_coords) != 2:
            raise HTTPException(status_code=400, detail="Invalid coordinate format")
        
        start_lng, start_lat = start_coords
        end_lng, end_lat = end_coords
        
        # Try local routing service first with multiple route alternatives
        try:
            # Generate multiple routes with different risk profiles
            safe_route = await get_local_route(start_lat, start_lng, end_lat, end_lng, mode="car")
            manageable_route = await get_local_route(start_lat, start_lng, end_lat, end_lng, mode="motorcycle") 
            prone_route = await get_local_route(start_lat, start_lng, end_lat, end_lng, mode="walking")
            
            routes = []
            analyses = []
            
            if safe_route and safe_route.get("success"):
                routes.append(safe_route["route"])
                analyses.append({
                    "risk_level": "safe",
                    "distance": safe_route.get("distance", 0),
                    "duration": safe_route.get("duration", 0),
                    "description": "Recommended safe route using main roads"
                })
            
            if manageable_route and manageable_route.get("success"):
                routes.append(manageable_route["route"])
                analyses.append({
                    "risk_level": "manageable", 
                    "distance": manageable_route.get("distance", 0),
                    "duration": manageable_route.get("duration", 0),
                    "description": "Alternative route with manageable risk"
                })
                
            if prone_route and prone_route.get("success"):
                routes.append(prone_route["route"])
                analyses.append({
                    "risk_level": "prone",
                    "distance": prone_route.get("distance", 0), 
                    "duration": prone_route.get("duration", 0),
                    "description": "High risk route through flood-prone areas"
                })
            
            if routes:
                print(f"✅ Generated {len(routes)} local routes with different risk profiles")
                return {
                    "routes": routes,
                    "analyses": analyses,
                    "source": "local_geojson_multi"
                }
        except Exception as local_error:
            print(f"⚠️ Local routing failed: {local_error}")
        
        # Fallback to OSRM with multiple route generation strategies
        print(f"🌐 Falling back to OSRM routing with multiple route strategies")
        
        try:
            # Strategy 1: Try OSRM alternatives first
            route_data = await get_osrm_route(start_lng, start_lat, end_lng, end_lat, alternatives=True)

            if route_data.get("routes") and len(route_data["routes"]) >= 2:
                aligned_routes, adjustments = align_osrm_routes(
                    route_data["routes"], start_lat, start_lng, end_lat, end_lng
                )
                if adjustments:
                    print(f"🔧 Adjusted {len(adjustments)} OSRM alternative routes to reach the requested endpoints")

                return {
                    "routes": aligned_routes,
                    "waypoints": route_data.get("waypoints", []),
                    "source": "osrm_alternatives",
                    "adjustments": adjustments
                }
            
            # Strategy 2: Generate different routes using waypoint variations
            print("🔄 Generating route variations using different strategies...")
            routes = []
            
            # Main direct route
            main_route = await get_osrm_route(start_lng, start_lat, end_lng, end_lat, alternatives=False)
            if main_route.get("routes"):
                aligned_main_routes, adjustments = align_osrm_routes(
                    main_route["routes"], start_lat, start_lng, end_lat, end_lng
                )
                if adjustments:
                    print(f"🔧 Adjusted main OSRM route to reconnect missing segments ({len(adjustments)} fixes)")
                routes.extend(aligned_main_routes)
            
            # Try to generate alternative routes by using intermediate waypoints
            try:
                # Calculate intermediate points for alternative routes
                mid_lng = (start_lng + end_lng) / 2
                mid_lat = (start_lat + end_lat) / 2
                
                # Offset points to create different paths
                offset = 0.01  # About 1km offset
                
                # Route via northern waypoint
                north_waypoint_lng = mid_lng
                north_waypoint_lat = mid_lat + offset
                
                north_route_part1 = await get_osrm_route(start_lng, start_lat, north_waypoint_lng, north_waypoint_lat, alternatives=False)
                north_route_part2 = await get_osrm_route(north_waypoint_lng, north_waypoint_lat, end_lng, end_lat, alternatives=False)
                
                if (north_route_part1.get("routes") and north_route_part2.get("routes") and 
                    len(north_route_part1["routes"]) > 0 and len(north_route_part2["routes"]) > 0):
                    
                    # Combine the two route parts
                    part1_coords = north_route_part1["routes"][0]["geometry"]["coordinates"]
                    part2_coords = north_route_part2["routes"][0]["geometry"]["coordinates"]
                    combined_coords = part1_coords + part2_coords[1:]  # Remove duplicate waypoint
                    
                    combined_distance = north_route_part1["routes"][0]["distance"] + north_route_part2["routes"][0]["distance"]
                    combined_duration = north_route_part1["routes"][0]["duration"] + north_route_part2["routes"][0]["duration"]
                    
                    alternative_route = {
                        "geometry": {
                            "coordinates": combined_coords,
                            "type": "LineString"
                        },
                        "distance": combined_distance,
                        "duration": combined_duration,
                        "weight": combined_duration,
                        "weight_name": "routability",
                        "legs": [
                            {
                                "steps": [],
                                "summary": "",
                                "weight": combined_duration,
                                "duration": combined_duration,
                                "distance": combined_distance
                            }
                        ]
                    }
                    aligned_route, adjustments = align_route_geometry_with_request(
                        alternative_route, start_lat, start_lng, end_lat, end_lng
                    )
                    routes.append(aligned_route)
                    if adjustments:
                        print("✅ Generated northern alternative route with endpoint corrections")
                    else:
                        print("✅ Generated northern alternative route")
                
                # Route via southern waypoint  
                south_waypoint_lng = mid_lng
                south_waypoint_lat = mid_lat - offset
                
                south_route_part1 = await get_osrm_route(start_lng, start_lat, south_waypoint_lng, south_waypoint_lat, alternatives=False)
                south_route_part2 = await get_osrm_route(south_waypoint_lng, south_waypoint_lat, end_lng, end_lat, alternatives=False)
                
                if (south_route_part1.get("routes") and south_route_part2.get("routes") and 
                    len(south_route_part1["routes"]) > 0 and len(south_route_part2["routes"]) > 0):
                    
                    # Combine the two route parts
                    part1_coords = south_route_part1["routes"][0]["geometry"]["coordinates"]
                    part2_coords = south_route_part2["routes"][0]["geometry"]["coordinates"]
                    combined_coords = part1_coords + part2_coords[1:]  # Remove duplicate waypoint
                    
                    combined_distance = south_route_part1["routes"][0]["distance"] + south_route_part2["routes"][0]["distance"]
                    combined_duration = south_route_part1["routes"][0]["duration"] + south_route_part2["routes"][0]["duration"]
                    
                    alternative_route = {
                        "geometry": {
                            "coordinates": combined_coords,
                            "type": "LineString"
                        },
                        "distance": combined_distance,
                        "duration": combined_duration * 1.1,  # Add penalty for alternative route
                        "weight": combined_duration * 1.1,
                        "weight_name": "routability",
                        "legs": [
                            {
                                "steps": [],
                                "summary": "",
                                "weight": combined_duration * 1.1,
                                "duration": combined_duration * 1.1,
                                "distance": combined_distance
                            }
                        ]
                    }
                    aligned_route, adjustments = align_route_geometry_with_request(
                        alternative_route, start_lat, start_lng, end_lat, end_lng
                    )
                    routes.append(aligned_route)
                    if adjustments:
                        print("✅ Generated southern alternative route with endpoint corrections")
                    else:
                        print("✅ Generated southern alternative route")
                    
            except Exception as waypoint_error:
                print(f"⚠️ Could not generate waypoint alternatives: {waypoint_error}")
            
            if routes:
                print(f"🎯 Generated {len(routes)} total routes (including alternatives)")
                adjustments_summary = [
                    route.get("metadata", {}).get("safepath_adjustments", [])
                    for route in routes
                    if route.get("metadata", {}).get("safepath_adjustments")
                ]
                return {
                    "routes": routes,
                    "waypoints": [],
                    "source": "osrm_generated_alternatives",
                    "adjustments": adjustments_summary
                }
            else:
                # Final fallback - just return the main route
                route_data = await get_osrm_route(start_lng, start_lat, end_lng, end_lat, alternatives=False)
                aligned_routes, adjustments = align_osrm_routes(
                    route_data.get("routes", []), start_lat, start_lng, end_lat, end_lng
                )
                if adjustments:
                    print(f"🔧 Adjusted fallback OSRM route ({len(adjustments)} corrections)")
                return {
                    "routes": aligned_routes,
                    "waypoints": route_data.get("waypoints", []),
                    "source": "osrm_single",
                    "adjustments": adjustments
                }
                
        except Exception as osrm_error:
            print(f"❌ OSRM routing failed: {osrm_error}")
            raise HTTPException(status_code=500, detail="All routing services failed")
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid coordinate format")
    except Exception as e:
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
        
        # Call OSRM API
        osrm_url = f"http://router.project-osrm.org/route/v1/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
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

async def fetch_pagasa_bulletin() -> dict:
    """Fetch PAGASA bulletin data - simplified implementation"""
    # Note: This is a simplified implementation. In production, you would:
    # 1. Use the pagasa-parser library or scrape PAGASA website
    # 2. Parse actual bulletin data
    # 3. Handle various bulletin formats
    
    try:
        # For now, we'll simulate checking PAGASA's public API or RSS feed
        # In a real implementation, you'd use pagasa-parser or scrape their website
        pagasa_url = "https://www.pagasa.dost.gov.ph/"
        
        # This is a placeholder - in real implementation you'd parse actual bulletin data
        return {
            "title": None,
            "issued_at": None,
            "signal_levels": None,
            "summary": None,
            "message": "No current typhoon bulletins"
        }
    except Exception as e:
        return {
            "title": None,
            "issued_at": None, 
            "signal_levels": None,
            "summary": None,
            "message": "No current typhoon bulletins"
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

@app.get("/api/bulletin", response_model=BulletinResponse)
async def get_typhoon_bulletin():
    """Get latest PAGASA typhoon bulletin"""
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
        url = f"http://router.project-osrm.org/route/v1/driving/{coordinates}"
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
        url = f"http://router.project-osrm.org/route/v1/driving/{coordinates}"
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

# Initialize local routing service
local_routing_service = None

@app.on_event("startup")
async def startup_event():
    global local_routing_service
    try:
        geojson_path = os.path.join(os.path.dirname(__file__), "data", "terrain_roads.geojson")
        local_routing_service = LocalRoutingService(geojson_path)
        success = local_routing_service.load_road_network()
        if success:
            print(f"✓ Local routing service loaded with {len(local_routing_service.road_segments)} road segments")
        else:
            print("✗ Failed to load local routing service")
            
        # Initialize admin user
        db = SessionLocal()
        try:
            # Create admin tables
            from routes.admin import Base as AdminBase
            AdminBase.metadata.create_all(bind=engine)
            init_admin_user(db)
            init_demo_user(db)
        finally:
            db.close()
    except Exception as e:
        print(f"✗ Error initializing local routing service: {e}")

async def get_local_route(start_lat: float, start_lng: float, end_lat: float, end_lng: float, mode: str = "car"):
    """Get route using local routing service with specific transportation mode"""
    global local_routing_service
    
    if not local_routing_service or not local_routing_service.loaded:
        return None
    
    try:
        # Create coordinate objects
        start_coord = Coordinate(lat=start_lat, lng=start_lng)
        end_coord = Coordinate(lat=end_lat, lng=end_lng)
        
        # Calculate route using local routing with specific mode
        route = local_routing_service.calculate_route(start_coord, end_coord, mode)
        
        if not route:
            return None
        
        # Get route information with mode-specific calculations
        route_info = local_routing_service.get_route_info(route, mode)
        
        return {
            "success": True,
            "route": [{"lat": coord.lat, "lng": coord.lng} for coord in route],
            "distance": route_info["distance"],
            "duration": route_info["duration"],
            "source": "local_geojson_terrain"
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
    global local_routing_service
    
    if not local_routing_service or not local_routing_service.loaded:
        raise HTTPException(status_code=503, detail="Local routing service not available")
    
    try:
        start_lat, start_lng = route_request.start
        end_lat, end_lng = route_request.end
        
        # Create coordinate objects
        start_coord = Coordinate(lat=start_lat, lng=start_lng)
        end_coord = Coordinate(lat=end_lat, lng=end_lng)
        
        # Calculate route using local routing
        route = local_routing_service.calculate_route(start_coord, end_coord)
        
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
        route_info = local_routing_service.get_route_info(route)
        
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
