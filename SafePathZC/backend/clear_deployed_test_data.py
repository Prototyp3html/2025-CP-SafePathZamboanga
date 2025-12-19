"""
Delete test flood data from DEPLOYED PostgreSQL database on Railway
This connects to the production database URL
"""

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

# Get the DATABASE_URL from environment (Railway sets this automatically)
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL environment variable not found!")
    print("Make sure you're using the correct .env file with Railway credentials")
    exit(1)

print(f"📍 Connecting to database: {DATABASE_URL[:50]}...")

try:
    # Create engine for PostgreSQL
    engine = create_engine(DATABASE_URL)
    
    with engine.connect() as connection:
        # Start transaction
        transaction = connection.begin()
        
        try:
            # Count before deletion
            result_hotspots = connection.execute(text('SELECT COUNT(*) FROM flood_hotspots')).scalar()
            result_events = connection.execute(text('SELECT COUNT(*) FROM flood_event_logs')).scalar()
            result_stats = connection.execute(text('SELECT COUNT(*) FROM flood_statistics')).scalar()
            
            print(f"\n📊 Before cleanup:")
            print(f"  - flood_hotspots: {result_hotspots} records")
            print(f"  - flood_event_logs: {result_events} records")
            print(f"  - flood_statistics: {result_stats} records")
            
            # Delete all test data
            print(f"\n🗑️  Removing test data from PostgreSQL...")
            
            connection.execute(text('DELETE FROM flood_event_logs'))
            connection.execute(text('DELETE FROM flood_statistics'))
            connection.execute(text('DELETE FROM flood_hotspots'))
            
            transaction.commit()
            
            # Verify
            with engine.connect() as verify_conn:
                final_hotspots = verify_conn.execute(text('SELECT COUNT(*) FROM flood_hotspots')).scalar()
                final_events = verify_conn.execute(text('SELECT COUNT(*) FROM flood_event_logs')).scalar()
                final_stats = verify_conn.execute(text('SELECT COUNT(*) FROM flood_statistics')).scalar()
            
            print(f"\n✅ All test flood data deleted from Railway PostgreSQL!")
            print(f"\n📊 After cleanup:")
            print(f"  - flood_hotspots: {final_hotspots} records")
            print(f"  - flood_event_logs: {final_events} records")
            print(f"  - flood_statistics: {final_stats} records")
            print(f"\n✨ Deployed database is clean - ready for REAL data only!")
            
        except Exception as e:
            transaction.rollback()
            print(f"❌ Error during deletion: {e}")
            raise
            
except Exception as e:
    print(f"❌ Connection error: {e}")
    print("\nMake sure DATABASE_URL is set correctly in your environment")
    exit(1)
