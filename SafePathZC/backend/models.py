from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean, Text, create_engine, UniqueConstraint, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Existing models
class RouteHistory(Base):
    __tablename__ = "route_history"
    
    id = Column(Integer, primary_key=True, index=True)
    from_location = Column(String, nullable=False)
    to_location = Column(String, nullable=False)
    from_lat = Column(Float, nullable=True)
    from_lng = Column(Float, nullable=True)
    to_lat = Column(Float, nullable=True)
    to_lng = Column(Float, nullable=True)
    date = Column(DateTime, default=datetime.utcnow)
    duration = Column(String, nullable=False)
    distance = Column(String, nullable=False)
    status = Column(String, default="completed")  # completed, interrupted, cancelled
    weather_condition = Column(String, nullable=True)
    route_type = Column(String, default="safe")  # safe, manageable, prone
    waypoints = Column(Text, nullable=True)  # JSON string of route waypoints
    user_id = Column(String, default="default_user")  # For multi-user support later

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

# New authentication models
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
    
    # Evidence/Image data
    image_data = Column(Text, nullable=True)  # Base64 encoded image data
    image_filename = Column(String, nullable=True)  # Original filename
    
    # Admin data
    admin_notes = Column(Text, nullable=True)
    verification_score = Column(Float, default=0.0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ReportImage(Base):
    """Store multiple images for reports - one-to-many relationship"""
    __tablename__ = "report_images"
    
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    image_data = Column(Text, nullable=False)  # Base64 encoded image data
    image_filename = Column(String, nullable=False)  # Original filename
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    first_name = Column(String, nullable=True)
    middle_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
    profile_picture = Column(Text, nullable=True)  # Base64 encoded image data
    role = Column(String, default="user")  # user, admin, moderator
    is_active = Column(Boolean, default=True)
    community_points = Column(Integer, default=0)
    routes_used = Column(Integer, default=0)
    reports_submitted = Column(Integer, default=0)
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)

# Community Forum Models
class Post(Base):
    __tablename__ = "posts"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, nullable=False)  # Foreign key to users.id
    author_name = Column(String, nullable=False)  # Store author name for display
    category = Column(String, nullable=False)  # alerts, reports, suggestions, general
    tags = Column(Text, nullable=True)  # JSON string of tags array
    likes_count = Column(Integer, default=0)
    replies_count = Column(Integer, default=0)
    is_urgent = Column(Boolean, default=False)
    is_approved = Column(Boolean, default=False)  # Admin approval required
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="SET NULL"), nullable=True, index=True)  # Link to source report for images
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, nullable=False)  # Foreign key to posts.id
    author_id = Column(Integer, nullable=False)  # Foreign key to users.id
    author_name = Column(String, nullable=False)  # Store author name for display
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PostLike(Base):
    __tablename__ = "post_likes"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, nullable=False)  # Foreign key to posts.id
    user_id = Column(Integer, nullable=False)  # Foreign key to users.id
    created_at = Column(DateTime, default=datetime.utcnow)

# Flood Data Cache Models
class ElevationCache(Base):
    """Cache elevation data from Open-Elevation API to avoid repeated requests"""
    __tablename__ = "elevation_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    elevation = Column(Float, nullable=False)
    cached_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Unique constraint on lat/lon pair
    __table_args__ = (UniqueConstraint('latitude', 'longitude', name='unique_lat_lon'),)

class FloodedRoadsHistory(Base):
    """Track flood status history for roads to calculate flood duration"""
    __tablename__ = "flooded_roads_history"
    
    id = Column(Integer, primary_key=True, index=True)
    road_id = Column(String, nullable=False, index=True)  # OSM way ID
    road_name = Column(String, nullable=True)
    
    # Current flood status
    is_flooded = Column(Boolean, default=False, index=True)
    flood_level = Column(String, nullable=True)  # low, medium, high
    
    # Flood history tracking
    times_flooded = Column(Integer, default=0)  # How many times has this road been flooded
    first_flood_time = Column(DateTime, nullable=True)  # When was it first flooded
    last_flood_start = Column(DateTime, nullable=True)  # When did the latest flood start
    last_flood_end = Column(DateTime, nullable=True)  # When did the latest flood end
    current_flood_duration_hours = Column(Float, default=0)  # Current continuous flood duration
    
    # Metadata
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class TerrainRoadsCache(Base):
    __tablename__ = "terrain_roads_cache"
    
    id = Column(Integer, primary_key=True, index=True)
    geojson_data = Column(Text, nullable=False)  # Full GeoJSON as JSON string
    geojson_metadata = Column(Text, nullable=True)  # Metadata as JSON (flooded count, etc)
    generated_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    __table_args__ = (
        UniqueConstraint('id', name='unique_terrain_cache'),
    )

class FloodEventLog(Base):
    """Detailed log of every flood event (start and end) for lifetime history"""
    __tablename__ = "flood_event_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    road_id = Column(String, nullable=False, index=True)  # OSM way ID
    road_name = Column(String, nullable=True)
    
    # Event type: 'flood_start' or 'flood_end'
    event_type = Column(String, nullable=False, index=True)  # flood_start, flood_end
    
    # Event details
    flood_level = Column(String, nullable=True)  # low, medium, high
    rainfall_mm = Column(Float, nullable=True)  # Rainfall at time of event
    elevation_m = Column(Float, nullable=True)  # Elevation of road
    distance_to_water_m = Column(Float, nullable=True)  # Distance to water bodies
    
    # Location coordinates
    location_lat = Column(Float, nullable=True)
    location_lon = Column(Float, nullable=True)
    
    # Timestamps
    event_time = Column(DateTime, default=datetime.utcnow, index=True)  # When did this event occur
    created_at = Column(DateTime, default=datetime.utcnow)  # When was this logged
    
    # For debugging/audit trail
    update_source = Column(String, nullable=True)  # API source or manual


class FloodStatistics(Base):
    """Aggregate statistics for flood analysis - daily summaries"""
    __tablename__ = "flood_statistics"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Time period (date for daily stats)
    stat_date = Column(DateTime, nullable=False, index=True)  # Day this statistic covers
    
    # Road-specific stats
    road_id = Column(String, nullable=True, index=True)  # If NULL, it's city-wide stats
    road_name = Column(String, nullable=True)
    
    # Count statistics
    total_flood_events = Column(Integer, default=0)  # Total events on this day
    flood_start_events = Column(Integer, default=0)  # How many times did flooding START
    flood_end_events = Column(Integer, default=0)  # How many times did flooding END
    max_simultaneous_flooded_roads = Column(Integer, default=0)  # Peak flood count
    
    # Duration statistics
    total_flooded_hours = Column(Float, default=0)  # Total hours flooded during this day
    average_flood_duration_hours = Column(Float, default=0)  # Average length of flood events
    longest_flood_duration_hours = Column(Float, default=0)  # Longest continuous flood
    
    # Environmental data
    max_rainfall_mm = Column(Float, default=0)  # Max rainfall during this day
    average_rainfall_mm = Column(Float, default=0)  # Average rainfall
    
    # Flood severity
    high_severity_events = Column(Integer, default=0)  # Count of "high" level floods
    medium_severity_events = Column(Integer, default=0)  # Count of "medium" level floods
    low_severity_events = Column(Integer, default=0)  # Count of "low" level floods
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FloodHotspot(Base):
    """Track flood-prone areas (locations that flood repeatedly)"""
    __tablename__ = "flood_hotspots"
    
    id = Column(Integer, primary_key=True, index=True)
    road_id = Column(String, nullable=False, unique=True, index=True)  # OSM way ID
    road_name = Column(String, nullable=True)
    
    # Location
    location_lat = Column(Float, nullable=False)
    location_lon = Column(Float, nullable=False)
    
    # Historical flood data
    total_flood_events = Column(Integer, default=0)  # Total times flooded in history
    total_flooded_hours = Column(Float, default=0)  # Total hours flooded in history
    average_flood_duration_hours = Column(Float, default=0)  # Average flood duration
    
    # Last flood info
    last_flood_start = Column(DateTime, nullable=True)  # When was it last flooded
    last_flood_end = Column(DateTime, nullable=True)
    days_since_last_flood = Column(Integer, nullable=True)  # Days since last flood
    
    # Risk assessment
    flood_risk_score = Column(Float, default=0)  # 0-100 score based on history and terrain
    frequency_per_year = Column(Float, default=0)  # How many times per year does it flood
    
    # Terrain data (for risk calculation)
    average_elevation_m = Column(Float, nullable=True)  # Average elevation of road
    average_slope = Column(Float, nullable=True)  # Average slope percentage
    distance_to_water_m = Column(Float, nullable=True)  # Average distance to water bodies
    
    # Seasonal patterns
    flood_months = Column(String, nullable=True)  # JSON list of months when flooding occurs
    rainy_season_floods = Column(Integer, default=0)  # Floods during rainy season
    dry_season_floods = Column(Integer, default=0)  # Floods during dry season
    
    # Metadata
    first_flood_recorded = Column(DateTime, nullable=True)  # When was first flood recorded
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_decay_date = Column(DateTime, nullable=True)  # Last date risk decay was applied (once per day)

class SystemConfig(Base):
    __tablename__ = "system_config"
    
    id = Column(Integer, primary_key=True, index=True, default=1)  # Single row
    elevation_weight = Column(Float, default=0.35)
    rainfall_weight = Column(Float, default=0.35)
    proximity_weight = Column(Float, default=0.30)
    safe_route_penalty = Column(Float, default=1.0)
    manageable_route_penalty = Column(Float, default=1.5)
    flood_prone_route_penalty = Column(Float, default=2.5)
    api_update_frequency = Column(Integer, default=60)  # minutes
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_admin_id = Column(Integer, nullable=True)
    
    __table_args__ = (
        UniqueConstraint('id', name='unique_system_config'),
    )


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create tables
def create_tables():
    Base.metadata.create_all(bind=engine)