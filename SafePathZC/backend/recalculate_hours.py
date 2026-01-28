#!/usr/bin/env python3
"""
FIX flood duration calculation in production database
Recalculate hours from actual flood_start and flood_end events
"""
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from datetime import datetime

PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

from models import FloodEventLog, FloodHotspot

def recalculate_flood_hours():
    """Recalculate flood hours based on actual start/end events"""
    engine = create_engine(PRODUCTION_DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        print("\n" + "="*70)
        print("🔧 RECALCULATING FLOOD HOURS - PRODUCTION")
        print("="*70 + "\n")
        
        # Get all hotspots
        hotspots = db.query(FloodHotspot).all()
        
        print(f"Processing {len(hotspots)} hotspots...\n")
        
        updated_count = 0
        
        for hotspot in hotspots:
            # Get all events for this road
            events = db.query(FloodEventLog).filter(
                FloodEventLog.road_id == hotspot.road_id
            ).order_by(FloodEventLog.event_time).all()
            
            if not events:
                continue
            
            # Recalculate hours from pairs of start/end events
            total_hours = 0
            event_count = 0
            
            i = 0
            while i < len(events) - 1:
                if events[i].event_type == 'flood_start':
                    # Find matching flood_end
                    j = i + 1
                    while j < len(events) and events[j].event_type != 'flood_end':
                        j += 1
                    
                    if j < len(events):
                        duration = (events[j].event_time - events[i].event_time).total_seconds() / 3600
                        total_hours += max(0, duration)  # Avoid negative durations
                        event_count += 1
                        i = j + 1
                    else:
                        i += 1
                else:
                    i += 1
            
            # Only update if hours changed significantly
            old_hours = hotspot.total_flooded_hours
            if abs(total_hours - old_hours) > 0.1:  # More than 0.1h difference
                hotspot.total_flooded_hours = round(total_hours, 2)
                if event_count > 0:
                    hotspot.average_flood_duration_hours = round(total_hours / event_count, 2)
                
                updated_count += 1
                
                if updated_count <= 10:  # Show first 10
                    print(f"✓ {hotspot.road_name}: {old_hours:.1f}h → {total_hours:.1f}h ({event_count} events)")
        
        db.commit()
        
        print(f"\n✅ Updated {updated_count} hotspots")
        
        # Show new totals
        new_total_hours = db.query(func.sum(FloodHotspot.total_flooded_hours)).scalar() or 0
        print(f"✅ New system total: {new_total_hours:,.1f}h")
        
        # Recalculate risk scores
        print("\n🔄 Recalculating risk scores...")
        for hotspot in db.query(FloodHotspot).all():
            # Use new formula from flood_data_updater
            frequency_score = min(50, (hotspot.total_flood_events ** 0.7) * 12)
            duration_score = min(50, (hotspot.total_flooded_hours ** 0.6) * 2.5)
            new_risk = min(100, frequency_score + duration_score)
            hotspot.flood_risk_score = round(new_risk, 2)
        
        db.commit()
        print("✅ Risk scores recalculated")
        
        db.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        db.close()

if __name__ == "__main__":
    recalculate_flood_hours()
