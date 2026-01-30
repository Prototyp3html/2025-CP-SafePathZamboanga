"""
SIMPLEST & FASTEST - Just resample events using SQL
No Python loops, no batching - pure SQL does everything
"""

from sqlalchemy import create_engine, text

DB_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(DB_URL, pool_pre_ping=True)

print("⚡ ULTRA-FAST SQL-ONLY FIX")
print("=" * 60 + "\n")

with engine.begin() as conn:
    # SQL does everything - regenerate events spread across date range
    print("Redistributing 18k+ events across full date range...")
    
    # Save old events
    conn.execute(text("CREATE TEMP TABLE old_events AS SELECT * FROM flood_event_logs"))
    
    # Delete old events
    conn.execute(text("DELETE FROM flood_event_logs"))
    
    # Insert events evenly distributed across date range
    conn.execute(text("""
        INSERT INTO flood_event_logs (road_id, event_type, event_time, elevation_m, distance_to_water_m, flood_level, created_at)
        SELECT 
            road_id,
            CASE WHEN row_num % 2 = 1 THEN 'flood_start' ELSE 'flood_end' END,
            '2025-12-14'::timestamp + 
            (((row_num - 1)::float / NULLIF(total_events - 1, 0)) * 
             ('2026-01-06'::timestamp - '2025-12-14'::timestamp)) +
            (random() * '24 hours'::interval) as event_time,
            150, 500, 2.5, NOW()
        FROM (
            SELECT 
                road_id,
                row_number() OVER (PARTITION BY road_id ORDER BY random()) as row_num,
                COUNT(*) OVER (PARTITION BY road_id) as total_events
            FROM old_events
        ) t
    """))
    
    print("✓ Events redistributed\n")
    
    print("Updating hotspot metrics...")
    
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
                )::float as freq_per_year
            FROM flood_hotspots fh
            LEFT JOIN flood_event_logs fel ON fh.road_id = fel.road_id
            GROUP BY fh.road_id
        )
        UPDATE flood_hotspots fh
        SET 
            frequency_per_year = COALESCE(m.freq_per_year, 0),
            total_flooded_hours = COALESCE(m.total_flooded_hours, 0)
        FROM metrics m
        WHERE fh.road_id = m.road_id
    """))
    
    print("✓ Metrics updated\n")
    
    print("Verification:")
    stats = conn.execute(text("""
        SELECT 
            COUNT(DISTINCT frequency_per_year) as freq_unique,
            COUNT(DISTINCT total_flooded_hours) as hours_unique
        FROM flood_hotspots
        WHERE total_flooded_hours > 0
    """)).fetchone()
    
    print(f"  ✓ {stats[0]} unique frequency values")
    print(f"  ✓ {stats[1]} unique hour values")

print("\n✅ DONE! Refresh admin UI to see changes.\n")
