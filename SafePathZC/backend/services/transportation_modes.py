# Transportation mode configurations for SafePath routing
# Matches the frontend TransportationSelector.tsx configurations

import os

# Get OSRM URLs from environment variables with Railway-friendly fallbacks
def normalize_osrm_url(url: str) -> str:
    """Normalize OSRM URL to ensure it has proper protocol"""
    if not url:
        return "http://localhost:5000"
    
    # If URL already has protocol, return as-is
    if url.startswith(('http://', 'https://')):
        return url
    
    # If it looks like a Railway domain, add https
    if 'railway.app' in url or 'railway.com' in url:
        return f"https://{url}"
    
    # Default to http for localhost or other domains
    return f"http://{url}"

OSRM_DRIVING_BASE = normalize_osrm_url(os.getenv("OSRM_DRIVING_URL", "http://localhost:5000"))
OSRM_WALKING_BASE = normalize_osrm_url(os.getenv("OSRM_WALKING_URL", "http://localhost:5001"))
OSRM_BICYCLE_BASE = normalize_osrm_url(os.getenv("OSRM_BICYCLE_URL", "http://localhost:5002"))
OSRM_TRUCK_BASE = normalize_osrm_url(os.getenv("OSRM_TRUCK_URL", "http://localhost:5003"))  # NEW: Truck OSRM endpoint
OSRM_JEEPNEY_BASE = normalize_osrm_url(os.getenv("OSRM_JEEPNEY_URL", "http://localhost:5004"))  # NEW: Jeepney OSRM endpoint

# Railway deployment fallbacks - use driving service for unavailable modes
def get_fallback_osrm_url(preferred_url: str, fallback_url: str = None) -> str:
    """Get OSRM URL with fallback for Railway deployment"""
    if fallback_url is None:
        fallback_url = OSRM_DRIVING_BASE
    
    # For Railway/production, if the specialized service URL is localhost, use fallback
    # Check for Railway environment or if we're not in local development
    is_production = os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("PORT") or not preferred_url.startswith("http://localhost:")
    
    if preferred_url.startswith("http://localhost:") and is_production:
        print(f"🚨 Railway/Production detected: Using fallback {fallback_url} instead of {preferred_url}")
        return fallback_url
    return preferred_url

TRANSPORTATION_MODES = {
    'car': {
        'name': 'Car',
        'ground_clearance_cm': 20,
        'max_flood_depth_cm': 15,
        'can_use_footpaths': False,
        'can_use_main_roads': True,
        'can_use_highways': True,
        'speed_factor': 1.0,
        'osrm_profile': 'driving',
        'osrm_url': OSRM_DRIVING_BASE,
    },
    'motorcycle': {
        'name': 'Motorcycle',
        'ground_clearance_cm': 15,
        'max_flood_depth_cm': 10,
        'can_use_footpaths': False,
        'can_use_main_roads': True,
        'can_use_highways': True,
        'speed_factor': 0.9,
        'osrm_profile': 'bicycle',  # Use bicycle profile (motorcycles can navigate smaller roads)
        'osrm_url': OSRM_BICYCLE_BASE,
    },
    'walking': {
        'name': 'Walking',
        'ground_clearance_cm': 0,
        'max_flood_depth_cm': 30,  # Humans can wade through deeper water
        'can_use_footpaths': True,
        'can_use_main_roads': False,  # Prefer sidewalks
        'can_use_highways': False,
        'speed_factor': 0.1,
        'osrm_profile': 'foot',  # Use foot profile for pedestrian routing
        'osrm_url': OSRM_WALKING_BASE,
    },
    'public_transport': {
        'name': 'Public Transport',
        'ground_clearance_cm': 35,
        'max_flood_depth_cm': 25,
        'can_use_footpaths': False,
        'can_use_main_roads': True,
        'can_use_highways': True,
        'speed_factor': 0.6,
        'osrm_profile': 'jeepney',  # Use jeepney profile for public transport routing
        'osrm_url': OSRM_JEEPNEY_BASE,
    },
    'bicycle': {
        'name': 'Bicycle',
        'ground_clearance_cm': 5,
        'max_flood_depth_cm': 5,
        'can_use_footpaths': True,
        'can_use_main_roads': True,
        'can_use_highways': False,
        'speed_factor': 0.3,
        'osrm_profile': 'bicycle',  # Use bicycle profile
        'osrm_url': OSRM_BICYCLE_BASE,
    },
    'truck': {
        'name': 'Truck',
        'ground_clearance_cm': 40,
        'max_flood_depth_cm': 35,
        'can_use_footpaths': False,
        'can_use_main_roads': True,
        'can_use_highways': True,
        'speed_factor': 0.7,
        'osrm_profile': 'truck',  # Use truck profile (trucks have road restrictions)
        'osrm_url': OSRM_TRUCK_BASE,
    }
}

def get_flood_safety_for_mode(flood_depth_cm: float, transport_mode: str) -> str:
    """
    Determine flood safety level for a transportation mode based on flood depth.
    
    Returns:
        'safe', 'risky', or 'dangerous'
    """
    if transport_mode not in TRANSPORTATION_MODES:
        transport_mode = 'car'  # fallback
    
    config = TRANSPORTATION_MODES[transport_mode]
    max_depth = config['max_flood_depth_cm']
    
    if flood_depth_cm <= max_depth * 0.7:
        return 'safe'
    elif flood_depth_cm <= max_depth:
        return 'risky'
    else:
        return 'dangerous'

def is_route_accessible_for_mode(road_type: str, transport_mode: str) -> bool:
    """
    Check if a road type is accessible for the given transportation mode.
    
    Args:
        road_type: Type of road (footpath, highway, main_road, etc.)
        transport_mode: Transportation mode
        
    Returns:
        True if accessible, False otherwise
    """
    if transport_mode not in TRANSPORTATION_MODES:
        transport_mode = 'car'  # fallback
    
    config = TRANSPORTATION_MODES[transport_mode]
    road_type_lower = road_type.lower()
    
    if road_type_lower in ['footpath', 'sidewalk', 'pedestrian']:
        return config['can_use_footpaths']
    elif road_type_lower in ['highway', 'expressway']:
        return config['can_use_highways']
    else:  # main roads, primary, secondary, etc.
        return config['can_use_main_roads']

def get_osrm_endpoint_for_mode(transport_mode: str) -> str:
    """
    Get the appropriate OSRM endpoint for the transportation mode.
    
    Returns:
        OSRM base URL for the mode with proper protocol
    """
    if transport_mode not in TRANSPORTATION_MODES:
        transport_mode = 'car'  # fallback
    
    config = TRANSPORTATION_MODES[transport_mode]
    base_url = config['osrm_url']  # Already normalized with protocol
    profile = config['osrm_profile']
    
    return f"{base_url}/route/v1/{profile}"

def adjust_route_for_transportation_mode(route_data: dict, transport_mode: str) -> dict:
    """
    Adjust route duration and add transportation-specific metadata.
    
    Args:
        route_data: Raw route data from OSRM
        transport_mode: Transportation mode
        
    Returns:
        Modified route data with transportation-specific adjustments
    """
    if transport_mode not in TRANSPORTATION_MODES:
        transport_mode = 'car'  # fallback
    
    config = TRANSPORTATION_MODES[transport_mode]
    
    # Adjust duration based on speed factor
    if 'duration' in route_data:
        route_data['duration'] = route_data['duration'] / config['speed_factor']
    
    # Add transportation metadata
    route_data['transport_mode'] = transport_mode
    route_data['transport_config'] = {
        'name': config['name'],
        'max_flood_depth_cm': config['max_flood_depth_cm'],
        'speed_factor': config['speed_factor']
    }
    
    return route_data