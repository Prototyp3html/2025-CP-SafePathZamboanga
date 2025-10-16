"""
Fix database schema by adding missing columns to users table
"""
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# Get database connection details from DATABASE_URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://safepathzc_user:safepath123@localhost:5432/safepathzc")

# Parse DATABASE_URL
# Format: postgresql://user:password@host:port/database
parts = DATABASE_URL.replace("postgresql://", "").split("@")
user_pass = parts[0].split(":")
host_port_db = parts[1].split("/")
host_port = host_port_db[0].split(":")

user = user_pass[0]
password = user_pass[1]
host = host_port[0]
port = host_port[1] if len(host_port) > 1 else "5432"
database = host_port_db[1]

print(f"Connecting to database: {database} on {host}:{port}")

try:
    # Connect to PostgreSQL
    conn = psycopg2.connect(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password
    )
    
    cursor = conn.cursor()
    
    print("\nChecking existing columns in users table...")
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
    """)
    
    existing_columns = [row[0] for row in cursor.fetchall()]
    print(f"Existing columns: {', '.join(existing_columns)}")
    
    # List of columns that should exist
    required_columns = {
        'emergency_contact': "ALTER TABLE users ADD COLUMN emergency_contact VARCHAR;",
        'location': "ALTER TABLE users ADD COLUMN location VARCHAR;",
        'community_points': "ALTER TABLE users ADD COLUMN community_points INTEGER DEFAULT 0;",
        'routes_used': "ALTER TABLE users ADD COLUMN routes_used INTEGER DEFAULT 0;",
        'reports_submitted': "ALTER TABLE users ADD COLUMN reports_submitted INTEGER DEFAULT 0;",
        'joined_at': "ALTER TABLE users ADD COLUMN joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",
        'last_activity': "ALTER TABLE users ADD COLUMN last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"
    }
    
    print("\nAdding missing columns...")
    columns_added = 0
    
    for column_name, add_command in required_columns.items():
        if column_name not in existing_columns:
            print(f"  Adding column: {column_name}")
            cursor.execute(add_command)
            columns_added += 1
        else:
            print(f"  Column already exists: {column_name}")
    
    # Commit changes
    conn.commit()
    
    print(f"\n✓ Database schema updated successfully!")
    print(f"  {columns_added} columns added")
    
    # Verify the changes
    print("\nVerifying updated schema...")
    cursor.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
    """)
    
    updated_columns = [row[0] for row in cursor.fetchall()]
    print(f"Updated columns: {', '.join(updated_columns)}")
    
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
