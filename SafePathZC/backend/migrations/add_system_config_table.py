"""
Migration: Add system_config table for persistent configuration storage
"""

from sqlalchemy import create_engine, inspect, text
import os
from datetime import datetime

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")

def migrate_up():
    """Create system_config table"""
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    
    try:
        # Check if table already exists
        if "system_config" in inspector.get_table_names():
            print("✅ system_config table already exists")
            return
        
        # Create table
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE system_config (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    elevation_weight FLOAT DEFAULT 0.35,
                    rainfall_weight FLOAT DEFAULT 0.35,
                    proximity_weight FLOAT DEFAULT 0.30,
                    safe_route_penalty FLOAT DEFAULT 1.0,
                    manageable_route_penalty FLOAT DEFAULT 1.5,
                    flood_prone_route_penalty FLOAT DEFAULT 2.5,
                    api_update_frequency INTEGER DEFAULT 60,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by_admin_id INTEGER,
                    UNIQUE(id)
                )
            """))
            
            # Insert default values
            conn.execute(text("""
                INSERT INTO system_config (id, elevation_weight, rainfall_weight, proximity_weight, 
                    safe_route_penalty, manageable_route_penalty, flood_prone_route_penalty, api_update_frequency)
                VALUES (1, 0.35, 0.35, 0.30, 1.0, 1.5, 2.5, 60)
            """))
            
            conn.commit()
            print("✅ system_config table created successfully")
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        raise

def migrate_down():
    """Drop system_config table"""
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.connect() as conn:
            conn.execute(text("DROP TABLE IF EXISTS system_config"))
            conn.commit()
            print("✅ system_config table dropped")
    except Exception as e:
        print(f"❌ Rollback failed: {e}")
        raise

if __name__ == "__main__":
    migrate_up()
