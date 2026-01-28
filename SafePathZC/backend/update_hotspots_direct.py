#!/usr/bin/env python3
"""
Direct database update for hotspots with terrain-aware risk scoring
"""

import os
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Railway database
db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'

print("\n" + "="*70)
print("🔄 UPDATING HOTSPOTS WITH TERRAIN-AWARE RISK SCORES")
print("="*70 + "\n")

try:
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    # Get all hotspots
    query = '''
        SELECT id, road_id, total_flood_events, total_flooded_hours 
        FROM flood_hotspots 
        WHERE total_flood_events > 0
    '''
    
    hotspots = db.execute(text(query)).fetchall()
    print(f"Found {len(hotspots)} hotspots to update\n")
    
    updated = 0
    
    for hotspot_id, road_id, events, hours in hotspots:
        # Get terrain data for this road from events
        event_query = f'''
            SELECT AVG(elevation_m) as avg_elev, AVG(distance_to_water_m) as avg_distance
            FROM flood_event_logs
            WHERE road_id = '{road_id}'
        '''
        
        result = db.execute(text(event_query)).fetchone()
        avg_elev = result[0] if result and result[0] else None
        avg_distance = result[1] if result and result[1] else None
        
        # Calculate risk score with terrain factors
        frequency_score = min(40, (events ** 0.7) * 15) if events > 0 else 0
        hours_score = min(30, (hours ** 0.6) * 2.2) if hours > 0 else 0
        
        terrain_score = 0
        if avg_elev:
            if avg_elev < 3: terrain_score = 20
            elif avg_elev < 5: terrain_score = 15
            elif avg_elev < 10: terrain_score = 10
            elif avg_elev < 20: terrain_score = 5
        
        proximity_score = 0
        if avg_distance:
            if avg_distance < 50: proximity_score = 10
            elif avg_distance < 100: proximity_score = 7
            elif avg_distance < 200: proximity_score = 4
        
        risk_score = min(100, frequency_score + hours_score + terrain_score + proximity_score)
        
        # Update hotspot
        update_query = f'''
            UPDATE flood_hotspots 
            SET 
                flood_risk_score = {risk_score:.2f},
                average_elevation_m = {avg_elev if avg_elev else 'NULL'},
                distance_to_water_m = {avg_distance if avg_distance else 'NULL'}
            WHERE id = {hotspot_id}
        '''
        
        db.execute(text(update_query))
        updated += 1
        
        if updated % 1000 == 0:
            print(f"  ✓ Updated {updated} hotspots...")
    
    db.commit()
    db.close()
    
    print(f"\n✅ Updated {updated} hotspots with terrain-aware risk scores!")
    
    # Show sample of updated data
    print("\n📈 SAMPLE OF UPDATED HOTSPOTS:")
    print("-" * 70)
    
    db = Session()
    sample_query = text('''
        SELECT road_name, total_flood_events, ROUND(total_flooded_hours::numeric, 1), 
               ROUND(average_elevation_m::numeric, 1), ROUND(flood_risk_score::numeric, 1)
        FROM flood_hotspots
        WHERE total_flood_events > 0
        ORDER BY flood_risk_score DESC
        LIMIT 10
    ''')
    
    print(f"{'Road':<20} | {'Events':<8} | {'Hours':<10} | {'Elev(m)':<10} | {'Risk':<8}")
    print("-" * 70)
    
    for row in db.execute(sample_query):
        road_name = row[0][:19] if row[0] else "Unknown"
        events = row[1]
        hours = row[2]
        elev = row[3] if row[3] else 0
        risk = row[4]
        print(f"{road_name:<20} | {events:<8} | {hours:<10.1f} | {elev:<10.1f} | {risk:<8.1f}")
    
    db.close()
    print("\n✨ Complete!")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
