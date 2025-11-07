#!/usr/bin/env python3
"""
Add profile_picture column to users table
Supports both SQLite and PostgreSQL
"""

import os
import sys
import sqlite3
from urllib.parse import urlparse

# Add the parent directory to path so we can import models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def add_profile_picture_column():
    """Add profile_picture column to users table if it doesn't exist"""
    
    # Get database URL from environment, fallback to SQLite
    database_url = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
    print(f"🔗 Using database: {database_url}")
    
    if database_url.startswith("sqlite"):
        return migrate_sqlite(database_url)
    elif database_url.startswith("postgresql"):
        return migrate_postgresql(database_url)
    else:
        print(f"❌ Unsupported database type: {database_url}")
        return False

def migrate_sqlite(database_url):
    """Migrate SQLite database"""
    try:
        # Extract SQLite file path
        db_path = database_url.replace("sqlite:///", "").replace("./", "")
        if not os.path.exists(db_path):
            print(f"❌ SQLite database file not found: {db_path}")
            return False
            
        print(f"🗄️ Connecting to SQLite database: {db_path}")
        
        # Connect to SQLite
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if profile_picture column exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'profile_picture' in columns:
            print("✅ profile_picture column already exists in SQLite")
            return True
        
        # Add the profile_picture column
        print("🔄 Adding profile_picture column to users table...")
        cursor.execute("ALTER TABLE users ADD COLUMN profile_picture TEXT")
        
        # Commit the changes
        conn.commit()
        print("✅ Successfully added profile_picture column to SQLite")
        
        return True
        
    except Exception as e:
        print(f"❌ SQLite migration failed: {e}")
        return False
        
    finally:
        if 'conn' in locals():
            conn.close()

def migrate_postgresql(database_url):
    """Migrate PostgreSQL database"""
    try:
        import psycopg2
    except ImportError:
        print("❌ psycopg2 not installed. Install it with: pip install psycopg2-binary")
        return False
    
    try:
        # Parse the database URL
        parsed = urlparse(database_url)
        
        # Connect to PostgreSQL
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port,
            database=parsed.path[1:],  # Remove leading slash
            user=parsed.username,
            password=parsed.password
        )
        
        cursor = conn.cursor()
        
        # Check if profile_picture column exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'profile_picture';
        """)
        
        exists = cursor.fetchone()
        
        if exists:
            print("✅ profile_picture column already exists")
            return True
        
        # Add the profile_picture column
        print("🔄 Adding profile_picture column to users table...")
        cursor.execute("""
            ALTER TABLE users 
            ADD COLUMN profile_picture TEXT;
        """)
        
        # Commit the changes
        conn.commit()
        print("✅ Successfully added profile_picture column")
        
        # Verify the column was added
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'profile_picture';
        """)
        
        result = cursor.fetchone()
        if result:
            print(f"📋 Column details: {result[0]} ({result[1]}, nullable: {result[2]})")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False
        
    finally:
        if 'conn' in locals():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    print("🚀 Starting database migration...")
    success = add_profile_picture_column()
    
    if success:
        print("🎉 Migration completed successfully!")
    else:
        print("💥 Migration failed!")
        exit(1)