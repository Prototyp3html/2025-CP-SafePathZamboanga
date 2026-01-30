#!/usr/bin/env python3
"""Check what the API is actually returning"""
from sqlalchemy import create_engine, text

DB_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(DB_URL)

with engine.connect() as conn:
    print('\n🔍 DATABASE CHECK - Current values\n')
    
    # Check the exact roads shown in the screenshot
    roads = ['4676', '4675', '4655', '4652', '4513', '4395', '1509', '1513', '616']
    
    result = conn.execute(text(f"""
        SELECT 
            road_id,
            total_flood_events,
            ROUND(total_flooded_hours::numeric, 1) as hours,
            ROUND(frequency_per_year::numeric, 2) as frequency,
            ROUND(flood_risk_score::numeric, 1) as risk
        FROM flood_hotspots
        WHERE road_id IN ('ww87481676', 'ww87481675', 'ww87481655', 'ww87481652', 'ww87481513', 'ww87481395', 'ww87481509', 'ww87481513', 'ww87481616')
        ORDER BY flood_risk_score DESC
    """))
    
    rows = result.fetchall()
    if not rows:
        # Try with the displayed road IDs as-is (they might be numeric not OSM IDs)
        result = conn.execute(text("""
            SELECT 
                road_id,
                total_flood_events,
                ROUND(total_flooded_hours::numeric, 1) as hours,
                ROUND(frequency_per_year::numeric, 2) as frequency,
                ROUND(flood_risk_score::numeric, 1) as risk
            FROM flood_hotspots
            ORDER BY flood_risk_score DESC
            LIMIT 20
        """))
        rows = result.fetchall()
        print("Top 20 roads in database:")
    else:
        print("Searched roads in database:")
    
    print(f"{'Road ID':<25} {'Events':>8} {'Hours':>8} {'Freq/Yr':>10} {'Risk':>8}")
    print('-' * 65)
    
    for row in rows:
        print(f'{str(row[0]):<25} {row[1]:>8} {row[2]:>8} {row[3]:>10} {row[4]:>8}')
    
    # Also check how many roads have 0.00/yr (should be many with our calculation)
    print('\n📊 Frequency distribution:')
    result = conn.execute(text("""
        SELECT frequency_per_year, COUNT(*) as count
        FROM flood_hotspots
        GROUP BY frequency_per_year
        ORDER BY frequency_per_year DESC
        LIMIT 10
    """))
    
    for row in result:
        print(f'  {row[0]}/yr: {row[1]} roads')
