"""
PostgreSQL Database Migration: Add profile_picture column to users table
Run this script to add the profile_picture column to existing PostgreSQL databases
"""

import psycopg2
import os
import sys
from datetime import datetime
from urllib.parse import urlparse
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def get_postgres_connection():
    """Get PostgreSQL connection from DATABASE_URL"""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("✗ DATABASE_URL environment variable not set")
        return None
    
    try:
        # Parse the database URL
        parsed = urlparse(database_url)
        
        connection = psycopg2.connect(
            host=parsed.hostname,
            database=parsed.path[1:],  # Remove leading slash
            user=parsed.username,
            password=parsed.password,
            port=parsed.port or 5432
        )
        return connection
    except Exception as e:
        print(f"✗ Failed to connect to PostgreSQL: {e}")
        return None

def add_profile_picture_column():
    """Add profile_picture column to users table"""
    
    conn = get_postgres_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'profile_picture'
        """)
        
        if cursor.fetchone():
            print("✓ profile_picture column already exists in users table")
            return True
        
        # Add the profile_picture column
        print("Adding profile_picture column to users table...")
        cursor.execute("""
            ALTER TABLE users 
            ADD COLUMN profile_picture TEXT
        """)
        
        # Commit changes
        conn.commit()
        print("✓ Successfully added profile_picture column to users table")
        
        # Verify the column was added
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'profile_picture'
        """)
        
        if cursor.fetchone():
            print("✓ Migration completed successfully")
            return True
        else:
            print("✗ Migration failed - column not found after addition")
            return False
            
    except psycopg2.Error as e:
        print(f"✗ PostgreSQL error: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False
    finally:
        if conn:
            conn.close()

def check_users_table():
    """Check if users table exists and show its structure"""
    
    conn = get_postgres_connection()
    if not conn:
        return False
    
    try:
        cursor = conn.cursor()
        
        # Check if users table exists
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'users'
        """)
        
        if not cursor.fetchone():
            print("✗ Users table does not exist")
            return False
        
        print("✓ Users table found")
        
        # Show current columns
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'users'
            ORDER BY ordinal_position
        """)
        
        columns = cursor.fetchall()
        print(f"  Current columns ({len(columns)}):")
        for col_name, data_type, is_nullable in columns:
            nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
            print(f"    - {col_name}: {data_type} ({nullable})")
        
        return True
        
    except psycopg2.Error as e:
        print(f"✗ PostgreSQL error: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False
    finally:
        if conn:
            conn.close()

def main():
    """Main migration function"""
    print("=" * 60)
    print("SafePathZC PostgreSQL Database Migration")
    print("Adding profile_picture column to users table")
    print("=" * 60)
    print(f"Migration started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Check database connection and users table
    print("Checking database connection and users table...")
    if not check_users_table():
        print("✗ Cannot proceed - users table check failed")
        return False
    
    print()
    
    # Run migration
    success = add_profile_picture_column()
    
    print()
    if success:
        print("✓ Migration completed successfully!")
        print("Users can now save profile pictures to the database.")
    else:
        print("✗ Migration failed!")
        print("Please check the error messages above and try again.")
    
    print("=" * 60)
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)