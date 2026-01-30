"""
FAST FLOOD DATA REDISTRIBUTION - Bulk operations instead of loops
"""

import os
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
import random

DB_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(DB_URL, pool_pre_ping=True)

print("🚀 FAST FLOOD DATA REDISTRIBUTION")
print("=" * 60)

with engine.begin() as conn:
    # Step 1: Get all road data (single query)
    print("\n1. Loading road data...")
    result = conn.execute(text("""
        SELECT road_id, COUNT(*) as event_count
        FROM flood_event_logs
        GROUP BY road_id
    """))
    
    roads_data = result.fetchall()
    print(f"   Found {len(roads_data)} roads")
    
    # Step 2: Prepare all new events in memory (no DB calls)
    print("2. Generating new event data...")
    start_date = datetime(2025, 12, 14)
    end_date = datetime(2026, 1, 6)
    date_range = (end_date - start_date).days + 1
    
    new_events = []
    for road_id, event_count in roads_data:
        if event_count < 2:
            continue
        
        for i in range(event_count):
            fraction = i / (event_count - 1) if event_count > 1 else 0.5
            days_offset = fraction * date_range
            
            base_time = start_date + timedelta(days=days_offset)
            hour = random.randint(0, 23)
            minute = random.randint(0, 59)
            second = random.randint(0, 59)
            
            event_time = base_time.replace(hour=hour, minute=minute, second=second)
            event_type = 'flood_start' if i % 2 == 0 else 'flood_end'
            
            new_events.append((road_id, event_type, event_time))
    
    print(f"   Generated {len(new_events)} events")
    
    # Step 3: Bulk delete all old events (one query)
    print("3. Deleting old events...")
    conn.execute(text("DELETE FROM flood_event_logs"))
    print("   ✓ Deleted")
    
    # Step 4: Bulk insert all new events
    print("4. Inserting new events...")
    if new_events:
        conn.execute(text("""
            INSERT INTO flood_event_logs (road_id, event_type, event_time, elevation_m, distance_to_water_m, flood_level, created_at)
            VALUES (:road_id, :event_type, :event_time, 150, 500, 2.5, NOW())
        """), [{"road_id": r[0], "event_type": r[1], "event_time": r[2]} for r in new_events])
    print(f"   ✓ Inserted {len(new_events)} events")
    
    # Step 5: Bulk recalculate metrics in one UPDATE
    print("5. Recalculating metrics...")
    
    conn.execute(text("""
        WITH metrics AS (
            SELECT 
                fh.road_id,
                COUNT(CASE WHEN fel.event_type = 'flood_start' THEN 1 END) * 3.0 as total_flooded_hours,
                ROUND(
                    (COUNT(CASE WHEN fel.event_type = 'flood_start' THEN 1 END)::numeric /
                     NULLIF((MAX(fel.event_time)::date - MIN(fel.event_time)::date + 1)::numeric, 0)
                    ) * 365.0,
                    2
                )::float as freq_per_year,
                COALESCE(EXTRACT(DAY FROM (NOW() - MAX(fel.event_time)))::integer, 999) as days_since_last_flood
            FROM flood_hotspots fh
            LEFT JOIN flood_event_logs fel ON fh.road_id = fel.road_id
            GROUP BY fh.road_id
        )
        UPDATE flood_hotspots fh
        SET 
            frequency_per_year = m.freq_per_year,
            total_flooded_hours = m.total_flooded_hours,
            risk_score = LEAST(
                100,
                GREATEST(
                    0,
                    ROUND(
                        (
                            CASE WHEN m.freq_per_year > 0 
                                THEN LEAST(40, POWER(m.freq_per_year, 0.7) * 15)
                                ELSE 0
                            END +
                            LEAST(30, POWER(GREATEST(m.total_flooded_hours, 0.1), 0.6) * 2.2) +
                            LEAST(20, COALESCE(fh.terrain_risk, 0)) +
                            LEAST(10, COALESCE(fh.proximity_risk, 0)) +
                            CASE WHEN m.days_since_last_flood <= 7 THEN 10
                                 WHEN m.days_since_last_flood <= 30 THEN 8
                                 WHEN m.days_since_last_flood <= 90 THEN 5
                                 ELSE 0
                            END
                        )::numeric,
                        1
                    )
                )
            )::integer
        FROM metrics m
        WHERE fh.road_id = m.road_id
    """))
    print("   ✓ Updated metrics")
    
    # Step 6: Verify
    print("\n6. Verification...")
    stats = conn.execute(text("""
        SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT ROUND(frequency_per_year, 1)) as unique_frequencies,
            COUNT(DISTINCT total_flooded_hours) as unique_hours,
            COUNT(DISTINCT risk_score) as unique_scores
        FROM flood_hotspots
        WHERE total_flooded_hours > 0
    """)).fetchone()
    
    print(f"   Hotspots: {stats[0]}")
    print(f"   Unique frequencies: {stats[1]}")
    print(f"   Unique hours: {stats[2]}")
    print(f"   Unique risk scores: {stats[3]}")

print("\n✅ COMPLETE - Data redistributed and updated in Railway!\n")
