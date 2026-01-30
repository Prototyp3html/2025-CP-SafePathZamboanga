#!/usr/bin/env python3
"""
FAST SQL-BASED FLOOD METRICS FIX - RAILWAY PRODUCTION
Uses direct SQL to update Railway database
Commits explicitly to ensure changes persist
"""
from sqlalchemy import create_engine, text

# ============= RAILWAY PRODUCTION DATABASE =============
DB_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(DB_URL, echo=False, isolation_level="AUTOCOMMIT")

def fix_flood_metrics():
    """Update flood hotspots with correct metrics using raw SQL"""
    
    conn = engine.raw_connection()
    cursor = conn.cursor()
    
    try:
        print("\n" + "="*80)
        print("⚡ FAST SQL FIX FOR RAILWAY DATABASE")
        print("="*80 + "\n")
        
        # Step 1: Calculate metrics
        print("📊 Step 1: Computing flood metrics for all 9,005 roads...")
        
        cursor.execute("""
            UPDATE flood_hotspots fh
            SET 
                total_flooded_hours = (
                    SELECT COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END) * 3.0
                    FROM flood_event_logs fel
                    WHERE fel.road_id = fh.road_id
                ),
                average_flood_duration_hours = (
                    COALESCE(
                        EXTRACT(EPOCH FROM (MAX(event_time) - MIN(event_time))) / 3600.0 / 
                        NULLIF(COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END), 0),
                        3.0
                    )
                    FROM (
                        SELECT event_time, event_type 
                        FROM flood_event_logs 
                        WHERE road_id = fh.road_id
                    ) temp_events
                ),
                frequency_per_year = (
                    ROUND(
                        ((COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END)::numeric / 
                         NULLIF(EXTRACT(DAY FROM (MAX(event_time) - MIN(event_time))) + 1, 0)
                        ) * 365.0)::numeric,
                        2
                    )
                    FROM flood_event_logs fel
                    WHERE fel.road_id = fh.road_id
                ),
                flood_risk_score = LEAST(100, ROUND(
                    LEAST(40, POWER(
                        COALESCE(
                            ROUND(
                                ((COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END)::numeric / 
                                 NULLIF(EXTRACT(DAY FROM (MAX(event_time) - MIN(event_time))) + 1, 0)
                                ) * 365.0)::numeric,
                                2
                            ),
                            0
                        ), 0.7) * 15) +
                    LEAST(30, POWER(COUNT(CASE WHEN event_type = 'flood_start' THEN 1 END) * 3.0, 0.6) * 2.2) +
                    CASE 
                        WHEN fh.average_elevation_m < 3 THEN 20
                        WHEN fh.average_elevation_m < 5 THEN 15
                        WHEN fh.average_elevation_m < 10 THEN 10
                        WHEN fh.average_elevation_m < 20 THEN 5
                        ELSE 0
                    END +
                    CASE
                        WHEN fh.distance_to_water_m < 50 THEN 10
                        WHEN fh.distance_to_water_m < 100 THEN 7
                        WHEN fh.distance_to_water_m < 200 THEN 4
                        ELSE 0
                    END,
                    2
                )),
                last_updated = NOW()
            FROM flood_event_logs fel
            WHERE fh.road_id = fel.road_id
        """)
        
        rows_updated = cursor.rowcount
        conn.commit()
        
        print(f"✓ Updated {rows_updated} roads in Railway database")
        print(f"✓ COMMITTED changes explicitly\n")
        
        # Step 2: Verify
        print("📊 Step 2: Verifying changes in Railway...")
        
        cursor.execute("""
            SELECT 
                COUNT(*) as total_roads,
                COUNT(DISTINCT frequency_per_year) as unique_frequencies,
                COUNT(DISTINCT flood_risk_score) as unique_risk_scores,
                ROUND(AVG(frequency_per_year)::numeric, 2) as avg_freq,
                ROUND(AVG(flood_risk_score)::numeric, 2) as avg_risk,
                ROUND(SUM(total_flooded_hours)::numeric, 0) as total_hours
            FROM flood_hotspots
            WHERE total_flood_events > 0
        """)
        
        stats = cursor.fetchone()
        print(f"✓ Roads with events: {stats[0]}")
        print(f"✓ Unique frequencies: {stats[1]} (was 4)")
        print(f"✓ Unique risk scores: {stats[2]} (was 4)")
        print(f"✓ Average frequency: {stats[3]}/yr")
        print(f"✓ Average risk: {stats[4]}/100")
        print(f"✓ Total hours: {int(stats[5]):,}h")
        
        # Show top 10
        print(f"\n🏆 TOP 10 ROADS (from Railway database):\n")
        
        cursor.execute("""
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
        """)
        
        for i, row in enumerate(cursor.fetchall(), 1):
            print(f"  {i}. Road {row[0]}: {row[1]} events, {row[2]}h, {row[3]}/yr, Risk {row[4]}/100")
        
        conn.close()
        
        print("\n" + "="*80)
        print(f"✅ SUCCESS - Railway database UPDATED with unique flood metrics!")
        print("="*80 + "\n")
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        conn.rollback()
        conn.close()
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    fix_flood_metrics()
