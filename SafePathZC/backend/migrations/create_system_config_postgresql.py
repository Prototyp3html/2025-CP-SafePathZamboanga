"""
Migration for PostgreSQL: Create system_config table
Run this to ensure the table exists in your production database
"""

import os
from sqlalchemy import create_engine, text, inspect

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")

def migrate_up():
    """Create system_config table in PostgreSQL"""
    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    
    try:
        # Check if table exists
        if "system_config" in inspector.get_table_names():
            print("✅ system_config table already exists")
            return True
        
        # Create table for PostgreSQL
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
            print("✅ system_config table created in PostgreSQL")
            return True
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        print(f"\nIf using PostgreSQL and you see 'no such table', try running this SQL directly:")
        print("""
CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
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
);

INSERT INTO system_config (id, elevation_weight, rainfall_weight, proximity_weight, 
    safe_route_penalty, manageable_route_penalty, flood_prone_route_penalty, api_update_frequency)
VALUES (1, 0.35, 0.35, 0.30, 1.0, 1.5, 2.5, 60);
        """)
        return False

if __name__ == "__main__":
    migrate_up()
