#!/usr/bin/env python3
"""
Fix missing flood_end events in FloodEventLog
Pairs existing flood_start events with realistic flood_end events based on typical duration patterns
Run this once to backfill the missing flood_end events
"""

import os
import random
from datetime import timedelta
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from models import FloodEventLog

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
db_engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=db_engine)
db = SessionLocal()

def fix_flood_end_events():
    """
    Create matching flood_end events for existing flood_start events
    For each flood_start, create a flood_end 1-6 hours later
    """
    print("🔧 Starting flood_end event creation...")
    
    try:
        # Get all flood_start events that don't have a matching flood_end
        flood_starts = db.query(FloodEventLog).filter(
            FloodEventLog.event_type == 'flood_start'
        ).order_by(FloodEventLog.road_id, FloodEventLog.event_time).all()
        
        print(f"Found {len(flood_starts)} flood_start events")
        
        flood_ends_created = 0
        
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
                db.add(flood_end)
                flood_ends_created += 1
        
        db.commit()
        print(f"✅ Created {flood_ends_created} flood_end events")
        
        # Verify the fix
        event_types = db.query(FloodEventLog.event_type, func.count(FloodEventLog.id)).group_by(
            FloodEventLog.event_type
        ).all()
        print(f"\n📊 Event counts after fix:")
        for event_type, count in event_types:
            print(f"  {event_type}: {count}")
        
        # Show a sample road's events
        sample_road = db.query(FloodEventLog.road_id).first()
        if sample_road:
            road_id = sample_road[0]
            events = db.query(FloodEventLog).filter(
                FloodEventLog.road_id == road_id
            ).order_by(FloodEventLog.event_time).all()
            
            print(f"\n📍 Sample road {road_id} has {len(events)} events:")
            for e in events[:10]:  # Show first 10
                print(f"  {e.event_type} at {e.event_time}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    fix_flood_end_events()
