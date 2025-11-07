"""
Railway PostgreSQL Migration: Add profile_picture column
This script will be run on Railway to add the missing profile_picture column
"""

import psycopg2
import os
from urllib.parse import urlparse

def migrate_railway_database():
    """Add profile_picture column to Railway PostgreSQL database"""
    
    # Get Railway DATABASE_URL
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("✗ DATABASE_URL environment variable not found")
        return False
    
    print(f"🔗 Connecting to Railway PostgreSQL...")
    
    try:
        # Parse the database URL
        parsed = urlparse(database_url)
        
        # Connect to Railway PostgreSQL
        conn = psycopg2.connect(
            host=parsed.hostname,
            database=parsed.path[1:],  # Remove leading slash
            user=parsed.username,
            password=parsed.password,
            port=parsed.port or 5432
        )
        
        cursor = conn.cursor()
        
        print("✅ Connected to Railway PostgreSQL")
        
        # Check if column already exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'profile_picture'
        """)
        
        if cursor.fetchone():
            print("✅ profile_picture column already exists")
            return True
        
        # Add the profile_picture column
        print("🔄 Adding profile_picture column to users table...")
        cursor.execute("""
            ALTER TABLE users 
            ADD COLUMN profile_picture TEXT
        """)
        
        # Commit changes
        conn.commit()
        print("✅ Successfully added profile_picture column")
        
        # Verify the column was added
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'profile_picture'
        """)
        
        if cursor.fetchone():
            print("✅ Migration completed successfully on Railway")
            return True
        else:
            print("❌ Migration failed - column not found after addition")
            return False
            
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        return False
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    print("🚀 SafePathZC Railway Database Migration")
    print("=" * 50)
    
    success = migrate_railway_database()
    
    if success:
        print("🎉 Railway migration completed successfully!")
    else:
        print("💥 Railway migration failed!")
        
    print("=" * 50)