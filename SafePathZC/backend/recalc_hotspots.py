#!/usr/bin/env python
"""Recalculate hotspot statistics after cleaning flood events"""

from models import SessionLocal, FloodEventLog, FloodHotspot, engine
from services.flood_data_updater import FloodDataUpdater
from sqlalchemy.orm import sessionmaker

# Create fresh session
Session = sessionmaker(bind=engine)
db_session = Session()

try:
    # Recalculate hotspots based on remaining demo data
    updater = FloodDataUpdater(db_session=db_session)
    updater.recalculate_flood_hotspots()
    print("✅ Hotspots recalculated based on demo data")
    
    # Verify
    hotspots = db_session.query(FloodHotspot).all()
    print(f"\nTotal hotspots: {len(hotspots)}")
    
    for h in sorted(hotspots, key=lambda x: x.road_name)[:10]:
        print(f"  {h.road_name}: {h.total_flood_events} events, {h.total_flooded_hours}h, score={h.flood_risk_score}")
        
finally:
    db_session.close()
