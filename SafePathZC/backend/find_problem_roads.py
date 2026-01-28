#!/usr/bin/env python3
"""
Find roads with excessive flood hours
"""
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

PRODUCTION_DB_URL = "postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway"

from models import FloodHotspot

def find_problem_roads():
    """Find roads with excessive hours"""
    engine = create_engine(PRODUCTION_DB_URL)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    try:
        print("\n" + "="*70)
        print("🔴 ROADS WITH EXCESSIVE FLOOD HOURS")
        print("="*70 + "\n")
        
        # Get top roads by total hours
        top_roads = db.query(
            FloodHotspot.road_name,
            FloodHotspot.road_id,
            FloodHotspot.total_flood_events,
            FloodHotspot.total_flooded_hours,
            FloodHotspot.flood_risk_score
        ).order_by(
            FloodHotspot.total_flooded_hours.desc()
        ).limit(20).all()
        
        print(f"{'Road Name':<15} {'Events':<10} {'Hours':<12} {'Risk Score':<12}")
        print("-" * 50)
        
        total_hours = 0
        for road_name, road_id, events, hours, risk in top_roads:
            print(f"{road_name:<15} {events:<10} {hours:<12.1f} {risk:<12.1f}")
            total_hours += hours
        
        print("-" * 50)
        print(f"{'TOTAL':<15} {'':10} {total_hours:<12.1f}")
        print("\n💡 These roads are likely generating excessive continuous floods")
        print("   (probably generated data rather than real events)")
        
        # Count how many roads
        total_roads = db.query(func.count(FloodHotspot.id)).scalar()
        total_system_hours = db.query(func.sum(FloodHotspot.total_flooded_hours)).scalar() or 0
        
        print(f"\n📊 System totals:")
        print(f"   Total hotspots: {total_roads:,}")
        print(f"   Total system hours: {total_system_hours:,.1f}h")
        print(f"   Average per hotspot: {total_system_hours/max(total_roads, 1):.1f}h")
        
        db.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.close()

if __name__ == "__main__":
    find_problem_roads()
