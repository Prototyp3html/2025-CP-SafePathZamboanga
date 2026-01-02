#!/usr/bin/env python3
"""
Complete flood data sync from localhost to Railway
Syncs: flood_hotspots, flooded_roads_history, and flood_event_logs
"""

import sqlite3
import psycopg2
from psycopg2.extras import execute_batch
import os
from pathlib import Path

# Get environment variable
RAILWAY_DB_URL = os.getenv('DATABASE_URL')

if not RAILWAY_DB_URL:
    print("❌ DATABASE_URL environment variable not set")
    print("Set it with: $env:DATABASE_URL = 'your_connection_string'")
    exit(1)

LOCAL_DB = Path(__file__).parent / "safepath.db"

print("\n" + "="*70)
print("COMPLETE FLOOD DATA SYNC TO RAILWAY")
print("="*70)

try:
    # Connect to localhost
    local_conn = sqlite3.connect(str(LOCAL_DB))
    local_conn.row_factory = sqlite3.Row
    local_cursor = local_conn.cursor()
    
    # Connect to Railway
    railway_conn = psycopg2.connect(RAILWAY_DB_URL)
    railway_cursor = railway_conn.cursor()
    
    print("\n✅ Connected to both databases")
    
    # ===== SYNC FLOOD_HOTSPOTS =====
    print("\n📍 Syncing flood_hotspots...")
    railway_cursor.execute("TRUNCATE TABLE flood_hotspots RESTART IDENTITY CASCADE")
    
    local_cursor.execute("SELECT * FROM flood_hotspots")
    hotspots = local_cursor.fetchall()
    
    if hotspots:
        insert_query = """
            INSERT INTO flood_hotspots 
            (road_id, road_name, location_lat, location_lon, total_flood_events,
             total_flooded_hours, average_flood_duration_hours, last_flood_start,
             last_flood_end, days_since_last_flood, flood_risk_score, frequency_per_year,
             flood_months, rainy_season_floods, dry_season_floods, first_flood_recorded,
             last_updated)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        batch_size = 500
        for i in range(0, len(hotspots), batch_size):
            batch = hotspots[i:i+batch_size]
            data = [
                (
                    h['road_id'], h['road_name'], h['location_lat'], h['location_lon'],
                    h['total_flood_events'], h['total_flooded_hours'], 
                    h['average_flood_duration_hours'], h['last_flood_start'],
                    h['last_flood_end'], h['days_since_last_flood'], h['flood_risk_score'],
                    h['frequency_per_year'], h['flood_months'], h['rainy_season_floods'],
                    h['dry_season_floods'], h['first_flood_recorded'], h['last_updated']
                )
                for h in batch
            ]
            execute_batch(railway_cursor, insert_query, data, page_size=100)
            print(f"  ✓ Batch {i//batch_size + 1} inserted...")
        
        railway_conn.commit()
        print(f"✅ Synced {len(hotspots):,} flood_hotspots")
    
    # ===== SYNC FLOODED_ROADS_HISTORY =====
    print("\n🌊 Syncing flooded_roads_history...")
    railway_cursor.execute("TRUNCATE TABLE flooded_roads_history RESTART IDENTITY CASCADE")
    
    local_cursor.execute("SELECT * FROM flooded_roads_history")
    roads_history = local_cursor.fetchall()
    
    if roads_history:
        insert_query = """
            INSERT INTO flooded_roads_history
            (road_id, road_name, is_flooded, flood_level, times_flooded,
             first_flood_time, last_flood_start, last_flood_end,
             current_flood_duration_hours, updated_at, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        batch_size = 500
        for i in range(0, len(roads_history), batch_size):
            batch = roads_history[i:i+batch_size]
            data = [
                (
                    r['road_id'], r['road_name'], bool(r['is_flooded']), r['flood_level'],
                    r['times_flooded'], r['first_flood_time'], r['last_flood_start'],
                    r['last_flood_end'], r['current_flood_duration_hours'],
                    r['updated_at'], r['created_at']
                )
                for r in batch
            ]
            execute_batch(railway_cursor, insert_query, data, page_size=100)
            print(f"  ✓ Batch {i//batch_size + 1} inserted...")
        
        railway_conn.commit()
        print(f"✅ Synced {len(roads_history):,} flooded_roads_history records")
    
    # ===== SYNC FLOOD_EVENT_LOGS =====
    print("\n📋 Syncing flood_event_logs...")
    railway_cursor.execute("TRUNCATE TABLE flood_event_logs RESTART IDENTITY CASCADE")
    
    local_cursor.execute("SELECT * FROM flood_event_logs")
    event_logs = local_cursor.fetchall()
    
    if event_logs:
        insert_query = """
            INSERT INTO flood_event_logs
            (road_id, road_name, event_type, flood_level, rainfall_mm,
             elevation_m, distance_to_water_m, location_lat, location_lon,
             event_time, created_at, update_source)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        data = [
            (e['road_id'], e['road_name'], e['event_type'], e['flood_level'],
             e['rainfall_mm'], e['elevation_m'], e['distance_to_water_m'],
             e['location_lat'], e['location_lon'], e['event_time'],
             e['created_at'], e['update_source'])
            for e in event_logs
        ]
        execute_batch(railway_cursor, insert_query, data, page_size=100)
        railway_conn.commit()
        print(f"✅ Synced {len(event_logs):,} flood_event_logs")
    
    # Verify sync
    print("\n" + "="*70)
    print("VERIFICATION")
    print("="*70)
    
    railway_cursor.execute("SELECT COUNT(*) FROM flood_hotspots")
    print(f"✓ Railway flood_hotspots: {railway_cursor.fetchone()[0]:,}")
    
    railway_cursor.execute("SELECT COUNT(*) FROM flooded_roads_history")
    print(f"✓ Railway flooded_roads_history: {railway_cursor.fetchone()[0]:,}")
    
    railway_cursor.execute("SELECT COUNT(*) FROM flood_event_logs")
    print(f"✓ Railway flood_event_logs: {railway_cursor.fetchone()[0]:,}")
    
    local_conn.close()
    railway_conn.close()
    
    print("\n" + "="*70)
    print("✅ COMPLETE FLOOD DATA SYNC SUCCESS!")
    print("="*70)
    print("\nNext steps:")
    print("1. Hard refresh your deployed site")
    print("2. Check admin dashboard for latest flood data")
    print("="*70 + "\n")
    
except Exception as e:
    print(f"\n❌ Error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
