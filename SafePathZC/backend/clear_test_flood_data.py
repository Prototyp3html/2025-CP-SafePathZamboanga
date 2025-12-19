"""
Clear test flood data from the database
Removes all FloodHotspot, FloodEventLog, and FloodStatistics entries
so only real data from manual/automatic updates will be shown
"""

from models import SessionLocal, FloodHotspot, FloodEventLog, FloodStatistics

db = SessionLocal()

try:
    # Count before deletion
    hotspot_count = db.query(FloodHotspot).count()
    event_count = db.query(FloodEventLog).count()
    stats_count = db.query(FloodStatistics).count()
    
    print(f"Before cleanup:")
    print(f"  - FloodHotspot records: {hotspot_count}")
    print(f"  - FloodEventLog records: {event_count}")
    print(f"  - FloodStatistics records: {stats_count}")
    
    # Delete all test data
    print("\nRemoving test data...")
    db.query(FloodStatistics).delete()
    db.query(FloodEventLog).delete()
    db.query(FloodHotspot).delete()
    db.commit()
    
    print("✅ All test flood data removed!")
    print("\n✨ Flood hotspots toggle will now only show real data from manual/automatic updates")
    
except Exception as e:
    db.rollback()
    print(f"❌ Error: {e}")
finally:
    db.close()
