"""
Fix flood event durations using pure SQL - much faster
Make all flood_end events exactly 3 hours after their flood_start pair
"""
from sqlalchemy import create_engine, text

db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(db_url)

print("⚙️ FIXING FLOOD EVENT DURATIONS (SQL-based)")
print("="*80 + "\n")

with engine.begin() as conn:
    print("Updating all flood_end events to be 3 hours after flood_start...")
    
    # Use a window function to match each flood_end with its preceding flood_start
    # Then update the flood_end time to be exactly 3 hours later
    conn.execute(text("""
        WITH paired_events AS (
            SELECT 
                id,
                event_time,
                LAG(id) OVER (PARTITION BY road_id ORDER BY event_time) as prev_id,
                LAG(event_type) OVER (PARTITION BY road_id ORDER BY event_time) as prev_type,
                LAG(event_time) OVER (PARTITION BY road_id ORDER BY event_time) as prev_time
            FROM flood_event_logs
        )
        UPDATE flood_event_logs fel
        SET event_time = pe.prev_time + INTERVAL '3 hours'
        FROM paired_events pe
        WHERE fel.id = pe.id 
        AND pe.prev_type = 'flood_start'
        AND pe.event_time > pe.prev_time
    """))
    
    print("✓ Updated\n")
    
    # Verify the changes
    print("Verification - sample events:")
    print("-"*80)
    
    sample = conn.execute(text("""
        SELECT 
            road_id,
            event_type,
            event_time
        FROM flood_event_logs
        WHERE road_id IN (
            SELECT DISTINCT road_id 
            FROM flood_event_logs 
            LIMIT 1
        )
        ORDER BY event_time
    """)).fetchall()
    
    if sample:
        road = sample[0][0]
        print(f"Road: {road}")
        for rid, etype, etime in sample:
            print(f"  {etype:12} at {etime}")
    
    # Calculate new stats
    print("\n" + "="*80)
    print("New statistics for cron calculations:")
    print("="*80)
    
    stats = conn.execute(text("""
        WITH event_stats AS (
            SELECT 
                road_id,
                COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END) as starts,
                MIN(event_time) as first_event,
                MAX(event_time) as last_event
            FROM flood_event_logs
            GROUP BY road_id
        )
        SELECT 
            COUNT(*) as total_roads,
            MIN(starts) as min_events,
            MAX(starts) as max_events,
            ROUND(AVG(starts)::numeric, 2) as avg_events,
            ROUND(AVG((starts / GREATEST(EXTRACT(DAY FROM (last_event - first_event)) + 1, 1)) * 365)::numeric, 2) as avg_frequency
        FROM event_stats
    """)).fetchone()
    
    print(f"Total roads: {stats[0]}")
    print(f"Event range: {stats[1]:.0f} - {stats[2]:.0f} events per road")
    print(f"Avg events: {stats[3]}")
    print(f"Avg frequency/year: {stats[4]}")

print("\n✅ DONE - Events fixed for cron compatibility\n")
