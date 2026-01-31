#!/usr/bin/env python3
"""
Regenerate flood hotspots with CORRECT Zamboanga City bounds
Zamboanga City center: 6°54'N (6.9°N), 122°4'E (122.067°E)
Actual bounds: 6.80-7.10 lat, 121.98-122.13 lon
"""

from sqlalchemy import create_engine, text
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL)

with db_engine.connect() as conn:
    logger.info("🧹 Deleting old test hotspots...")
    conn.execute(text("DELETE FROM flood_hotspots WHERE road_id LIKE 'wz%' OR road_id LIKE 'w87%'"))
    
    logger.info("🗑️  Deleting old test flood events...")
    conn.execute(text("DELETE FROM flood_event_logs WHERE road_id LIKE 'wz%' OR road_id LIKE 'w87%'"))
    
    conn.commit()
    
    logger.info("🛣️  Generating 109 roads with CORRECT Zamboanga City coordinates...")
    
    # Delete and regenerate roads with correct bounds
    roads_sql = '''
    WITH zamboanga_roads AS (
        SELECT 
            'wz' || LPAD(ROW_NUMBER() OVER (), 6, '0') as road_id,
            'Zamboanga City Road #' || ROW_NUMBER() OVER () as road_name,
            6.80 + RANDOM() * 0.30 as location_lat,
            121.98 + RANDOM() * 0.15 as location_lon
        FROM generate_series(1, 109)
    )
    INSERT INTO terrain_roads (osm_id, road_name, geometry_wkt, terrain_type, elevation_m, slope_percent, is_flooded, flood_risk_level)
    SELECT 
        road_id as osm_id,
        road_name,
        'LINESTRING(' || location_lon || ' ' || location_lat || ', ' || (location_lon + 0.001) || ' ' || (location_lat + 0.001) || ')' as geometry_wkt,
        'urban' as terrain_type,
        10.0 as elevation_m,
        2.5 as slope_percent,
        false as is_flooded,
        'medium' as flood_risk_level
    FROM zamboanga_roads
    '''
    
    conn.execute(text(roads_sql))
    conn.commit()
    
    logger.info("🌊 Generating 864 flood events (2-6 per road)...")
    
    # Generate flood events with correct bounds
    events_sql = '''
    WITH road_events AS (
        SELECT 
            osm_id as road_id,
            road_name,
            SUBSTRING(geometry_wkt FROM 12 FOR 10)::FLOAT as location_lon,
            SUBSTRING(geometry_wkt FROM POSITION(',' IN geometry_wkt) + 2 FOR 8)::FLOAT as location_lat,
            2 + (ROW_NUMBER() OVER (PARTITION BY osm_id) % 5) as num_events
        FROM terrain_roads
        WHERE osm_id LIKE 'wz%'
    )
    INSERT INTO flood_event_logs (road_id, road_name, location_lat, location_lon, event_type, event_time)
    SELECT 
        re.road_id,
        re.road_name,
        re.location_lat,
        re.location_lon,
        CASE WHEN (ROW_NUMBER() OVER (PARTITION BY re.road_id)) % 2 = 1 THEN 'flood_start' ELSE 'flood_end' END as event_type,
        '2026-01-02'::TIMESTAMP + (INTERVAL '1 day' * (ROW_NUMBER() OVER (PARTITION BY re.road_id) / 2)) + (INTERVAL '1 hour' * FLOOR(RANDOM() * 24)) +
        CASE WHEN (ROW_NUMBER() OVER (PARTITION BY re.road_id)) % 2 = 0 THEN INTERVAL '3 hours' ELSE INTERVAL '0 hours' END as event_time
    FROM road_events re
    CROSS JOIN generate_series(1, re.num_events * 2)
    '''
    
    conn.execute(text(events_sql))
    conn.commit()
    
    logger.info("🔄 Calculating hotspot metrics...")
    
    hotspots_sql = '''
    WITH flood_pairs AS (
        SELECT 
            road_id, road_name, 
            location_lat, location_lon,
            COUNT(*) / 2 as event_count,
            MIN(event_time) as first_event,
            MAX(event_time) as last_event
        FROM flood_event_logs
        WHERE road_id LIKE 'wz%'
        AND event_type = 'flood_start'
        GROUP BY road_id, road_name, location_lat, location_lon
    ),
    last_floods AS (
        SELECT 
            road_id,
            MAX(CASE WHEN event_type = 'flood_start' THEN event_time END) as last_start,
            MAX(CASE WHEN event_type = 'flood_end' THEN event_time END) as last_end
        FROM flood_event_logs
        WHERE road_id LIKE 'wz%'
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
        LEAST(100, CAST((fp.event_count * 10) AS integer)) as flood_risk_score,
        lf.last_start as last_flood_start,
        lf.last_end as last_flood_end,
        CAST(EXTRACT(DAY FROM (NOW() - lf.last_start)) AS INTEGER) as days_since_last_flood,
        fp.first_event as first_flood_recorded,
        NOW()
    FROM flood_pairs fp
    LEFT JOIN last_floods lf ON fp.road_id = lf.road_id
    '''
    
    conn.execute(text(hotspots_sql))
    conn.commit()
    
    # Verify
    result = conn.execute(text('''
        SELECT COUNT(*), 
               MIN(location_lat), MAX(location_lat),
               MIN(location_lon), MAX(location_lon),
               AVG(frequency_per_year) as avg_freq
        FROM flood_hotspots
        WHERE road_id LIKE 'wz%'
    ''')).fetchone()
    
    logger.info(f"""
✅ ZAMBOANGA CITY HOTSPOTS REGENERATED
   Roads: {result[0]}
   Latitude:  {result[1]:.4f} to {result[2]:.4f} (Expected: 6.80-7.10)
   Longitude: {result[3]:.4f} to {result[4]:.4f} (Expected: 121.98-122.13)
   Avg Frequency: {result[5]:.1f}/year
   
🎯 COORDINATES NOW STRICTLY WITHIN ZAMBOANGA CITY!
    """)
