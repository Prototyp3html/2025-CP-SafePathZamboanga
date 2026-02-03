#!/usr/bin/env python3
"""Check if last_decay_date column exists and add it if needed"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'

print("Connecting to Railway database...")
engine = create_engine(DATABASE_URL)

try:
    # Check if column exists
    print("\nChecking if last_decay_date column exists...")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT EXISTS(
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'flood_hotspots' 
                AND column_name = 'last_decay_date'
            )
        """))
        exists = result.scalar()
        print(f"Column exists: {exists}")
    
    if not exists:
        print("\n✓ Adding last_decay_date column to flood_hotspots...")
        with engine.begin() as conn:
            conn.execute(text("""
                ALTER TABLE flood_hotspots 
                ADD COLUMN last_decay_date TIMESTAMP NULL DEFAULT NULL
            """))
        print("✓ Column added successfully!")
    else:
        print("✓ Column already exists, no migration needed")
        
    # Verify by listing all columns
    print("\nFlood Hotspots table structure:")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'flood_hotspots'
            ORDER BY ordinal_position
        """))
        for row in result:
            nullable = "NULL" if row[2] == "YES" else "NOT NULL"
            print(f"  - {row[0]}: {row[1]} ({nullable})")
            
except Exception as e:
    print(f"\nError: {e}")
    import traceback
    traceback.print_exc()
finally:
    engine.dispose()
