#!/usr/bin/env python3
"""
Direct database query to see what values are actually stored
"""

from sqlalchemy import create_engine, text

db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'

engine = create_engine(db_url)
with engine.connect() as conn:
    sql = text("""
        SELECT road_name, total_flood_events, total_flooded_hours, frequency_per_year, days_since_last_flood, flood_risk_score
        FROM flood_hotspots
        ORDER BY total_flood_events DESC
        LIMIT 5
    """)
    
    print("\nDirect database query:")
    print("-" * 100)
    for row in conn.execute(sql):
        print(row)
