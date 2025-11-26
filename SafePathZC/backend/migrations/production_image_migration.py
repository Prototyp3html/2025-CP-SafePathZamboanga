#!/usr/bin/env python3
"""
Run image columns migration on Railway production database
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from urllib.parse import urlparse

def migrate_production_database():
    """Run migration on Railway production database"""
    try:
        # Get DATABASE_URL from Railway environment
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            print("❌ DATABASE_URL not found in environment variables")
            return False
            
        print(f"🔗 Using production database: {urlparse(database_url).hostname}")
        
        # Parse PostgreSQL URL
        parsed = urlparse(database_url)
        
        # Connect to PostgreSQL
        conn = psycopg2.connect(
            host=parsed.hostname,
            database=parsed.path[1:],  # Remove leading slash
            user=parsed.username,
            password=parsed.password,
            port=parsed.port or 5432
        )
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        print(f"✅ Connected to production PostgreSQL database")
        
        # Check if image columns exist
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'reports' AND table_schema = 'public'
            AND column_name IN ('image_data', 'image_filename')
        """)
        existing_columns = [row['column_name'] for row in cursor.fetchall()]
        
        columns_to_add = []
        if 'image_data' not in existing_columns:
            columns_to_add.append('image_data')
        if 'image_filename' not in existing_columns:
            columns_to_add.append('image_filename')
            
        if not columns_to_add:
            print("✅ Image columns already exist in production database")
            return True
            
        print(f"📋 Adding missing columns: {columns_to_add}")
        
        # Add missing columns
        for column in columns_to_add:
            if column == 'image_data':
                cursor.execute("ALTER TABLE reports ADD COLUMN image_data TEXT")
                print("✅ Added image_data column to reports table")
            elif column == 'image_filename':
                cursor.execute("ALTER TABLE reports ADD COLUMN image_filename VARCHAR(255)")
                print("✅ Added image_filename column to reports table")
        
        # Commit changes
        conn.commit()
        cursor.close()
        conn.close()
        print("🎉 Production database migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Production migration failed: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting production database migration...")
    
    if migrate_production_database():
        print("✅ Production migration completed!")
    else:
        print("❌ Production migration failed!")
        sys.exit(1)