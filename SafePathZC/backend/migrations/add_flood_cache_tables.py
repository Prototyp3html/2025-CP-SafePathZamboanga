"""
Migration: Add flood data cache tables to PostgreSQL
This enables persistent storage of elevation cache and flooded roads history
across container restarts on Railway.

Run this migration with: python -m alembic upgrade head
Or manually execute the SQL statements in create_cache_tables.sql
"""

import logging
from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean, UniqueConstraint, create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

logger = logging.getLogger(__name__)

# Migration functions
def upgrade():
    """Create new cache tables"""
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        try:
            # Create elevation_cache table
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS elevation_cache (
                id INTEGER PRIMARY KEY,
                latitude FLOAT NOT NULL,
                longitude FLOAT NOT NULL,
                elevation FLOAT NOT NULL,
                cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(latitude, longitude)
            )
            """))
            
            # Create flooded_roads_history table
            connection.execute(text("""
            CREATE TABLE IF NOT EXISTS flooded_roads_history (
                id INTEGER PRIMARY KEY,
                road_id VARCHAR NOT NULL UNIQUE,
                road_name VARCHAR,
                is_flooded BOOLEAN DEFAULT FALSE,
                flood_level VARCHAR,
                times_flooded INTEGER DEFAULT 0,
                first_flood_time TIMESTAMP,
                last_flood_start TIMESTAMP,
                last_flood_end TIMESTAMP,
                current_flood_duration_hours FLOAT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """))
            
            # Create indexes for better query performance (one at a time for SQLite)
            connection.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_elevation_cache_lat_lon ON elevation_cache(latitude, longitude)
            """))
            
            connection.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_flooded_roads_road_id ON flooded_roads_history(road_id)
            """))
            
            connection.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_flooded_roads_is_flooded ON flooded_roads_history(is_flooded)
            """))
            
            connection.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_flooded_roads_updated_at ON flooded_roads_history(updated_at)
            """))
            
            connection.commit()
            logger.info("✅ Elevation cache and flooded roads history tables created successfully")
        except Exception as e:
            logger.error(f"❌ Migration failed: {e}")
            raise

def downgrade():
    """Drop cache tables"""
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        try:
            connection.execute(text("DROP TABLE IF EXISTS elevation_cache"))
            connection.execute(text("DROP TABLE IF EXISTS flooded_roads_history"))
            connection.commit()
            logger.info("✅ Cache tables dropped successfully")
        except Exception as e:
            logger.error(f"❌ Downgrade failed: {e}")
            raise

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "upgrade":
        upgrade()
    elif len(sys.argv) > 1 and sys.argv[1] == "downgrade":
        downgrade()
    else:
        print("Usage: python add_flood_cache_tables.py [upgrade|downgrade]")
