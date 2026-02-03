"""
Migration to add last_decay_date column to flood_hotspots table
This column tracks when daily risk decay was last applied
"""

import os
from datetime import datetime
from sqlalchemy import create_engine, text, Column, DateTime
from sqlalchemy.orm import sessionmaker

def get_database_url():
    """Get the database URL from environment"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        # Fallback to local SQLite
        database_url = 'sqlite:///./safepath.db'
    return database_url

def run_migration():
    """Add last_decay_date column to flood_hotspots table"""
    database_url = get_database_url()
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as conn:
            # Check if column already exists
            try:
                with conn.begin():
                    result = conn.execute(
                        text("SELECT last_decay_date FROM flood_hotspots LIMIT 1")
                    )
                    print("✓ Column 'last_decay_date' already exists")
                    return True
            except Exception:
                # Column doesn't exist, proceed with migration
                pass
            
            # Add the column
            with conn.begin():
                if 'postgresql' in database_url.lower():
                    sql = """
                    ALTER TABLE flood_hotspots 
                    ADD COLUMN IF NOT EXISTS last_decay_date TIMESTAMP NULL DEFAULT NULL
                    """
                else:  # SQLite
                    sql = """
                    ALTER TABLE flood_hotspots 
                    ADD COLUMN last_decay_date TIMESTAMP NULL DEFAULT NULL
                    """
                
                conn.execute(text(sql))
                print(f"✓ Added 'last_decay_date' column to flood_hotspots table")
                return True
                
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        return False
    finally:
        engine.dispose()

if __name__ == "__main__":
    success = run_migration()
    if success:
        print("\n✓ Migration completed successfully")
    else:
        print("\n✗ Migration failed")
        exit(1)
