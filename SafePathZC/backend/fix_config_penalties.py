"""
Fix: Update system_config table with correct default values
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL not set")
    exit(1)

engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        # Update to correct values
        conn.execute(text("""
            UPDATE system_config 
            SET safe_route_penalty = 1.0,
                manageable_route_penalty = 1.5,
                flood_prone_route_penalty = 2.5
            WHERE id = 1
        """))
        
        conn.commit()
        print("✅ Updated system_config with correct penalty values:")
        print("   - safe_route_penalty: 1.0")
        print("   - manageable_route_penalty: 1.5")
        print("   - flood_prone_route_penalty: 2.5")
        
        # Verify
        result = conn.execute(text("SELECT * FROM system_config WHERE id = 1"))
        row = result.fetchone()
        if row:
            print("\n✅ Verified in database:")
            print(f"   {row}")
        
except Exception as e:
    print(f"❌ Error: {e}")
