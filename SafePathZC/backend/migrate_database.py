"""
Database migration script to add authentication columns to existing tables
"""

import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://safepathzc_user:safepath123@localhost:5432/safepathzc")

def migrate_database():
    """Add missing columns to existing tables"""
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.connect() as connection:
            # Start a transaction
            trans = connection.begin()
            
            try:
                print("🔄 Starting database migration...")
                
                # Check if users table exists and add missing columns
                print("📝 Checking users table...")
                
                # Add password_hash column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS password_hash VARCHAR
                    """))
                    print("✅ Added password_hash column to users table")
                except Exception as e:
                    print(f"⚠️ password_hash column might already exist: {e}")
                
                # Add phone column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS phone VARCHAR
                    """))
                    print("✅ Added phone column to users table")
                except Exception as e:
                    print(f"⚠️ phone column might already exist: {e}")
                
                # Add location column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS location VARCHAR
                    """))
                    print("✅ Added location column to users table")
                except Exception as e:
                    print(f"⚠️ location column might already exist: {e}")
                
                # Add role column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'user'
                    """))
                    print("✅ Added role column to users table")
                except Exception as e:
                    print(f"⚠️ role column might already exist: {e}")
                
                # Add is_active column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
                    """))
                    print("✅ Added is_active column to users table")
                except Exception as e:
                    print(f"⚠️ is_active column might already exist: {e}")
                
                # Add community_points column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS community_points INTEGER DEFAULT 0
                    """))
                    print("✅ Added community_points column to users table")
                except Exception as e:
                    print(f"⚠️ community_points column might already exist: {e}")
                
                # Add routes_used column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS routes_used INTEGER DEFAULT 0
                    """))
                    print("✅ Added routes_used column to users table")
                except Exception as e:
                    print(f"⚠️ routes_used column might already exist: {e}")
                
                # Add reports_submitted column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS reports_submitted INTEGER DEFAULT 0
                    """))
                    print("✅ Added reports_submitted column to users table")
                except Exception as e:
                    print(f"⚠️ reports_submitted column might already exist: {e}")
                
                # Add joined_at column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    """))
                    print("✅ Added joined_at column to users table")
                except Exception as e:
                    print(f"⚠️ joined_at column might already exist: {e}")
                
                # Add last_activity column if it doesn't exist
                try:
                    connection.execute(text("""
                        ALTER TABLE users 
                        ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    """))
                    print("✅ Added last_activity column to users table")
                except Exception as e:
                    print(f"⚠️ last_activity column might already exist: {e}")
                
                # Create admin_users table if it doesn't exist
                print("📝 Creating admin_users table...")
                connection.execute(text("""
                    CREATE TABLE IF NOT EXISTS admin_users (
                        id SERIAL PRIMARY KEY,
                        email VARCHAR UNIQUE NOT NULL,
                        password_hash VARCHAR NOT NULL,
                        name VARCHAR NOT NULL,
                        role VARCHAR DEFAULT 'admin',
                        is_active BOOLEAN DEFAULT true,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP
                    )
                """))
                print("✅ Created admin_users table")
                
                # Create reports table if it doesn't exist
                print("📝 Creating reports table...")
                connection.execute(text("""
                    CREATE TABLE IF NOT EXISTS reports (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR NOT NULL,
                        description TEXT NOT NULL,
                        category VARCHAR NOT NULL,
                        urgency VARCHAR DEFAULT 'medium',
                        status VARCHAR DEFAULT 'pending',
                        is_visible BOOLEAN DEFAULT false,
                        location_lat FLOAT NOT NULL,
                        location_lng FLOAT NOT NULL,
                        location_address VARCHAR NOT NULL,
                        reporter_name VARCHAR NOT NULL,
                        reporter_email VARCHAR NOT NULL,
                        reporter_id VARCHAR DEFAULT 'anonymous',
                        admin_notes TEXT,
                        verification_score FLOAT DEFAULT 0.0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                print("✅ Created reports table")
                
                # Update existing users with default values if they have null values
                print("📝 Updating existing users with default values...")
                connection.execute(text("""
                    UPDATE users 
                    SET 
                        role = COALESCE(role, 'user'),
                        is_active = COALESCE(is_active, true),
                        community_points = COALESCE(community_points, 0),
                        routes_used = COALESCE(routes_used, 0),
                        reports_submitted = COALESCE(reports_submitted, 0),
                        joined_at = COALESCE(joined_at, CURRENT_TIMESTAMP),
                        last_activity = COALESCE(last_activity, CURRENT_TIMESTAMP)
                    WHERE role IS NULL 
                       OR is_active IS NULL 
                       OR community_points IS NULL 
                       OR routes_used IS NULL 
                       OR reports_submitted IS NULL 
                       OR joined_at IS NULL 
                       OR last_activity IS NULL
                """))
                print("✅ Updated existing users with default values")
                
                # Create a demo user with password hash
                print("📝 Creating demo user...")
                import hashlib
                demo_password_hash = hashlib.sha256("demo123".encode()).hexdigest()
                
                connection.execute(text("""
                    INSERT INTO users (email, password_hash, name, phone, location, role, is_active, community_points, routes_used, reports_submitted)
                    VALUES (:email, :password_hash, :name, :phone, :location, :role, :is_active, :community_points, :routes_used, :reports_submitted)
                    ON CONFLICT (email) DO UPDATE SET
                        password_hash = EXCLUDED.password_hash,
                        name = EXCLUDED.name,
                        phone = EXCLUDED.phone,
                        location = EXCLUDED.location
                """), {
                    'email': 'maria.santos@email.com',
                    'password_hash': demo_password_hash,
                    'name': 'Maria Santos',
                    'phone': '+63 912 345 6789',
                    'location': 'Zamboanga City',
                    'role': 'user',
                    'is_active': True,
                    'community_points': 340,
                    'routes_used': 127,
                    'reports_submitted': 8
                })
                print("✅ Created/updated demo user: maria.santos@email.com / demo123")
                
                # Create default admin user
                print("📝 Creating default admin user...")
                admin_password_hash = hashlib.sha256("admin123".encode()).hexdigest()
                
                connection.execute(text("""
                    INSERT INTO admin_users (email, password_hash, name, role, is_active)
                    VALUES (:email, :password_hash, :name, :role, :is_active)
                    ON CONFLICT (email) DO UPDATE SET
                        password_hash = EXCLUDED.password_hash,
                        name = EXCLUDED.name
                """), {
                    'email': 'admin@safepath.com',
                    'password_hash': admin_password_hash,
                    'name': 'Admin User',
                    'role': 'admin',
                    'is_active': True
                })
                print("✅ Created/updated admin user: admin@safepath.com / admin123")
                
                # Commit the transaction
                trans.commit()
                print("🎉 Database migration completed successfully!")
                
            except Exception as e:
                # Rollback on error
                trans.rollback()
                print(f"❌ Migration failed: {e}")
                raise e
                
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate_database()