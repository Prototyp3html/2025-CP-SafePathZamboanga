#!/usr/bin/env python3
"""
Sync expanded flood hotspot coverage to Railway PostgreSQL
This pushes the 21,669 hotspots (doubled coverage) to production
"""

import os
import sqlite3
import psycopg2
from psycopg2.extras import execute_batch
from pathlib import Path

DATABASE_URL = os.getenv("DATABASE_URL", "")

def migrate_to_railway(dry_run=False):
    """Migrate expanded coverage from local SQLite to Railway PostgreSQL"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set")
        print("Cannot connect to Railway PostgreSQL")
        return
    
    print("SYNCING EXPANDED COVERAGE TO RAILWAY")
    print("="*70)
    
    # Read from local SQLite
    print("\nReading expanded hotspot data from local database...")
    conn_local = sqlite3.connect(
        r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\safepath.db'
    )
    cursor_local = conn_local.cursor()
    
    cursor_local.execute('''
        SELECT 
            road_id, road_name, location_lat, location_lon,
            total_flood_events, total_flooded_hours,
            average_flood_duration_hours, flood_risk_score,
            frequency_per_year, last_updated
        FROM flood_hotspots
        ORDER BY road_id
    ''')
    
    hotspots = cursor_local.fetchall()
    conn_local.close()
    
    print(f"Read {len(hotspots)} hotspots from local database")
    
    if dry_run:
        print("\n(DRY RUN - No data will be modified)")
        return
    
    # Connect to Railway PostgreSQL
    try:
        print("\nConnecting to Railway PostgreSQL...")
        conn_railway = psycopg2.connect(DATABASE_URL)
        cursor_railway = conn_railway.cursor()
        
        # Clear old flood_hotspots data
        print("Clearing old flood hotspots data...")
        cursor_railway.execute('DELETE FROM flood_hotspots')
        conn_railway.commit()
        print("Cleared flood_hotspots table")
        
        # Insert in batches
        print(f"\nInserting {len(hotspots)} hotspots in batches...")
        batch_size = 500
        
        for i in range(0, len(hotspots), batch_size):
            batch = hotspots[i:i + batch_size]
            
            execute_batch(
                cursor_railway,
                '''
                INSERT INTO flood_hotspots (
                    road_id, road_name, location_lat, location_lon,
                    total_flood_events, total_flooded_hours,
                    average_flood_duration_hours, flood_risk_score,
                    frequency_per_year, last_updated
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ''',
                batch,
                page_size=500
            )
            conn_railway.commit()
            
            batch_num = (i // batch_size) + 1
            total_batches = (len(hotspots) + batch_size - 1) // batch_size
            print(f"  Batch {batch_num}/{total_batches} inserted...")
        
        cursor_railway.close()
        conn_railway.close()
        
        print(f"\n✅ Successfully synced {len(hotspots)} hotspots to Railway!")
        
        # Verify
        print("\nVerifying data in Railway...")
        conn_railway = psycopg2.connect(DATABASE_URL)
        cursor_railway = conn_railway.cursor()
        
        cursor_railway.execute('SELECT COUNT(*) FROM flood_hotspots')
        count = cursor_railway.fetchone()[0]
        
        cursor_railway.execute('''
            SELECT 
                COUNT(DISTINCT ROUND(location_lat::numeric, 1) || ',' || ROUND(location_lon::numeric, 1))
            FROM flood_hotspots
        ''')
        grid_cells = cursor_railway.fetchone()[0]
        
        cursor_railway.close()
        conn_railway.close()
        
        print(f"  Total hotspots in Railway: {count:,}")
        print(f"  Grid cells covered: {grid_cells}")
        
    except Exception as e:
        print(f"\n❌ Error connecting to Railway: {e}")
        print("Make sure DATABASE_URL is set correctly")
        return

def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv
    
    print("\n🚀 SafePath Expanded Coverage Sync Tool\n")
    
    migrate_to_railway(dry_run=dry_run)
    
    print("\n" + "="*70)
    print("NEXT STEPS:")
    print("="*70)
    print("\n1. Commit and push code changes:")
    print("   git add -A")
    print("   git commit -m 'Expand flood coverage across all of Zamboanga City'")
    print("   git push origin main")
    print("\n2. Frontend will automatically show expanded hotspots")
    print("   - All peripheral areas now have flood analysis")
    print("   - More balanced geographic coverage")
    print("\n3. Automatic updates will now cover all 21,669 roads")
    print("   - Runs every 60 minutes")
    print("   - Fills in high-risk areas as they develop")
    print("\n" + "="*70)

if __name__ == '__main__':
    main()
