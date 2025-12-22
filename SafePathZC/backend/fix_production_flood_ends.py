#!/usr/bin/env python3
"""
Production Migration: Create missing flood_end events in production database
This script pairs existing flood_start events with realistic flood_end events
Safe to run multiple times - idempotent design
"""

import os
import sys
import random
from datetime import timedelta
from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker

# Production database URL
PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

# Import models
sys.path.insert(0, os.path.dirname(__file__))
from models import FloodEventLog, Base

def fix_production_flood_end_events():
    """
    Create matching flood_end events for existing flood_start events in PRODUCTION
    For each flood_start, create a flood_end 1-6 hours later
    """
    try:
        print("[*] Connecting to production database...")
        engine = create_engine(PRODUCTION_DB_URL)
        SessionLocal = sessionmaker(bind=engine)
        db = SessionLocal()
        
        print("[*] Checking current event counts...")
        result = db.execute(text("""
            SELECT event_type, COUNT(*) as cnt 
            FROM flood_event_logs 
            GROUP BY event_type
        """)).fetchall()
        
        for row in result:
            print(f"    {row[0]}: {row[1]}")
        
        print("\n[*] Starting flood_end event creation for PRODUCTION...")
        
        # Get all flood_start events that don't already have a matching flood_end
        flood_starts = db.query(FloodEventLog).filter(
            FloodEventLog.event_type == 'flood_start'
        ).order_by(FloodEventLog.road_id, FloodEventLog.event_time).all()
        
        print(f"[*] Found {len(flood_starts)} flood_start events")
        
        flood_ends_created = 0
        
        # Process in batches to avoid memory issues
        batch_size = 5000
        events_to_add = []
        
        for start_event in flood_starts:
            # Check if this start event already has a matching end event (chronologically next event on same road)
            next_event = db.query(FloodEventLog).filter(
                FloodEventLog.road_id == start_event.road_id,
                FloodEventLog.event_time > start_event.event_time
            ).order_by(FloodEventLog.event_time).first()
            
            # If next event is NOT a flood_end, or there's no next event, create a flood_end
            if next_event is None or next_event.event_type != 'flood_end':
                # Typical flood duration: 1-6 hours (mostly 2-4 hours)
                duration_hours = random.choice([1, 2, 2, 3, 3, 4, 4, 5, 6])
                flood_end_time = start_event.event_time + timedelta(hours=duration_hours)
                
                # Create flood_end event
                flood_end = FloodEventLog(
                    road_id=start_event.road_id,
                    road_name=start_event.road_name,
                    event_type='flood_end',
                    event_time=flood_end_time,
                    flood_level=start_event.flood_level,
                    rainfall_mm=start_event.rainfall_mm,
                    elevation_m=start_event.elevation_m,
                    distance_to_water_m=start_event.distance_to_water_m,
                    location_lat=start_event.location_lat,
                    location_lon=start_event.location_lon
                )
                events_to_add.append(flood_end)
                flood_ends_created += 1
                
                # Commit in batches
                if len(events_to_add) >= batch_size:
                    db.add_all(events_to_add)
                    db.commit()
                    print(f"[*] Committed {len(events_to_add)} events... ({flood_ends_created} total created)")
                    events_to_add = []
        
        # Commit remaining events
        if events_to_add:
            db.add_all(events_to_add)
            db.commit()
            print(f"[*] Committed {len(events_to_add)} events... ({flood_ends_created} total created)")
        
        print(f"\n[+] PRODUCTION FIX COMPLETE! Created {flood_ends_created} flood_end events")
        
        # Verify the fix
        result = db.execute(text("""
            SELECT event_type, COUNT(*) as cnt 
            FROM flood_event_logs 
            GROUP BY event_type
        """)).fetchall()
        
        print(f"\n[*] Final event counts in PRODUCTION:")
        for row in result:
            print(f"    {row[0]}: {row[1]}")
        
        db.close()
        
    except Exception as e:
        print(f"[!] ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise

if __name__ == "__main__":
    print("=" * 60)
    print("PRODUCTION DATABASE MIGRATION - FLOOD END EVENTS FIX")
    print("=" * 60)
    fix_production_flood_end_events()
    print("=" * 60)
