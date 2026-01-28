#!/usr/bin/env python3
"""
Simple one-line SQL update to fix risk scores
"""

from sqlalchemy import create_engine, text

db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'

print("Updating risk scores...")

engine = create_engine(db_url)
with engine.connect() as conn:
    # Simple formula: frequency (0-50) + hours (0-30) + recency (0-20)
    sql = text("""
        UPDATE flood_hotspots
        SET flood_risk_score = LEAST(100,
            (frequency_per_year / 2.0) + 
            (total_flooded_hours / 2.0) +
            CASE WHEN days_since_last_flood < 7 THEN 15 WHEN days_since_last_flood < 14 THEN 10 ELSE 5 END
        )
        WHERE total_flood_events > 0
    """)
    conn.execute(sql)
    conn.commit()

print("Done! Risk scores updated.")
