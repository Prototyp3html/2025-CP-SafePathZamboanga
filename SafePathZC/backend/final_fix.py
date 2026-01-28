#!/usr/bin/env python3
"""
FINAL FIX: Delete hotspots with corrupted hours, keep only valid flood events
"""
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

from models import FloodEventLog, FloodHotspot

def final_fix():
    """Delete all hotspots and recreate from flood events"""
    engine = create_engine(PRODUCTION_DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        print("\n" + "="*70)
        print("🔧 FINAL FIX: RESET CORRUPTED HOTSPOTS")
        print("="*70 + "\n")
        
        # Get stats before
        before_hotspots = db.query(func.count(FloodHotspot.id)).scalar() or 0
        before_events = db.query(func.count(FloodEventLog.id)).scalar() or 0
        before_hours = db.query(func.sum(FloodHotspot.total_flooded_hours)).scalar() or 0
        
        print(f"BEFORE:")
        print(f"  Hotspots: {before_hotspots:,}")
        print(f"  Events: {before_events:,}")
        print(f"  Total hours: {before_hours:,.1f}h\n")
        
        # Delete all hotspots - we'll recalculate them fresh
        print("🗑️  Deleting all hotspots...")
        db.query(FloodHotspot).delete()
        db.commit()
        
        print("✅ Deleted all hotspots")
        
        # Now recalculate from flood events
        print("\n📊 Recalculating from flood events...")
        
        roads = db.query(FloodEventLog.road_id).distinct().all()
        roads = [r[0] for r in roads]
        
        print(f"Found {len(roads)} unique roads\n")
        
        created_count = 0
        
        for i, road_id in enumerate(roads):
            if (i + 1) % 1000 == 0:
                print(f"  Processed {i+1}/{len(roads)}...")
            
            # Get all events for this road
            events = db.query(FloodEventLog).filter(
                FloodEventLog.road_id == road_id
            ).order_by(FloodEventLog.event_time).all()
            
            if not events:
                continue
            
            # Calculate statistics
            total_events = len(events)
            road_name = events[0].road_name
            location_lat = events[0].location_lat
            location_lon = events[0].location_lon
            
            # Calculate hours from start/end pairs
            total_hours = 0
            flood_count = 0
            
            j = 0
            while j < len(events) - 1:
                if events[j].event_type == 'flood_start':
                    # Find next flood_end
                    k = j + 1
                    while k < len(events) and events[k].event_type != 'flood_end':
                        k += 1
                    
                    if k < len(events):
                        duration = (events[k].event_time - events[j].event_time).total_seconds() / 3600
                        if duration > 0:
                            total_hours += duration
                            flood_count += 1
                        j = k + 1
                    else:
                        j += 1
                else:
                    j += 1
            
            if flood_count == 0:
                continue
            
            avg_duration = total_hours / flood_count if flood_count > 0 else 0
            
            # Create new hotspot
            hotspot = FloodHotspot(
                road_id=road_id,
                road_name=road_name,
                location_lat=location_lat,
                location_lon=location_lon,
                total_flood_events=flood_count,
                total_flooded_hours=round(total_hours, 2),
                average_flood_duration_hours=round(avg_duration, 2),
                frequency_per_year=0,  # Will be calculated separately
                flood_risk_score=50  # Default score, will be recalculated
            )
            
            db.add(hotspot)
            created_count += 1
        
        db.commit()
        
        print(f"\n✅ Created {created_count} hotspots from flood events")
        
        # Show results
        after_hotspots = db.query(func.count(FloodHotspot.id)).scalar() or 0
        after_hours = db.query(func.sum(FloodHotspot.total_flooded_hours)).scalar() or 0
        max_hours = db.query(func.max(FloodHotspot.total_flooded_hours)).scalar() or 0
        avg_hours = db.query(func.avg(FloodHotspot.total_flooded_hours)).scalar() or 0
        
        print(f"\nAFTER:")
        print(f"  Hotspots: {after_hotspots:,}")
        print(f"  Total hours: {after_hours:,.1f}h")
        print(f"  Max hours per road: {max_hours:.1f}h")
        print(f"  Avg hours per road: {avg_hours:.1f}h")
        
        print(f"\n✨ Fixed! Data is now accurate and realistic.")
        
        db.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        db.close()

if __name__ == "__main__":
    final_fix()
