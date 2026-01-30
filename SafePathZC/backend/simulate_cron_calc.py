"""
Simulate what the cron job will calculate when it runs next
"""
from sqlalchemy import create_engine, text
from datetime import datetime

db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(db_url)

print("\n" + "="*80)
print("CRON JOB CALCULATION SIMULATION")
print("="*80 + "\n")

with engine.connect() as conn:
    # Check a sample road's events
    print("Sample Road Events (what cron will see):")
    print("-"*80)
    
    result = conn.execute(text("""
        SELECT 
            road_id,
            event_type,
            event_time
        FROM flood_event_logs
        WHERE road_id = 'w87470441'
        ORDER BY event_time
    """)).fetchall()
    
    if result:
        road_id = result[0][0]
        print(f"Road ID: {road_id}")
        print(f"{'Event #':<8} {'Type':<15} {'Time':<25}")
        print("-"*50)
        
        total_hours = 0
        for i, (rid, event_type, event_time) in enumerate(result, 1):
            print(f"{i:<8} {event_type:<15} {event_time}")
        
        # Now simulate what cron will calculate
        print("\n" + "="*80)
        print("CALCULATION LOGIC (from cron job):")
        print("="*80)
        
        events = [(r[1], r[2]) for r in result]
        
        # Pair consecutive start/end events
        total_hours = 0.0
        pairs = []
        i = 0
        while i < len(events) - 1:
            event_type, event_time = events[i]
            next_type, next_time = events[i + 1]
            
            if event_type == 'flood_start' and next_type == 'flood_end':
                duration = (next_time - event_time).total_seconds() / 3600
                if duration >= 0:
                    total_hours += duration
                    pairs.append((event_time, next_time, duration))
                i += 2
            else:
                i += 1
        
        print(f"\nEvent Pairs Found: {len(pairs)}")
        for start, end, hours in pairs:
            print(f"  {start} → {end}: {hours:.2f} hours")
        
        print(f"\nTotal Hours (cron method): {total_hours:.2f} hours")
        
        # Days between calculation
        first = events[0][1]
        last = events[-1][1]
        days = (last - first).days + 1
        
        start_events = len([e for e in events if e[0] == 'flood_start'])
        frequency = (start_events / max(days, 1)) * 365
        
        print(f"Start events: {start_events}")
        print(f"Date range: {days} days")
        print(f"Frequency per year: {frequency:.2f}")
        
        # Compare with current Railway values
        print("\n" + "="*80)
        print("CURRENT RAILWAY VALUES:")
        print("="*80)
        
        curr = conn.execute(text("""
            SELECT 
                total_flooded_hours,
                frequency_per_year,
                total_flood_events
            FROM flood_hotspots
            WHERE road_id = 'w87470441'
        """)).fetchone()
        
        if curr:
            print(f"Current Hours: {curr[0]}")
            print(f"Current Frequency: {curr[1]}/yr")
            print(f"Current Events: {curr[2]}")
            
            print("\n" + "="*80)
            print("DIFFERENCE CHECK:")
            print("="*80)
            print(f"Hours match? {abs(total_hours - curr[0]) < 0.1} (cron={total_hours:.2f}, current={curr[0]})")
            print(f"Frequency match? {abs(frequency - curr[1]) < 0.1} (cron={frequency:.2f}, current={curr[1]})")
