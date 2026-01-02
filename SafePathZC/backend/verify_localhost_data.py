#!/usr/bin/env python3
"""Verify flood data in localhost database"""

import sqlite3
from pathlib import Path

# Find the database
db_path = Path(__file__).parent / "safepath.db"

if not db_path.exists():
    print(f"❌ Database not found at: {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    print("\n" + "="*60)
    print("LOCALHOST DATABASE VERIFICATION")
    print("="*60)
    
    # Check flood_hotspots
    print("\n📍 Flood Hotspots Table:")
    cursor.execute('SELECT COUNT(*) FROM flood_hotspots')
    hotspot_count = cursor.fetchone()[0]
    print(f"   Total records: {hotspot_count:,}")
    
    if hotspot_count > 0:
        cursor.execute('SELECT road_id, road_name, risk_score, last_flooded FROM flood_hotspots LIMIT 3')
        print(f"   Sample records:")
        for row in cursor.fetchall():
            print(f"     - {row[1]} (ID: {row[0]}, Risk: {row[2]}, Last: {row[3]})")
    
    # Check flood_events
    print("\n🌊 Flood Events Table:")
    cursor.execute('SELECT COUNT(*) FROM flood_events')
    event_count = cursor.fetchone()[0]
    print(f"   Total records: {event_count:,}")
    
    if event_count > 0:
        cursor.execute('SELECT road_id, event_time, water_level FROM flood_events ORDER BY event_time DESC LIMIT 3')
        print(f"   Recent events:")
        for row in cursor.fetchall():
            print(f"     - Road {row[0]} on {row[1]} (Level: {row[2]}m)")
    
    # Check latest event date
    print("\n📅 Data Timeline:")
    cursor.execute('SELECT MIN(event_time), MAX(event_time) FROM flood_events')
    min_date, max_date = cursor.fetchone()
    print(f"   Earliest event: {min_date}")
    print(f"   Latest event: {max_date}")
    
    conn.close()
    
    print("\n" + "="*60)
    print("✅ LOCALHOST DATA VERIFIED")
    print("="*60 + "\n")
    
except Exception as e:
    print(f"❌ Error: {e}")
    exit(1)
