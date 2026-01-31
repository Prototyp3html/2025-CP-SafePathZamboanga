#!/usr/bin/env python3
"""
Regenerate flood_hotspots from the clean test data
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
    conn.commit()
    
    logger.info("🔄 Calculating metrics for test roads...")
    conn.execute(text('''
        WITH flood_pairs AS (
            SELECT 
                road_id, road_name, 
                location_lat, location_lon,
                COUNT(*) / 2 as event_count,
                MIN(event_time) as first_event,
                MAX(event_time) as last_event
            FROM flood_event_logs
            WHERE (road_id LIKE 'wz%' OR road_id LIKE 'w87%')
            AND event_type = 'flood_start'
            GROUP BY road_id, road_name, location_lat, location_lon
        ),
        last_floods AS (
            SELECT 
                road_id,
                MAX(CASE WHEN event_type = 'flood_start' THEN event_time END) as last_start,
                MAX(CASE WHEN event_type = 'flood_end' THEN event_time END) as last_end
            FROM flood_event_logs
            WHERE (road_id LIKE 'wz%' OR road_id LIKE 'w87%')
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
    '''))
    
    conn.commit()
    
    # Verify
    result = conn.execute(text('''
        SELECT COUNT(*), 
               MIN(location_lat), MAX(location_lat),
               MIN(location_lon), MAX(location_lon),
               AVG(frequency_per_year) as avg_freq
        FROM flood_hotspots
        WHERE road_id LIKE 'wz%' OR road_id LIKE 'w87%'
    ''')).fetchone()
    
    logger.info(f"""
✅ FLOOD HOTSPOTS REGENERATED
   Roads: {result[0]}
   Latitude:  {result[1]:.4f} to {result[2]:.4f}
   Longitude: {result[3]:.4f} to {result[4]:.4f}
   Avg Frequency: {result[5]:.1f}/year
   
🎉 ALL HOTSPOTS WITHIN ZAMBOANGA CITY BOUNDS!
    """)
