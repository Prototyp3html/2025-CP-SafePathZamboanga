#!/usr/bin/env python3
"""
Generate realistic flood event distribution for SafePath Zamboanga
Creates multiple flood events per road across the entire date range
This replaces the broken single-event data
"""

import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text, insert
from sqlalchemy.orm import Session
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database connection
DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL, echo=False)

def generate_realistic_flood_data():
    """Generate 2-6 flood events per road spread across date range"""
    
    with db_engine.connect() as conn:
        # First, DELETE all existing flood event data
        logger.info("❌ Clearing all existing flood events...")
        conn.execute(text("DELETE FROM flood_event_logs"))
        conn.execute(text("DELETE FROM flood_hotspots"))
        conn.commit()
        logger.info("✅ Cleared flood_event_logs and flood_hotspots")
        
        # Get sample roads from flood_hotspots (use all roads that existed before)
        # If no roads, use hardcoded sample roads
        logger.info("📍 Creating sample roads for testing...")
        
        # Create list of sample roads - use common OSM road IDs from Philippines
        sample_roads = [
            ('w87470023', 'Salagubang Road', 6.9119, 122.0790, 3.2),
            ('w87470431', 'Rio Hondo', 6.9119, 122.0790, 3.5),
            ('w87470435', 'Tetuan Road', 6.9210, 122.0790, 4.1),
            ('w87470441', 'San Jose Road', 6.9420, 122.0730, 5.5),
            ('w87470439', 'Canelar Road', 6.9060, 122.0800, 6.2),
            ('ww132064309', 'Zamboanga Main St', 6.9000, 122.0700, 4.8),
            ('ww238266611', 'Pasonanca Ave', 6.9380, 122.0620, 8.3),
            ('ww93288055', 'Sta Maria Road', 6.9050, 122.0740, 7.1),
            ('ww132064305', 'Tetuan Main', 6.9300, 122.0750, 5.9),
        ]
        
        # Extend with more roads for proper testing
        for i in range(100):
            sample_roads.append((
                f'ww{132000000 + i}',
                f'Road {i+1}',
                6.8 + (i % 40) * 0.01,  # Vary latitude
                121.85 + (i % 50) * 0.01,  # Vary longitude
                random.randint(2, 15)  # Random elevation
            ))
        
        logger.info(f"Using {len(sample_roads)} roads for flood event generation")
        
        # Date range for events
        start_date = datetime(2025, 12, 14)
        end_date = datetime(2026, 1, 6)
        date_range_days = (end_date - start_date).days
        
        logger.info(f"📅 Date range: {start_date.date()} to {end_date.date()} ({date_range_days} days)")
        
        # Prepare all events for batch insert
        all_events = []
        events_by_road = {}
        
        # For each road, create 2-6 flood event pairs
        for road_id, road_name, lat, lon, elevation in sample_roads:
            num_events = random.randint(2, 6)  # 2-6 flood events per road
            events_by_road[road_id] = num_events
            
            # Generate event times spread across the date range
            for event_num in range(num_events):
                # Random day within range
                random_offset = random.randint(0, date_range_days - 1)
                event_start_time = start_date + timedelta(days=random_offset, hours=random.randint(0, 23), minutes=random.randint(0, 59))
                
                # flood_start event
                all_events.append({
                    'road_id': road_id,
                    'road_name': road_name,
                    'event_type': 'flood_start',
                    'event_time': event_start_time,
                    'location_lat': lat,
                    'location_lon': lon,
                    'elevation_m': elevation,
                    'distance_to_water_m': random.randint(10, 500),
                    'flood_level': random.choice(['low', 'medium', 'high'])
                })
                
                # flood_end event (3 hours after start)
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
                    'flood_level': random.choice(['low', 'medium', 'high'])
                })
        
        # Batch insert all events at once
        logger.info(f"🚀 Inserting {len(all_events)} events via batch insert...")
        conn.execute(text("""
            INSERT INTO flood_event_logs 
            (road_id, road_name, event_type, event_time, location_lat, location_lon, 
             elevation_m, distance_to_water_m, flood_level)
            VALUES (:road_id, :road_name, :event_type, :event_time, :location_lat, :location_lon, 
                   :elevation_m, :distance_to_water_m, :flood_level)
        """), all_events)
        
        conn.commit()
        logger.info(f"✅ Generated {len(all_events)} flood events")
        
        event_counts = list(events_by_road.values())
        logger.info(f"📊 Event distribution per road:")
        logger.info(f"   Min: {min(event_counts)}, Max: {max(event_counts)}, Avg: {sum(event_counts)/len(event_counts):.1f}")
        
        # Verify data
        stats = conn.execute(text("""
            SELECT 
                COUNT(*) as total_events,
                COUNT(DISTINCT road_id) as total_roads,
                COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END) as flood_starts,
                COUNT(CASE WHEN event_type = 'flood_end' THEN 1 END) as flood_ends
            FROM flood_event_logs
        """)).fetchone()
        
        logger.info(f"""
✅ DATA VERIFICATION:
   Total events: {stats[0]}
   Roads with events: {stats[1]}
   Flood starts: {stats[2]}
   Flood ends: {stats[3]}
   Start/End ratio: {stats[2] / max(stats[3], 1):.2f}
        """)
        
        return True

if __name__ == "__main__":
    try:
        generate_realistic_flood_data()
        logger.info("🎉 Realistic flood data generation completed!")
        logger.info("⏰ Next: Restart the backend or trigger cron to recalculate metrics")
    except Exception as e:
        logger.error(f"❌ Error: {e}", exc_info=True)
