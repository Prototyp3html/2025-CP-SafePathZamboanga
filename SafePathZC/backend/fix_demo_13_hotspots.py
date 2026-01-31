#!/usr/bin/env python3
"""
Generate 13 demo flood hotspots with varying flood frequencies
Each hotspot has different number of flood events (1-10)
Risk scores vary based on actual flood frequency
"""

from sqlalchemy import create_engine, text
from datetime import datetime, timedelta
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL)

# 13 demo locations in Zamboanga City
DEMO_ROADS = [
    ("wz001", "Calinog Street", 6.9050, 122.0650),
    ("wz002", "Alvarez Street", 6.9100, 122.0700),
    ("wz003", "Real Street", 6.9150, 122.0750),
    ("wz004", "Mayor Jaldon Avenue", 6.8950, 122.0800),
    ("wz005", "Siguenza Street", 6.8900, 122.0600),
    ("wz006", "Colon Street", 6.8850, 122.0550),
    ("wz007", "Lanao Street", 6.9200, 122.0650),
    ("wz008", "Zamboanga-Pagadian Road", 6.9250, 122.0900),
    ("wz009", "Aurora Avenue", 6.8800, 122.0900),
    ("wz010", "Margarita Avenue", 6.9300, 122.0750),
    ("wz011", "Boalan Bridge", 6.8950, 122.1050),
    ("wz012", "Nunez Street", 6.9050, 122.1100),
    ("wz013", "Samal Road", 6.9150, 122.0500),
]

with db_engine.connect() as conn:
    logger.info("🧹 Cleaning old demo data...")
    conn.execute(text("DELETE FROM flood_hotspots WHERE road_id LIKE 'wz%'"))
    conn.execute(text("DELETE FROM flood_event_logs WHERE road_id LIKE 'wz%'"))
    conn.commit()
    
    logger.info("🌊 Generating flood events (varying 1-10 per road)...")
    
    # Generate flood events with varying frequencies
    # Some roads flood 1-3 times, some 4-7 times, some 8-10 times
    flood_counts = {
        "wz001": 1, "wz002": 2, "wz003": 3,
        "wz004": 4, "wz005": 5, "wz006": 6,
        "wz007": 7, "wz008": 8, "wz009": 9,
        "wz010": 10, "wz011": 3, "wz012": 6, "wz013": 5,
    }
    
    base_date = datetime(2026, 1, 2)
    
    for idx, (road_id, road_name, lat, lon) in enumerate(DEMO_ROADS):
        num_events = flood_counts[road_id]
        
        # Create flood_start and flood_end pairs
        for event_num in range(num_events):
            # Spread events across January 2-31
            event_date = base_date + timedelta(days=random.randint(0, 28))
            event_hour = random.randint(0, 23)
            event_time = event_date.replace(hour=event_hour)
            
            # flood_start
            conn.execute(text(f'''
                INSERT INTO flood_event_logs (road_id, road_name, location_lat, location_lon, event_type, event_time)
                VALUES ('{road_id}', '{road_name}', {lat}, {lon}, 'flood_start', '{event_time}')
            '''))
            
            # flood_end (3 hours later)
            end_time = event_time + timedelta(hours=3)
            conn.execute(text(f'''
                INSERT INTO flood_event_logs (road_id, road_name, location_lat, location_lon, event_type, event_time)
                VALUES ('{road_id}', '{road_name}', {lat}, {lon}, 'flood_end', '{end_time}')
            '''))
    
    conn.commit()
    
    logger.info("📊 Calculating hotspot metrics...")
    
    # Calculate metrics for each road
    for road_id, road_name, lat, lon in DEMO_ROADS:
        result = conn.execute(text(f'''
            SELECT COUNT(*) / 2 as event_count,
                   MIN(event_time) as first_event,
                   MAX(event_time) as last_event,
                   MAX(CASE WHEN event_type = 'flood_start' THEN event_time END) as last_start,
                   MAX(CASE WHEN event_type = 'flood_end' THEN event_time END) as last_end
            FROM flood_event_logs
            WHERE road_id = '{road_id}' AND event_type = 'flood_start'
        ''')).fetchone()
        
        event_count, first_event, last_event, last_start, last_end = result
        
        # Calculate frequency per year
        days_span = (last_event - first_event).days
        if days_span > 1:
            frequency_per_year = (event_count / days_span) * 365
        else:
            frequency_per_year = event_count * 365 / 30
        
        # Calculate risk score (0-100 based on frequency)
        # 1 event = 10 risk, 5 events = 50 risk, 10 events = 100 risk
        risk_score = min(100, event_count * 10)
        
        # Days since last flood
        days_since = (datetime.now() - last_start).days if last_start else None
        
        # Prepare NULL values properly
        last_end_str = f"'{last_end}'" if last_end else "NULL"
        days_since_str = days_since if days_since is not None else "NULL"
        
        conn.execute(text(f'''
            INSERT INTO flood_hotspots 
            (road_id, road_name, location_lat, location_lon, total_flood_events, total_flooded_hours, 
             average_flood_duration_hours, frequency_per_year, flood_risk_score, 
             last_flood_start, last_flood_end, days_since_last_flood, first_flood_recorded, last_updated)
            VALUES ('{road_id}', '{road_name}', {lat}, {lon}, {event_count}, {event_count * 3.0},
                    3.0, {frequency_per_year}, {risk_score},
                    '{last_start}', {last_end_str}, {days_since_str}, '{first_event}', NOW())
        '''))
    
    conn.commit()
    
    # Verify
    result = conn.execute(text('''
        SELECT COUNT(*) as roads,
               MIN(location_lat) as min_lat, MAX(location_lat) as max_lat,
               MIN(location_lon) as min_lon, MAX(location_lon) as max_lon,
               MIN(flood_risk_score) as min_risk, MAX(flood_risk_score) as max_risk,
               AVG(frequency_per_year) as avg_freq
        FROM flood_hotspots
        WHERE road_id LIKE 'wz%'
    ''')).fetchone()
    
    roads, min_lat, max_lat, min_lon, max_lon, min_risk, max_risk, avg_freq = result
    
    logger.info(f"""
✅ 13 DEMO HOTSPOTS CREATED
   Roads: {roads}
   Latitude:  {min_lat:.4f} to {max_lat:.4f}
   Longitude: {min_lon:.4f} to {max_lon:.4f}
   Risk Score: {min_risk:.0f} to {max_risk:.0f}
   Avg Frequency: {avg_freq:.1f}/year
   
🎯 EACH ROAD HAS DIFFERENT FLOOD HISTORY!
    """)
    
    # Show details
    hotspots = conn.execute(text('''
        SELECT road_id, road_name, total_flood_events, flood_risk_score, frequency_per_year
        FROM flood_hotspots
        WHERE road_id LIKE 'wz%'
        ORDER BY flood_risk_score DESC
    ''')).fetchall()
    
    logger.info("\n📍 Hotspot Details:")
    for hs in hotspots:
        logger.info(f"   {hs[0]} - {hs[1]}: {hs[2]} events, Risk={hs[3]:.0f}, Freq={hs[4]:.0f}/year")
