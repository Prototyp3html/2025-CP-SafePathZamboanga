# Transportation mode configurations for SafePath routing
# Matches the frontend TransportationSelector.tsx configurations

import os

# Get OSRM URLs from environment variables
OSRM_DRIVING_BASE = os.getenv("OSRM_DRIVING_URL", "http://localhost:5000")
OSRM_WALKING_BASE = os.getenv("OSRM_WALKING_URL", "http://localhost:5001")

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
        'osrm_profile': 'driving',
        'osrm_url': OSRM_DRIVING_BASE,
    },
    'walking': {
        'name': 'Walking',
        'ground_clearance_cm': 0,
        'max_flood_depth_cm': 30,  # Humans can wade through deeper water
        'can_use_footpaths': True,
        'can_use_main_roads': False,  # Prefer sidewalks
        'can_use_highways': False,
        'speed_factor': 0.1,
        'osrm_profile': 'foot',
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
        'osrm_profile': 'driving',
        'osrm_url': OSRM_DRIVING_BASE,
    },
    'bicycle': {
        'name': 'Bicycle',
        'ground_clearance_cm': 5,
        'max_flood_depth_cm': 5,
        'can_use_footpaths': True,
        'can_use_main_roads': True,
        'can_use_highways': False,
        'speed_factor': 0.3,
        'osrm_profile': 'cycling',
        'osrm_url': OSRM_DRIVING_BASE,  # Use driving for now
    },
    'truck': {
        'name': 'Truck',
        'ground_clearance_cm': 40,
        'max_flood_depth_cm': 35,
        'can_use_footpaths': False,
        'can_use_main_roads': True,
        'can_use_highways': True,
        'speed_factor': 0.7,
        'osrm_profile': 'driving',
        'osrm_url': OSRM_DRIVING_BASE,
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
        OSRM base URL for the mode
    """
    if transport_mode not in TRANSPORTATION_MODES:
        transport_mode = 'car'  # fallback
    
    config = TRANSPORTATION_MODES[transport_mode]
    port = config['osrm_port']
    profile = config['osrm_profile']
    
    return f"http://localhost:{port}/route/v1/{profile}"

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