#!/usr/bin/env python3
"""
Add image_data and image_filename columns to reports table
Supports both SQLite and PostgreSQL
"""

import os
import sys
import sqlite3
from urllib.parse import urlparse

# Add the parent directory to path so we can import models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def add_report_image_columns():
    """Add image_data and image_filename columns to reports table if they don't exist"""
    
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
        
        # Check if image columns exist
        cursor.execute("PRAGMA table_info(reports)")
        columns = [column[1] for column in cursor.fetchall()]
        
        columns_to_add = []
        if 'image_data' not in columns:
            columns_to_add.append('image_data')
        if 'image_filename' not in columns:
            columns_to_add.append('image_filename')
            
        if not columns_to_add:
            print("✅ Image columns already exist in SQLite")
            return True
            
        # Add missing columns
        for column in columns_to_add:
            if column == 'image_data':
                cursor.execute("ALTER TABLE reports ADD COLUMN image_data TEXT")
                print("✅ Added image_data column to reports table (SQLite)")
            elif column == 'image_filename':
                cursor.execute("ALTER TABLE reports ADD COLUMN image_filename TEXT")
                print("✅ Added image_filename column to reports table (SQLite)")
        
        # Commit changes
        conn.commit()
        conn.close()
        print("✅ SQLite migration completed successfully")
        return True
        
    except Exception as e:
        print(f"❌ SQLite migration failed: {e}")
        return False

def migrate_postgresql(database_url):
    """Migrate PostgreSQL database"""
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        
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
        print(f"🗄️ Connected to PostgreSQL database: {parsed.path[1:]}")
        
        # Check if image columns exist
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'reports' AND table_schema = 'public'
        """)
        columns = [row['column_name'] for row in cursor.fetchall()]
        
        columns_to_add = []
        if 'image_data' not in columns:
            columns_to_add.append('image_data')
        if 'image_filename' not in columns:
            columns_to_add.append('image_filename')
            
        if not columns_to_add:
            print("✅ Image columns already exist in PostgreSQL")
            return True
            
        # Add missing columns
        for column in columns_to_add:
            if column == 'image_data':
                cursor.execute("ALTER TABLE reports ADD COLUMN image_data TEXT")
                print("✅ Added image_data column to reports table (PostgreSQL)")
            elif column == 'image_filename':
                cursor.execute("ALTER TABLE reports ADD COLUMN image_filename VARCHAR(255)")
                print("✅ Added image_filename column to reports table (PostgreSQL)")
        
        # Commit changes
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ PostgreSQL migration completed successfully")
        return True
        
    except ImportError:
        print("❌ psycopg2 not installed. Install it with: pip install psycopg2-binary")
        return False
    except Exception as e:
        print(f"❌ PostgreSQL migration failed: {e}")
        return False

def verify_migration():
    """Verify that the migration was successful"""
    try:
        database_url = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
        
        if database_url.startswith("sqlite"):
            db_path = database_url.replace("sqlite:///", "").replace("./", "")
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            cursor.execute("PRAGMA table_info(reports)")
            columns = [column[1] for column in cursor.fetchall()]
            
            image_columns = [col for col in columns if col in ['image_data', 'image_filename']]
            print(f"📋 Found image columns in reports table: {image_columns}")
            
            conn.close()
            
        elif database_url.startswith("postgresql"):
            import psycopg2
            from psycopg2.extras import RealDictCursor
            
            parsed = urlparse(database_url)
            conn = psycopg2.connect(
                host=parsed.hostname,
                database=parsed.path[1:],
                user=parsed.username,
                password=parsed.password,
                port=parsed.port or 5432
            )
            
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'reports' AND table_schema = 'public' 
                AND column_name IN ('image_data', 'image_filename')
            """)
            columns = [row['column_name'] for row in cursor.fetchall()]
            print(f"📋 Found image columns in reports table: {columns}")
            
            cursor.close()
            conn.close()
            
        return True
        
    except Exception as e:
        print(f"❌ Verification failed: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Starting reports image columns migration...")
    
    if add_report_image_columns():
        print("✅ Migration completed successfully!")
        verify_migration()
    else:
        print("❌ Migration failed!")
        sys.exit(1)