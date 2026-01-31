#!/usr/bin/env python3
"""
Manually run the flood data cron calculation to populate flood_hotspots
"""

import asyncio
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL)

def calculate_flood_metrics():
    """Replicate the cron job calculation logic"""
    with db_engine.connect() as conn:
        logger.info("🔄 Running flood data cron calculation...")
        
        # Clear existing hotspots
        conn.execute(text("DELETE FROM flood_hotspots"))
        logger.info("✅ Cleared flood_hotspots")
        
        # Get all unique roads with flood events
        roads = conn.execute(text("""
            SELECT DISTINCT road_id, road_name, location_lat, location_lon
            FROM flood_event_logs
            ORDER BY road_id
        """)).fetchall()
        
        logger.info(f"📍 Processing {len(roads)} roads...")
        
        total_hotspots = 0
        
        for road_id, road_name, lat, lon in roads:
            # Get all flood events for this road, ordered by time
            events = conn.execute(text("""
                SELECT event_type, event_time
                FROM flood_event_logs
                WHERE road_id = :road_id
                ORDER BY event_time
            """), {'road_id': road_id}).fetchall()
            
            # Pair up flood_start and flood_end events
            flood_pairs = []
            i = 0
            while i < len(events):
                if i + 1 < len(events) and events[i][0] == 'flood_start' and events[i+1][0] == 'flood_end':
                    start_time = events[i][1]
                    end_time = events[i+1][1]
                    duration_hours = (end_time - start_time).total_seconds() / 3600
                    flood_pairs.append({
                        'start': start_time,
                        'end': end_time,
                        'duration_hours': duration_hours
                    })
                    i += 2
                else:
                    i += 1
            
            if flood_pairs:
                # Calculate metrics
                total_hours = sum(p['duration_hours'] for p in flood_pairs)
                num_events = len(flood_pairs)
                
                # Calculate frequency: (events / date_span_days) * 365
                # Use actual date span from first to last event
                first_event = min(p['start'] for p in flood_pairs)
                last_event = max(p['end'] for p in flood_pairs)
                date_span_days = (last_event - first_event).days
                
                # Avoid division by zero
                if date_span_days == 0:
                    date_span_days = 1
                
                frequency_per_year = (num_events / date_span_days) * 365
                
                # Calculate risk score (0-100)
                # Formula: min(100, (frequency_per_year * 10) + (total_hours / 10))
                risk_score = min(100, int((frequency_per_year * 10) + (total_hours / 10)))
                
                # Insert into flood_hotspots
                conn.execute(text("""
                    INSERT INTO flood_hotspots 
                    (road_id, road_name, total_events, total_hours, frequency_per_year, risk_score, location_lat, location_lon, last_updated)
                    VALUES (:road_id, :road_name, :total_events, :total_hours, :frequency_per_year, :risk_score, :lat, :lon, :last_updated)
                """), {
                    'road_id': road_id,
                    'road_name': road_name,
                    'total_events': num_events,
                    'total_hours': total_hours,
                    'frequency_per_year': frequency_per_year,
                    'risk_score': risk_score,
                    'lat': lat,
                    'lon': lon,
                    'last_updated': datetime.utcnow()
                })
                
                total_hotspots += 1
                if total_hotspots % 20 == 0:
                    logger.info(f"   Processed {total_hotspots} roads...")
        
        conn.commit()
        logger.info(f"✅ Calculated metrics for {total_hotspots} roads")
        
        # Show sample results
        stats = conn.execute(text("""
            SELECT road_name, total_events, total_hours, frequency_per_year, risk_score
            FROM flood_hotspots
            ORDER BY risk_score DESC
            LIMIT 10
        """)).fetchall()
        
        logger.info("📊 Top 10 Highest Risk Roads:")
        logger.info("Road Name | Events | Hours | Freq/Yr | Risk Score")
        logger.info("-" * 70)
        for row in stats:
            logger.info(f"{row[0]:30} | {row[1]:3} | {row[2]:5.1f} | {row[3]:6.1f}/yr | {row[4]:3}")
        
        return total_hotspots

if __name__ == "__main__":
    calculate_flood_metrics()
    logger.info("🎉 Cron calculation completed!")
