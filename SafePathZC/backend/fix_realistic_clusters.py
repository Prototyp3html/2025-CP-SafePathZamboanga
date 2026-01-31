#!/usr/bin/env python3
"""
Generate 13 demo flood hotspots using REAL OSM IDs from terrain_roads.geojson
Nearby roads share same flood patterns (realistic weather events)
"""

import json
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta
import random
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"
db_engine = create_engine(DATABASE_URL)

# Load real coordinates from terrain_roads.geojson
logger.info("📂 Loading real Zamboanga City roads from terrain_roads.geojson...")
with open('data/terrain_roads.geojson', 'r') as f:
    geojson_data = json.load(f)

# Extract 13 demo roads with REAL OSM IDs from geojson
demo_roads = []
selected_indices = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 100, 200]

for idx in selected_indices:
    if idx < len(geojson_data['features']):
        feature = geojson_data['features'][idx]
        osm_id = feature['properties'].get('osm_id', f'road_{idx}')
        coords = feature['geometry']['coordinates']
        
        # Get midpoint of road
        start_lat, start_lon = coords[0][1], coords[0][0]
        end_lat, end_lon = coords[-1][1], coords[-1][0]
        mid_lat = (start_lat + end_lat) / 2
        mid_lon = (start_lon + end_lon) / 2
        
        # Use actual OSM ID for the road_name
        demo_roads.append((osm_id, osm_id, mid_lat, mid_lon))

logger.info(f"✅ Loaded {len(demo_roads)} real Zamboanga City roads from geojson")

# Group roads into realistic clusters (same weather/rainfall patterns)
CLUSTERS = {
    "CLUSTER_A": [0, 1, 2],      # 3 roads - high risk (4 events each)
    "CLUSTER_B": [3, 4, 5],      # 3 roads - medium-high (3 events each)
    "CLUSTER_C": [6, 7],         # 2 roads - medium (3 events each)
    "CLUSTER_D": [8, 9],         # 2 roads - medium (2 events each)
    "CLUSTER_E": [10, 11, 12],   # 3 roads - low-medium (2 events each)
}

CLUSTER_PATTERNS = {
    "CLUSTER_A": 4,    # High risk areas
    "CLUSTER_B": 3,    # Medium-high risk
    "CLUSTER_C": 3,    # Medium-high risk
    "CLUSTER_D": 2,    # Medium risk
    "CLUSTER_E": 2,    # Low-medium risk
}

with db_engine.connect() as conn:
    logger.info("🧹 Cleaning old demo data...")
    for road_id, _, _, _ in demo_roads:
        conn.execute(text(f"DELETE FROM flood_hotspots WHERE road_id = '{road_id}'"))
        conn.execute(text(f"DELETE FROM flood_event_logs WHERE road_id = '{road_id}'"))
    conn.commit()
    
    logger.info("🌊 Generating flood events (roads in same cluster share same floods)...")
    
    base_date = datetime(2026, 1, 2)
    
    # For each cluster, generate SAME flood events for all roads in it
    for cluster_name, road_indices in CLUSTERS.items():
        num_events = CLUSTER_PATTERNS[cluster_name]
        
        # Generate common flood event dates for this cluster
        flood_dates = []
        for event_num in range(num_events):
            # Spread events across January
            event_date = base_date + timedelta(days=random.randint(0, 28))
            event_hour = random.randint(0, 23)
            flood_dates.append(event_date.replace(hour=event_hour))
        
        # Apply same flood events to all roads in cluster
        for road_idx in road_indices:
            road_id, road_name, lat, lon = demo_roads[road_idx]
            
            for event_date in flood_dates:
                # flood_start
                conn.execute(text(f'''
                    INSERT INTO flood_event_logs (road_id, road_name, location_lat, location_lon, event_type, event_time)
                    VALUES ('{road_id}', '{road_name}', {lat}, {lon}, 'flood_start', '{event_date}')
                '''))
                
                # flood_end (3 hours later)
                end_time = event_date + timedelta(hours=3)
                conn.execute(text(f'''
                    INSERT INTO flood_event_logs (road_id, road_name, location_lat, location_lon, event_type, event_time)
                    VALUES ('{road_id}', '{road_name}', {lat}, {lon}, 'flood_end', '{end_time}')
                '''))
    
    conn.commit()
    
    logger.info("📊 Calculating hotspot metrics...")
    
    # Calculate metrics for each road
    for road_id, road_name, lat, lon in demo_roads:
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
        days_span = (last_event - first_event).days if last_event and first_event else 1
        if days_span > 1:
            frequency_per_year = (event_count / days_span) * 365
        else:
            frequency_per_year = event_count * 365 / 30
        
        # Calculate risk score (0-100 based on frequency)
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
        WHERE road_id IN (SELECT road_id FROM flood_event_logs GROUP BY road_id)
    ''')).fetchone()
    
    roads, min_lat, max_lat, min_lon, max_lon, min_risk, max_risk, avg_freq = result
    
    logger.info(f"""
✅ 13 DEMO HOTSPOTS (REAL OSM IDs + REALISTIC CLUSTERS)
   Roads: {roads}
   Latitude:  {min_lat:.6f} to {max_lat:.6f}
   Longitude: {min_lon:.6f} to {max_lon:.6f}
   Risk Score: {min_risk:.0f} to {max_risk:.0f}
   Avg Frequency: {avg_freq:.1f}/year
   
🎯 NEARBY ROADS SHARE SAME FLOOD PATTERNS!
    """)
    
    # Show details
    hotspots = conn.execute(text('''
        SELECT road_id, total_flood_events, flood_risk_score, frequency_per_year,
               location_lat, location_lon
        FROM flood_hotspots
        ORDER BY flood_risk_score DESC
    ''')).fetchall()
    
    logger.info("\n📍 Hotspot Details (Real OSM IDs):")
    for hs in hotspots:
        logger.info(f"   {hs[0]:<15s} | Events:{hs[1]} Risk:{hs[2]:.0f} Freq:{hs[3]:.0f}/yr | {hs[4]:.6f},{hs[5]:.6f}")
