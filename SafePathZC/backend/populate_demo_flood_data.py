#!/usr/bin/env python3
"""
Populate realistic sample flood data for demonstration
Scenarios:
1. Dec 14: Heavy rain (5mm) with flooding on multiple roads
2. Dec 17: Moderate rain (2mm) for 3 hours on different roads  
3. Dec 22: No rain (present)
"""

import os
from datetime import datetime, timedelta, timezone
import random
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
import pytz

# Philippine Standard Time (UTC+8)
PHILIPPINE_TZ = pytz.timezone('Asia/Manila')

# Production database URL
PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

db_engine = create_engine(PRODUCTION_DB_URL)

# Import models
import sys
sys.path.insert(0, os.path.dirname(__file__))
from models import FloodEventLog, FloodHotspot

# Sample roads in Zamboanga that frequently flood
SAMPLE_ROADS = [
    {"road_id": "w87470433", "road_name": "Road 1", "lat": 6.9376, "lon": 122.1542},
    {"road_id": "w87470023", "road_name": "Road 4", "lat": 6.9049, "lon": 122.0755},
    {"road_id": "w87470024", "road_name": "Road 5", "lat": 6.9050, "lon": 122.0743},
    {"road_id": "w87470025", "road_name": "Road 6", "lat": 6.9116, "lon": 122.0608},
    {"road_id": "w87470431", "road_name": "Road 7", "lat": 6.9054, "lon": 122.0782},
    {"road_id": "w87470435", "road_name": "Road 9", "lat": 6.9059, "lon": 122.0780},
    {"road_id": "w87470439", "road_name": "Road 10", "lat": 6.9043, "lon": 122.0797},
    {"road_id": "w87470441", "road_name": "Road 11", "lat": 6.9043, "lon": 122.0797},
    {"road_id": "w87473775", "road_name": "Road 24", "lat": 6.9140, "lon": 122.0639},
    {"road_id": "w87473776", "road_name": "Road 25", "lat": 6.9061, "lon": 122.0717},
    {"road_id": "w87473777", "road_name": "Road 26", "lat": 6.9103, "lon": 122.0703},
    {"road_id": "w87473779", "road_name": "Road 27", "lat": 6.9102, "lon": 122.0699},
]

def populate_sample_flood_data():
    """Populate sample flood events with specific dates and scenarios"""
    
    SessionLocal = __import__('sqlalchemy.orm', fromlist=['sessionmaker']).sessionmaker(bind=db_engine)
    db: Session = SessionLocal()
    
    try:
        print("[*] Populating sample flood data...")
        
        # Define scenarios
        now = datetime.now(PHILIPPINE_TZ)
        
        # Scenario 1: Heavy rain on Dec 14 (8 days ago)
        # 5mm rainfall, flooding lasted 6-8 hours
        dec_14 = now - timedelta(days=8)
        dec_14_start = dec_14.replace(hour=10, minute=0, second=0, microsecond=0)
        
        # Scenario 2: Moderate rain on Dec 17 (5 days ago)  
        # 2mm rainfall, flooding lasted 3 hours
        dec_17 = now - timedelta(days=5)
        dec_17_start = dec_17.replace(hour=14, minute=0, second=0, microsecond=0)
        
        events_created = 0
        
        # Add Dec 14 heavy rain events (first 8 roads)
        for i, road in enumerate(SAMPLE_ROADS[:8]):
            duration = random.randint(6, 8)  # 6-8 hours
            
            # Flood start
            flood_start = FloodEventLog(
                road_id=road['road_id'],
                road_name=road['road_name'],
                event_type='flood_start',
                event_time=dec_14_start + timedelta(minutes=random.randint(0, 30)),
                flood_level='medium' if i % 2 == 0 else 'high',
                rainfall_mm=5.0,
                elevation_m=random.uniform(2, 15),
                distance_to_water_m=random.uniform(50, 300),
                location_lat=road['lat'],
                location_lon=road['lon']
            )
            db.add(flood_start)
            
            # Flood end
            flood_end = FloodEventLog(
                road_id=road['road_id'],
                road_name=road['road_name'],
                event_type='flood_end',
                event_time=flood_start.event_time + timedelta(hours=duration),
                flood_level='medium' if i % 2 == 0 else 'high',
                rainfall_mm=5.0,
                elevation_m=flood_start.elevation_m,
                distance_to_water_m=flood_start.distance_to_water_m,
                location_lat=road['lat'],
                location_lon=road['lon']
            )
            db.add(flood_end)
            events_created += 2
            print(f"  [Dec 14] {road['road_name']}: 5mm rainfall, {duration}h flooding")
        
        # Add Dec 17 moderate rain events (last 4 roads + some overlap)
        for i, road in enumerate(SAMPLE_ROADS[4:]):
            # Flood start
            flood_start = FloodEventLog(
                road_id=road['road_id'],
                road_name=road['road_name'],
                event_type='flood_start',
                event_time=dec_17_start + timedelta(minutes=random.randint(0, 30)),
                flood_level='low',
                rainfall_mm=2.0,
                elevation_m=random.uniform(2, 15),
                distance_to_water_m=random.uniform(50, 300),
                location_lat=road['lat'],
                location_lon=road['lon']
            )
            db.add(flood_start)
            
            # Flood end (3 hours)
            flood_end = FloodEventLog(
                road_id=road['road_id'],
                road_name=road['road_name'],
                event_type='flood_end',
                event_time=flood_start.event_time + timedelta(hours=3),
                flood_level='low',
                rainfall_mm=2.0,
                elevation_m=flood_start.elevation_m,
                distance_to_water_m=flood_start.distance_to_water_m,
                location_lat=road['lat'],
                location_lon=road['lon']
            )
            db.add(flood_end)
            events_created += 2
            print(f"  [Dec 17] {road['road_name']}: 2mm rainfall, 3h flooding")
        
        db.commit()
        print(f"\n[+] Created {events_created} sample flood events")
        
        # Verify data
        total_events = db.query(FloodEventLog).count()
        event_types = db.query(FloodEventLog.event_type, __import__('sqlalchemy', fromlist=['func']).func.count(FloodEventLog.id)).group_by(FloodEventLog.event_type).all()
        
        print(f"\n[*] Verification:")
        print(f"    Total flood events: {total_events}")
        for event_type, count in event_types:
            print(f"    {event_type}: {count}")
        
        print("\n[!] IMPORTANT: Run hotspot recalculation on your production dashboard!")
        print("    Click 'Update Flood Data Now' to calculate risk scores")
        
    except Exception as e:
        print(f"[!] Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("=" * 60)
    print("POPULATE SAMPLE FLOOD DATA FOR DEMONSTRATION")
    print("=" * 60)
    populate_sample_flood_data()
    print("=" * 60)
