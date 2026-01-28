#!/usr/bin/env python3
"""
SIMPLE FIX: Delete hotspots with unrealistic hours (>1000h)
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

from models import FloodHotspot

def simple_fix():
    """Delete hotspots with >1000 hours (unrealistic)"""
    engine = create_engine(PRODUCTION_DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        print("\n" + "="*70)
        print("🔧 SIMPLE FIX: DELETE UNREALISTIC HOTSPOTS")
        print("="*70 + "\n")
        
        # Find hotspots with >1000 hours
        bad_hotspots = db.query(FloodHotspot).filter(
            FloodHotspot.total_flooded_hours > 1000
        ).all()
        
        print(f"Found {len(bad_hotspots)} hotspots with >1000 hours\n")
        
        if bad_hotspots:
            print("Deleting...")
            for hs in bad_hotspots:
                print(f"  ✓ {hs.road_name}: {hs.total_flooded_hours:.1f}h")
                db.delete(hs)
            
            db.commit()
            print(f"\n✅ Deleted {len(bad_hotspots)} corrupted hotspots")
        
        # Show remaining
        remaining = db.query(FloodHotspot).count()
        total_hours = db.query(FloodHotspot).with_entities(
            __import__('sqlalchemy', fromlist=['func']).func.sum(FloodHotspot.total_flooded_hours)
        ).scalar() or 0
        
        print(f"\n📊 Remaining:")
        print(f"  Hotspots: {remaining:,}")
        print(f"  Total hours: {total_hours:,.1f}h")
        
        db.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.close()

if __name__ == "__main__":
    simple_fix()
