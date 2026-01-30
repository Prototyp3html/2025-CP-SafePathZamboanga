#!/usr/bin/env python3
"""
RAILWAY FIX - Direct SQL Update
Simple, straightforward update to Railway production database
"""
from sqlalchemy import create_engine, text

DB_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(DB_URL, pool_pre_ping=True)

def fix_railway():
    with engine.begin() as conn:
        print("\n" + "="*80)
        print("⚡ UPDATING RAILWAY DATABASE WITH CORRECT FLOOD METRICS")
        print("="*80 + "\n")
        
        # Step 1: Temporary table with metrics
        print("Step 1: Computing metrics...")
        conn.execute(text("""
            CREATE TEMPORARY TABLE temp_metrics AS
            SELECT 
                fel.road_id,
                COUNT(CASE WHEN fel.event_type = 'flood_start' THEN 1 END)::int as flood_events,
                (COUNT(CASE WHEN fel.event_type = 'flood_start' THEN 1 END) * 3.0)::float as flood_hours,
                ROUND(
                    ((COUNT(CASE WHEN fel.event_type = 'flood_start' THEN 1 END)::numeric / 
                     NULLIF(EXTRACT(DAY FROM (MAX(fel.event_time) - MIN(fel.event_time))) + 1, 0)
                    ) * 365.0)::numeric,
                    2
                )::float as freq_per_year
            FROM flood_event_logs fel
            GROUP BY fel.road_id
        """))
        print("✓ Calculated metrics\n")
        
        # Step 2: Update hotspots
        print("Step 2: Updating flood_hotspots in Railway...")
        result = conn.execute(text("""
            UPDATE flood_hotspots fh
            SET 
                total_flooded_hours = tm.flood_hours,
                frequency_per_year = tm.freq_per_year,
                average_flood_duration_hours = (tm.flood_hours / NULLIF(tm.flood_events, 0))::float,
                flood_risk_score = LEAST(100, ROUND(
                    (LEAST(40, POWER(COALESCE(tm.freq_per_year, 0), 0.7) * 15) +
                     LEAST(30, POWER(COALESCE(tm.flood_hours, 0), 0.6) * 2.2) +
                     CASE WHEN fh.average_elevation_m < 3 THEN 20
                          WHEN fh.average_elevation_m < 5 THEN 15
                          WHEN fh.average_elevation_m < 10 THEN 10
                          WHEN fh.average_elevation_m < 20 THEN 5
                          ELSE 0 END +
                     CASE WHEN fh.distance_to_water_m < 50 THEN 10
                          WHEN fh.distance_to_water_m < 100 THEN 7
                          WHEN fh.distance_to_water_m < 200 THEN 4
                          ELSE 0 END
                    )::numeric, 1)::float),
                last_updated = NOW()
            FROM temp_metrics tm
            WHERE fh.road_id = tm.road_id
        """))
        
        updated = result.rowcount
        print(f"✓ Updated {updated} roads in Railway\n")
        
        # Step 3: Verify
        print("Step 3: Verifying Railway database...")
        result = conn.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT frequency_per_year) as unique_freq,
                COUNT(DISTINCT flood_risk_score) as unique_risk,
                ROUND(AVG(frequency_per_year)::numeric, 2),
                ROUND(AVG(flood_risk_score)::numeric, 2),
                ROUND(SUM(total_flooded_hours)::numeric, 0)
            FROM flood_hotspots
            WHERE total_flood_events > 0
        """))
        
        stats = result.fetchone()
        print(f"✓ Total roads: {stats[0]}")
        print(f"✓ Unique frequencies: {stats[1]}")
        print(f"✓ Unique risk scores: {stats[2]}")
        print(f"✓ Average frequency: {stats[3]}/yr")
        print(f"✓ Average risk: {stats[4]}/100")
        print(f"✓ Total hours: {int(stats[5]):,}h")
        
        # Show sample
        print(f"\n🏆 Sample roads from Railway:\n")
        result = conn.execute(text("""
            SELECT 
                road_id,
                total_flood_events,
                ROUND(total_flooded_hours::numeric, 1),
                ROUND(frequency_per_year::numeric, 2),
                ROUND(flood_risk_score::numeric, 1)
            FROM flood_hotspots
            WHERE total_flood_events > 0
            ORDER BY flood_risk_score DESC
            LIMIT 10
        """))
        
        for i, row in enumerate(result, 1):
            print(f"  {i}. {row[0]}: {row[1]} events, {row[2]}h, {row[3]}/yr, Risk {row[4]}/100")
        
        print("\n" + "="*80)
        print(f"✅ RAILWAY DATABASE SUCCESSFULLY UPDATED!")
        print("="*80 + "\n")

if __name__ == "__main__":
    try:
        fix_railway()
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
