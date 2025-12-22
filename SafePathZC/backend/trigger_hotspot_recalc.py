#!/usr/bin/env python3
"""
Trigger flood hotspot recalculation directly
"""
import os
import sys
sys.path.insert(0, os.getcwd())

from services.flood_data_updater import FloodDataUpdater
from models import SessionLocal

# Get database session
db_session = SessionLocal()

# Initialize updater
updater = FloodDataUpdater(db_session=db_session)

print("[*] Triggering flood hotspot recalculation...")
updater.recalculate_flood_hotspots()
print("[+] Recalculation complete!")

db_session.close()
