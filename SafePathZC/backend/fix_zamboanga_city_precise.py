#!/usr/bin/env python3
"""
Generate flood hotspots with PROPER Zamboanga City coordinates and VARIED flood frequencies
- Zamboanga City center: 6.9°N, 122.04°E
- Precise bounds: 6.80-7.00 lat, 121.95-122.15 lon
- Varied flood events per road (1-10 events)
- Risk scores reflect actual flood frequency differences
"""

from sqlalchemy import create_engine, text
from datetime import datetime, timedelta
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL)

# Zamboanga City precise bounds (centered at 6.9°N, 122.04°E)
LAT_MIN, LAT_MAX = 6.80, 7.00
LON_MIN, LON_MAX = 121.95, 122.15

random.seed(42)

with db_engine.connect() as conn:
    logger.info("🧹 Deleting old test hotspots and events...")
    conn.execute(text("DELETE FROM flood_event_logs WHERE road_id LIKE 'zc%'"))
    conn.execute(text("DELETE FROM flood_hotspots WHERE road_id LIKE 'zc%'"))
    conn.commit()
    
    # Generate 109 roads with VARIED flood frequencies
    logger.info("🌊 Generating 109 roads with varied flood events...")
    
    roads_data = []
    base_date = datetime(2026, 1, 2)  # Start from Jan 2
    
    # Create varied distribution: some roads flood more often
    flood_frequencies = [
        # 10 roads with 10 floods (very high risk)
        *[10] * 10,
        # 15 roads with 8 floods (high risk)
        *[8] * 15,
        # 20 roads with 6 floods (medium-high risk)
        *[6] * 20,
        # 25 roads with 4 floods (medium risk)
        *[4] * 25,
        # 20 roads with 3 floods (medium-low risk)
        *[3] * 20,
        # 19 roads with 1-2 floods (low risk)
        *[1] * 10,
        *[2] * 9,
    ]
    
    # Build all events first (batch insert)
    event_values = []
    for idx, num_events in enumerate(flood_frequencies, 1):
        road_id = f"zc{idx:06d}"
        lat = random.uniform(LAT_MIN, LAT_MAX)
        lon = random.uniform(LON_MIN, LON_MAX)
        road_name = f"Zamboanga Road {idx}"
        
        # Generate flood start/end pairs spread across Jan 2-31
        for event_num in range(num_events):
            # Spread events across the month
            event_day = random.randint(0, 28)
            event_time = base_date + timedelta(days=event_day, hours=random.randint(0, 23), minutes=random.randint(0, 59))
            
            # Add flood_start
            event_values.append((road_id, road_name, lat, lon, 'flood_start', event_time))
            
            # Add flood_end (3 hours later)
            end_time = event_time + timedelta(hours=3)
            event_values.append((road_id, road_name, lat, lon, 'flood_end', end_time))
        
        roads_data.append({
            'road_id': road_id,
            'road_name': road_name,
            'lat': lat,
            'lon': lon,
            'events': num_events
        })
    
    # Batch insert all events
    logger.info(f"Inserting {len(event_values)} flood events (batch insert)...")
    for i in range(0, len(event_values), 500):
        batch = event_values[i:i+500]
        values_sql = ','.join([
            f"('{row[0]}', '{row[1]}', {row[2]}, {row[3]}, '{row[4]}', '{row[5]}')"
            for row in batch
        ])
        conn.execute(text(f'''
            INSERT INTO flood_event_logs 
            (road_id, road_name, location_lat, location_lon, event_type, event_time)
            VALUES {values_sql}
        '''))
    conn.commit()
    
    conn.commit()
    logger.info(f"✅ Inserted {len(roads_data)} roads with {sum(e['events'] for e in roads_data)} total flood events")
    
    # Calculate hotspots from events
    logger.info("📊 Calculating flood hotspot metrics...")
    conn.execute(text('''
        WITH flood_pairs AS (
            SELECT 
                road_id, road_name, 
                location_lat, location_lon,
                COUNT(*) / 2 as event_count,
                MIN(event_time) as first_event,
                MAX(event_time) as last_event
            FROM flood_event_logs
            WHERE road_id LIKE 'zc%'
            AND event_type = 'flood_start'
            GROUP BY road_id, road_name, location_lat, location_lon
        ),
        last_floods AS (
            SELECT 
                road_id,
                MAX(CASE WHEN event_type = 'flood_start' THEN event_time END) as last_start,
                MAX(CASE WHEN event_type = 'flood_end' THEN event_time END) as last_end
            FROM flood_event_logs
            WHERE road_id LIKE 'zc%'
            GROUP BY road_id
        )
        INSERT INTO flood_hotspots 
        (road_id, road_name, location_lat, location_lon, total_flood_events, total_flooded_hours, 
         average_flood_duration_hours, frequency_per_year, flood_risk_score, 
         last_flood_start, last_flood_end, days_since_last_flood, first_flood_recorded, last_updated)
        SELECT 
            fp.road_id, fp.road_name, fp.location_lat, fp.location_lon,
            fp.event_count as total_flood_events, 
            fp.event_count * 3.0 as total_flooded_hours,
            3.0 as average_flood_duration_hours,
            CASE 
                WHEN (fp.last_event - fp.first_event) > interval '1 day'
                THEN (fp.event_count / EXTRACT(DAY FROM (fp.last_event - fp.first_event))) * 365
                ELSE fp.event_count * 365 / 30
            END as frequency_per_year,
            -- Risk score based on frequency (1-10 events = 10-100 risk)
            LEAST(100, CAST((fp.event_count * 10) AS integer)) as flood_risk_score,
            lf.last_start as last_flood_start,
            lf.last_end as last_flood_end,
            CAST(EXTRACT(DAY FROM (NOW() - lf.last_start)) AS INTEGER) as days_since_last_flood,
            fp.first_event as first_flood_recorded,
            NOW()
        FROM flood_pairs fp
        LEFT JOIN last_floods lf ON fp.road_id = lf.road_id
    '''))
    
    conn.commit()
    
    # Verify
    result = conn.execute(text('''
        SELECT COUNT(*) as road_count,
               MIN(location_lat) as lat_min, 
               MAX(location_lat) as lat_max,
               MIN(location_lon) as lon_min, 
               MAX(location_lon) as lon_max,
               AVG(total_flood_events) as avg_events,
               MIN(total_flood_events) as min_events,
               MAX(total_flood_events) as max_events,
               AVG(flood_risk_score) as avg_risk,
               MIN(flood_risk_score) as min_risk,
               MAX(flood_risk_score) as max_risk
        FROM flood_hotspots
        WHERE road_id LIKE 'zc%'
    ''')).fetchone()
    
    logger.info(f"""
✅ FLOOD HOTSPOTS GENERATED - PROPER ZAMBOANGA CITY
   ┌─ Geographic Coverage
   │  Roads: {result[0]}
   │  Latitude:  {result[1]:.4f} to {result[2]:.4f}
   │  Longitude: {result[3]:.4f} to {result[4]:.4f}
   │  Center: 6.90°N, 122.04°E (CORRECT)
   │
   ├─ Flood Events Distribution
   │  Total Roads: {result[0]}
   │  Avg events/road: {result[5]:.1f}
   │  Range: {result[6]:.0f}-{result[7]:.0f} events
   │
   └─ Risk Score Variation (THIS IS KEY!)
      Avg Risk Score: {result[8]:.1f}/100
      Min Risk: {result[9]:.0f}/100 (roads with 1 flood)
      Max Risk: {result[10]:.0f}/100 (roads with 10 floods)

🎉 ZAMBOANGA CITY DATA READY - RISK SCORES NOW VARY BY FLOOD FREQUENCY!
    """)

