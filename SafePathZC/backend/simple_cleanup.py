"""Simple cleanup script for corrupted flood data"""
from sqlalchemy import create_engine, text

DB_URL = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(DB_URL)

with engine.connect() as conn:
    print('STEP 1: Deleting all flood_start events (they are corrupted)...')
    conn.execute(text("DELETE FROM flood_event_logs WHERE event_type = 'flood_start'"))
    conn.commit()
    print('  Deleted all flood_start events.')
    
    print('\nSTEP 2: Resetting flood_hotspots to zero...')
    conn.execute(text("""
        UPDATE flood_hotspots SET
            total_flood_events = 0,
            total_flooded_hours = 0,
            average_flood_duration_hours = 0,
            frequency_per_year = 0,
            flood_risk_score = 10,
            last_updated = NOW()
    """))
    conn.commit()
    print('  Reset all flood_hotspots.')
    
    # Verify
    result = conn.execute(text('SELECT event_type, COUNT(*) FROM flood_event_logs GROUP BY event_type'))
    print('\nEvents remaining:')
    for row in result:
        print(f'  {row[0]}: {row[1]}')
    
    result2 = conn.execute(text('SELECT COUNT(*), MAX(total_flooded_hours) FROM flood_hotspots'))
    row = result2.fetchone()
    print(f'\nHotspots: {row[0]} roads, max hours: {row[1]}')
    
print('\nDone! Data has been reset. Next flood update will rebuild statistics properly.')
