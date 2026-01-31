#!/usr/bin/env python3
"""
Generate flood test data with ALL dates within last 30 days
"""

import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL)

with db_engine.connect() as conn:
    logger.info("🧹 Clearing old test data...")
    conn.execute(text("DELETE FROM flood_event_logs WHERE road_id LIKE 'wz%' OR road_id LIKE 'w87%'"))
    conn.execute(text("DELETE FROM flood_hotspots WHERE road_id LIKE 'wz%' OR road_id LIKE 'w87%'"))
    conn.commit()
    logger.info("✅ Cleared")
    
    # Create 109 roads within Zamboanga City bounds
    sample_roads = [
        ('w87470023', 'Rio Hondo', 6.9119, 122.0790, 3.2),
        ('w87470431', 'Tetuan Main Road', 6.9210, 122.0790, 4.1),
        ('w87470435', 'San Jose Gusu Road', 6.9420, 122.0730, 5.5),
        ('w87470439', 'Canelar Road', 6.9060, 122.0800, 6.2),
        ('w87470023a', 'Sta. Maria Road', 6.9050, 122.0740, 7.1),
        ('w87470023b', 'Pasonanca Road', 6.9380, 122.0620, 8.3),
        ('w87470023c', 'Zamboanga City Main', 6.9000, 122.0700, 4.8),
        ('w87470023d', 'Lunzuran Area', 6.9119, 122.0790, 5.0),
        ('w87470023e', 'Recodo Area', 6.8950, 122.0850, 6.0),
    ]
    
    # Generate 100 more roads
    for i in range(100):
        lat = random.uniform(6.80, 6.99)
        lon = random.uniform(121.85, 122.34)
        elev = random.randint(2, 15)
        sample_roads.append((
            f'wz{100000 + i}',
            f'Road {i+1} - Zamboanga',
            lat,
            lon,
            elev
        ))
    
    logger.info(f"📍 Generated {len(sample_roads)} roads")
    
    # Use date range: Jan 2 - Jan 31 (all within last 30 days from Jan 31)
    start_date = datetime(2026, 1, 2)
    end_date = datetime(2026, 1, 31)
    date_range_days = (end_date - start_date).days
    
    logger.info(f"📅 Date range: {start_date.date()} to {end_date.date()} ({date_range_days} days)")
    logger.info(f"   ✅ All within 'last 30 days' from Jan 31")
    
    # Generate events
    all_events = []
    events_per_road = {}
    
    for road_id, road_name, lat, lon, elevation in sample_roads:
        num_events = random.randint(2, 6)
        events_per_road[road_id] = num_events
        
        for event_num in range(num_events):
            random_offset = random.randint(0, date_range_days - 1)
            event_start_time = start_date + timedelta(
                days=random_offset, 
                hours=random.randint(0, 23), 
                minutes=random.randint(0, 59)
            )
            
            # Flood start
            all_events.append({
                'road_id': road_id,
                'road_name': road_name,
                'event_type': 'flood_start',
                'event_time': event_start_time,
                'location_lat': lat,
                'location_lon': lon,
                'elevation_m': elevation,
                'distance_to_water_m': random.randint(10, 500),
                'flood_level': random.choice(['low', 'medium', 'high']),
                'rainfall_mm': 0.0
            })
            
            # Flood end (3 hours later)
            event_end_time = event_start_time + timedelta(hours=3)
            all_events.append({
                'road_id': road_id,
                'road_name': road_name,
                'event_type': 'flood_end',
                'event_time': event_end_time,
                'location_lat': lat,
                'location_lon': lon,
                'elevation_m': elevation,
                'distance_to_water_m': random.randint(10, 500),
                'flood_level': random.choice(['low', 'medium', 'high']),
                'rainfall_mm': 0.0
            })
    
    # Batch insert
    logger.info(f"🚀 Inserting {len(all_events)} events...")
    conn.execute(text("""
        INSERT INTO flood_event_logs 
        (road_id, road_name, event_type, event_time, location_lat, location_lon, 
         elevation_m, distance_to_water_m, flood_level, rainfall_mm)
        VALUES (:road_id, :road_name, :event_type, :event_time, :location_lat, :location_lon, 
               :elevation_m, :distance_to_water_m, :flood_level, :rainfall_mm)
    """), all_events)
    
    conn.commit()
    logger.info(f"✅ Inserted {len(all_events)} events")
    
    # Verify
    stats = conn.execute(text("""
        SELECT 
            COUNT(DISTINCT road_id) as roads,
            MIN(event_time) as min_date,
            MAX(event_time) as max_date
        FROM flood_event_logs
        WHERE road_id LIKE 'wz%' OR road_id LIKE 'w87%'
    """)).fetchone()
    
    logger.info(f"""
✅ COMPLETE
   Roads: {stats[0]}
   Date range: {stats[1].date()} to {stats[2].date()}
   🎉 ALL WITHIN LAST 30 DAYS!
    """)
