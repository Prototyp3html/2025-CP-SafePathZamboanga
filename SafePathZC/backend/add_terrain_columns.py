#!/usr/bin/env python3
"""
Add missing terrain columns to flood_hotspots table
"""

import os
from sqlalchemy import create_engine, text

db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'

print("\n" + "="*70)
print("🔧 ADDING TERRAIN COLUMNS TO FLOOD_HOTSPOTS")
print("="*70 + "\n")

try:
    engine = create_engine(db_url)
    
    with engine.connect() as conn:
        # Check which columns exist
        check_query = text('''
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'flood_hotspots'
        ''')
        
        existing_cols = [row[0] for row in conn.execute(check_query)]
        print(f"Existing columns: {', '.join(existing_cols)}\n")
        
        # Add missing columns
        missing_cols = []
        
        if 'average_elevation_m' not in existing_cols:
            print("Adding average_elevation_m column...")
            conn.execute(text('ALTER TABLE flood_hotspots ADD COLUMN average_elevation_m FLOAT DEFAULT NULL'))
            missing_cols.append('average_elevation_m')
            print("  ✅ Added average_elevation_m\n")
        
        if 'distance_to_water_m' not in existing_cols:
            print("Adding distance_to_water_m column...")
            conn.execute(text('ALTER TABLE flood_hotspots ADD COLUMN distance_to_water_m FLOAT DEFAULT NULL'))
            missing_cols.append('distance_to_water_m')
            print("  ✅ Added distance_to_water_m\n")
        
        if 'average_slope' not in existing_cols:
            print("Adding average_slope column...")
            conn.execute(text('ALTER TABLE flood_hotspots ADD COLUMN average_slope FLOAT DEFAULT NULL'))
            missing_cols.append('average_slope')
            print("  ✅ Added average_slope\n")
        
        conn.commit()
        
        if missing_cols:
            print(f"✅ Successfully added {len(missing_cols)} columns!")
        else:
            print("✅ All terrain columns already exist!")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*70)
