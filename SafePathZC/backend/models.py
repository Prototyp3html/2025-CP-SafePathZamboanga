from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# Database setup
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://safepathzc_user:safepath123@localhost:5432/safepathzc")
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
    
    # Admin data
    admin_notes = Column(Text, nullable=True)
    verification_score = Column(Float, default=0.0)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    location = Column(String, nullable=True)
    emergency_contact = Column(String, nullable=True)
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