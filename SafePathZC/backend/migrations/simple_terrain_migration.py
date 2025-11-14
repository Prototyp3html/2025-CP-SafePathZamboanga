#!/usr/bin/env python3
"""
Simple Database Migration for Terrain Tables
Creates terrain tables directly without complex imports
"""
import os
import sys
import logging
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, DateTime, Boolean, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get database URL from environment or use SQLite default
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")

# Create engine and base
engine = create_engine(DATABASE_URL)
Base = declarative_base()

# Define terrain models directly in this script
class TerrainRoadSegment(Base):
    """Store road segments with terrain and flood analysis data"""
    __tablename__ = 'terrain_road_segments'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Road identification
    osm_way_id = Column(String(50), unique=True, index=True)
    road_name = Column(String(200))
    highway_type = Column(String(50))
    
    # Geographic data
    geometry = Column(JSON)
    start_lat = Column(Float, nullable=False)
    start_lon = Column(Float, nullable=False)
    end_lat = Column(Float, nullable=False)
    end_lon = Column(Float, nullable=False)
    
    # Terrain analysis
    avg_elevation = Column(Float)
    min_elevation = Column(Float)
    max_elevation = Column(Float)
    elevation_variance = Column(Float)
    
    # Flood risk analysis
    flood_risk_level = Column(String(20))
    flood_risk_score = Column(Float)
    is_flood_prone = Column(Boolean, default=False)
    
    # Weather impact
    rainfall_impact = Column(Float)
    weather_conditions = Column(String(100))
    
    # Metadata
    last_updated = Column(DateTime, default=datetime.utcnow)
    data_sources = Column(JSON)

class FloodZoneHistory(Base):
    """Historical flood data for specific locations"""
    __tablename__ = 'flood_zone_history'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Location
    zone_name = Column(String(200))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    # Flood data
    flood_level = Column(String(20))
    recorded_at = Column(DateTime, default=datetime.utcnow)
    rainfall_mm = Column(Float)
    water_depth_cm = Column(Float)
    
    # Source information
    data_source = Column(String(100))
    confidence_score = Column(Float)

class TerrainDataUpdate(Base):
    """Track terrain data update operations"""
    __tablename__ = 'terrain_data_updates'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Update metadata
    update_started = Column(DateTime, default=datetime.utcnow)
    update_completed = Column(DateTime)
    status = Column(String(20))
    
    # Statistics
    roads_processed = Column(Integer, default=0)
    roads_updated = Column(Integer, default=0)
    roads_added = Column(Integer, default=0)
    
    # API usage
    osm_requests = Column(Integer, default=0)
    elevation_requests = Column(Integer, default=0)
    weather_requests = Column(Integer, default=0)
    
    # Results
    error_message = Column(Text)
    success_rate = Column(Float)
    execution_time_seconds = Column(Float)

def create_terrain_tables():
    """Create all terrain-related database tables"""
    try:
        logger.info(f"🔗 Using database: {DATABASE_URL}")
        logger.info("🔧 Creating terrain database tables...")
        
        # Create all tables
        Base.metadata.create_all(engine)
        
        logger.info("✅ Terrain database tables created successfully!")
        
        # List created tables
        from sqlalchemy import inspect
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        
        terrain_tables = [t for t in tables if 'terrain' in t or 'flood' in t]
        if terrain_tables:
            logger.info("📋 Created terrain-related tables:")
            for table in terrain_tables:
                logger.info(f"   🗂️  {table}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to create terrain tables: {e}")
        return False

def migrate_existing_geojson_data():
    """
    Migrate existing terrain_roads.geojson data to database if it exists
    """
    try:
        import json
        from pathlib import Path
        from sqlalchemy.orm import sessionmaker
        
        # Check if existing GeoJSON file exists
        geojson_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
        
        if not geojson_path.exists():
            logger.info("ℹ️  No existing terrain_roads.geojson file found - skipping migration")
            return True
        
        logger.info(f"📂 Migrating existing data from: {geojson_path}")
        
        # Load existing GeoJSON data
        with open(geojson_path, 'r') as f:
            geojson_data = json.load(f)
        
        features = geojson_data.get('features', [])
        logger.info(f"📊 Found {len(features)} features to migrate")
        
        # Create session
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        session = SessionLocal()
        
        try:
            # Start migration tracking
            update_session = TerrainDataUpdate(status='running')
            session.add(update_session)
            session.commit()
            
            migrated_count = 0
            
            for feature in features:
                try:
                    properties = feature.get('properties', {})
                    geometry = feature.get('geometry', {})
                    
                    # Extract coordinates
                    coordinates = geometry.get('coordinates', [])
                    if not coordinates or len(coordinates) < 2:
                        continue
                    
                    start_coord = coordinates[0]
                    end_coord = coordinates[-1]
                    
                    # Create segment data
                    segment = TerrainRoadSegment(
                        osm_way_id=properties.get('osm_way_id', f"migrated_{migrated_count}"),
                        road_name=properties.get('road_name', properties.get('name', 'Migrated Road')),
                        highway_type=properties.get('highway_type', properties.get('highway', 'unclassified')),
                        geometry=geometry,
                        start_lat=start_coord[1],
                        start_lon=start_coord[0],
                        end_lat=end_coord[1],
                        end_lon=end_coord[0],
                        avg_elevation=properties.get('avg_elevation', 0.0),
                        min_elevation=properties.get('min_elevation', 0.0),
                        max_elevation=properties.get('max_elevation', 0.0),
                        elevation_variance=properties.get('elevation_variance', 0.0),
                        flood_risk_level=properties.get('flood_risk_level', 'unknown'),
                        flood_risk_score=properties.get('flood_risk_score', 0.0),
                        is_flood_prone=properties.get('is_flood_prone', False),
                        rainfall_impact=properties.get('rainfall_impact', 0.0),
                        weather_conditions=properties.get('weather_conditions', 'unknown'),
                        data_sources=['migrated_geojson']
                    )
                    
                    session.add(segment)
                    migrated_count += 1
                    
                except Exception as e:
                    logger.error(f"Error migrating feature: {e}")
            
            # Commit all segments
            session.commit()
            
            # Complete migration session
            update_session.update_completed = datetime.utcnow()
            update_session.status = 'completed'
            update_session.roads_processed = len(features)
            update_session.roads_updated = migrated_count
            update_session.roads_added = migrated_count
            update_session.success_rate = (migrated_count / len(features) * 100) if features else 100
            session.commit()
            
            logger.info(f"✅ Successfully migrated {migrated_count} road segments to database")
            
            # Backup original file
            backup_path = geojson_path.with_suffix('.geojson.backup')
            geojson_path.rename(backup_path)
            logger.info(f"📦 Original file backed up to: {backup_path}")
            
        finally:
            session.close()
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to migrate existing data: {e}")
        return False

def main():
    """Run complete database migration"""
    logger.info("🚀 Starting terrain database migration...")
    
    # Step 1: Create tables
    if not create_terrain_tables():
        logger.error("❌ Migration failed - could not create tables")
        return False
    
    # Step 2: Migrate existing data
    if not migrate_existing_geojson_data():
        logger.warning("⚠️  Migration completed with warnings - existing data migration failed")
    
    logger.info("=" * 60)
    logger.info("✅ Terrain database migration completed successfully!")
    logger.info("🔄 Next steps:")
    logger.info("   1. Test the database system")
    logger.info("   2. Deploy to Railway")
    logger.info("   3. Monitor database performance")
    logger.info("=" * 60)
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)