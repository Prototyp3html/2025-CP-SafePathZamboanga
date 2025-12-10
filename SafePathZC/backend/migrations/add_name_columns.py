"""
Migration: Add first_name, middle_name, last_name columns to users table
"""

from sqlalchemy import create_engine, text
import os
import sys

# Add parent directory to path to import models
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import Base, engine

# First, create all tables (idempotent operation)
print("📦 Initializing database tables...")
Base.metadata.create_all(bind=engine)
print("✅ Tables initialized")

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("⚠️  DATABASE_URL not set, using default")
    DATABASE_URL = "sqlite:///./safepath.db"

try:
    with engine.connect() as conn:
        # Add columns if they don't exist
        conn.execute(text("""
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS first_name VARCHAR,
            ADD COLUMN IF NOT EXISTS middle_name VARCHAR,
            ADD COLUMN IF NOT EXISTS last_name VARCHAR;
        """))
        
        conn.commit()
        print("✅ Added first_name, middle_name, last_name columns to users table")
        
except Exception as e:
    print(f"❌ Migration failed: {e}")
    print("\nIf using PostgreSQL, try running this SQL directly in pgAdmin:")
    print("""
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR,
ADD COLUMN IF NOT EXISTS middle_name VARCHAR,
ADD COLUMN IF NOT EXISTS last_name VARCHAR;
    """)
