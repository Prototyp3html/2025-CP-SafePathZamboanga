#!/usr/bin/env python3
"""
Analyze flood duration issue in production database
"""
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from datetime import datetime

PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

from models import FloodEventLog, FloodHotspot

def analyze_durations():
    """Analyze why flood durations are so high"""
    engine = create_engine(PRODUCTION_DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        print("\n" + "="*70)
        print("🔍 FLOOD DURATION ANALYSIS - PRODUCTION")
        print("="*70 + "\n")
        
        # Get sample of flood events for a specific road
        sample_road = db.query(FloodEventLog.road_id).group_by(
            FloodEventLog.road_id
        ).first()
        
        if not sample_road:
            print("No flood data found")
            return
        
        road_id = sample_road[0]
        
        print(f"Analyzing road: {road_id}\n")
        
        # Get all events for this road, ordered by time
        events = db.query(FloodEventLog).filter(
            FloodEventLog.road_id == road_id
        ).order_by(FloodEventLog.event_time).all()
        
        print(f"Total events for this road: {len(events)}\n")
        print(f"{'Time':<25} {'Type':<12} {'Duration (calc)':<20}")
        print("-" * 60)
        
        total_calculated_hours = 0
        
        for i in range(0, len(events)-1, 2):  # Process in pairs (start/end)
            if i+1 < len(events):
                start_event = events[i]
                end_event = events[i+1]
                
                if start_event.event_type == 'flood_start' and end_event.event_type == 'flood_end':
                    duration_hours = (end_event.event_time - start_event.event_time).total_seconds() / 3600
                    total_calculated_hours += duration_hours
                    
                    print(f"{str(start_event.event_time):<25} {start_event.event_type:<12} {duration_hours:.2f}h")
                    print(f"{str(end_event.event_time):<25} {end_event.event_type:<12}")
        
        print("\n" + "="*70)
        print(f"Total calculated hours for {road_id}: {total_calculated_hours:.1f}h")
        print("="*70 + "\n")
        
        # Now check what the hotspot says
        hotspot = db.query(FloodHotspot).filter(
            FloodHotspot.road_id == road_id
        ).first()
        
        if hotspot:
            print(f"Hotspot {road_id} stats:")
            print(f"  Total events: {hotspot.total_flood_events}")
            print(f"  Total hours (in hotspot): {hotspot.total_flooded_hours}h")
            print(f"  Average duration: {hotspot.average_flood_duration_hours}h")
            print(f"  Risk score: {hotspot.flood_risk_score}")
        
        db.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.close()

if __name__ == "__main__":
    analyze_durations()
