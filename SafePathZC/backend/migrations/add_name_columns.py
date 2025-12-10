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
    with engine.begin() as conn:
        # Check which database we're using
        is_postgres = "postgresql" in DATABASE_URL.lower()
        
        if is_postgres:
            # PostgreSQL supports IF NOT EXISTS
            conn.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS first_name VARCHAR,
                ADD COLUMN IF NOT EXISTS middle_name VARCHAR,
                ADD COLUMN IF NOT EXISTS last_name VARCHAR;
            """))
            print("✅ Added first_name, middle_name, last_name columns to users table (PostgreSQL)")
        else:
            # SQLite doesn't support IF NOT EXISTS in ALTER TABLE, so try/except each column
            columns_to_add = [
                ('first_name', 'VARCHAR'),
                ('middle_name', 'VARCHAR'),
                ('last_name', 'VARCHAR')
            ]
            
            for col_name, col_type in columns_to_add:
                try:
                    conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                    print(f"✅ Added {col_name} column to users table")
                except Exception as col_err:
                    if "duplicate column name" in str(col_err).lower() or "already exists" in str(col_err).lower():
                        print(f"ℹ️  Column {col_name} already exists")
                    else:
                        raise
        
except Exception as e:
    print(f"❌ Migration failed: {e}")
    if "postgresql" in DATABASE_URL.lower():
        print("\nIf using PostgreSQL, try running this SQL directly in pgAdmin:")
        print("""
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name VARCHAR,
ADD COLUMN IF NOT EXISTS middle_name VARCHAR,
ADD COLUMN IF NOT EXISTS last_name VARCHAR;
        """)
