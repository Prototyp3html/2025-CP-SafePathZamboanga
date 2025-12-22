#!/usr/bin/env python
"""
Production cleanup script - removes all flood data except demo data from Dec 14-17
Run this on the deployed site to clean up production database

Usage:
  python cleanup_production_flood_data.py
"""

from models import SessionLocal, FloodEventLog, FloodHotspot
from datetime import datetime
import sys

def cleanup_production():
    """Clean up production flood data, keeping only demo data"""
    
    db = SessionLocal()
    
    try:
        print("=" * 70)
        print("PRODUCTION FLOOD DATA CLEANUP")
        print("=" * 70)
        
        # Count before
        events_before = db.query(FloodEventLog).count()
        hotspots_before = db.query(FloodHotspot).count()
        
        print(f"\n📊 BEFORE CLEANUP:")
        print(f"   Flood Events: {events_before:,}")
        print(f"   Hotspots: {hotspots_before:,}")
        
        # Confirm before deleting
        print("\n⚠️  THIS WILL DELETE ALL FLOOD DATA EXCEPT DEC 14 & 17 DEMO DATA")
        confirm = input("\nType 'YES' to confirm cleanup: ").strip().upper()
        
        if confirm != "YES":
            print("❌ Cleanup cancelled")
            return False
        
        print("\n🔄 Starting cleanup...")
        
        # Step 1: Delete flood events except demo dates
        print("\n1️⃣  Deleting old flood events (keeping Dec 14 & 17)...")
        deleted_events = db.query(FloodEventLog).filter(
            ~((FloodEventLog.event_time >= datetime(2025, 12, 14, 0, 0, 0)) & 
              (FloodEventLog.event_time < datetime(2025, 12, 15, 0, 0, 0))),
            ~((FloodEventLog.event_time >= datetime(2025, 12, 17, 0, 0, 0)) & 
              (FloodEventLog.event_time < datetime(2025, 12, 18, 0, 0, 0)))
        ).delete()
        
        db.commit()
        print(f"   ✅ Deleted {deleted_events:,} old flood events")
        
        # Step 2: Delete all hotspots (will recreate from demo data)
        print("\n2️⃣  Deleting old hotspots (will recalculate)...")
        deleted_hotspots = db.query(FloodHotspot).delete()
        db.commit()
        print(f"   ✅ Deleted {deleted_hotspots:,} hotspots")
        
        # Step 3: Recalculate hotspots from remaining demo data
        print("\n3️⃣  Recalculating hotspots from demo data...")
        from services.flood_data_updater import FloodDataUpdater
        updater = FloodDataUpdater(db_session=db)
        updater.recalculate_flood_hotspots()
        print(f"   ✅ Hotspots recalculated")
        
        # Verify
        events_after = db.query(FloodEventLog).count()
        hotspots_after = db.query(FloodHotspot).count()
        
        print(f"\n📊 AFTER CLEANUP:")
        print(f"   Flood Events: {events_after:,}")
        print(f"   Hotspots: {hotspots_after:,}")
        
        print(f"\n📈 REMOVED:")
        print(f"   Events: {events_before - events_after:,}")
        print(f"   Hotspots: {hotspots_before - hotspots_after:,}")
        
        # Show demo data that was kept
        print(f"\n✨ DEMO DATA (KEPT):")
        hotspots = db.query(FloodHotspot).all()
        for h in sorted(hotspots, key=lambda x: x.road_name):
            print(f"   {h.road_name}: {h.total_flood_events} events, {h.total_flooded_hours}h, score={h.flood_risk_score}")
        
        print("\n" + "=" * 70)
        print("✅ CLEANUP COMPLETED SUCCESSFULLY!")
        print("=" * 70)
        
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        db.rollback()
        return False
        
    finally:
        db.close()

if __name__ == "__main__":
    success = cleanup_production()
    sys.exit(0 if success else 1)
