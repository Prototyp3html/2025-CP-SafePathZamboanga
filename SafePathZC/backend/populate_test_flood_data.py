#!/usr/bin/env python3
"""
Test Data Population Script for Flood History
Inserts sample flood data into the database for testing and demonstration
Run this when you want to test the flood hotspot pins without waiting for real rainfall
"""

import os
from datetime import datetime, timedelta, timezone
import random
import pytz
from sqlalchemy.orm import Session
from sqlalchemy import create_engine

# Philippine Standard Time (UTC+8)
PHILIPPINE_TZ = pytz.timezone('Asia/Manila')

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
db_engine = create_engine(DATABASE_URL)

# Import models
from models import FloodEventLog, FloodHotspot, FloodStatistics, Base, get_db

# Sample Zamboanga roads that frequently flood
SAMPLE_FLOOD_ROADS = [
    {
        "road_id": "road_001",
        "road_name": "Nuñez Avenue (Near Bridge)",
        "lat": 6.9214,
        "lon": 122.0719
    },
    {
        "road_id": "road_002",
        "road_name": "Reclamation Road (South)",
        "lat": 6.9150,
        "lon": 122.0850
    },
    {
        "road_id": "road_003",
        "road_name": "Real Street (Downtown)",
        "lat": 6.9250,
        "lon": 122.0680
    },
    {
        "road_id": "road_004",
        "road_name": "Veterans Avenue (North)",
        "lat": 6.9400,
        "lon": 122.0600
    },
    {
        "road_id": "road_005",
        "road_name": "Margarita Manzano Street (East)",
        "lat": 6.9300,
        "lon": 122.0950
    }
]

def populate_test_flood_data():
    """
    Populate database with test flood data
    Creates realistic flood event patterns for testing
    """
    db: Session = next(get_db())
    
    try:
        print("🌊 Starting test flood data population...")
        
        # Clear existing test data (optional)
        # db.query(FloodEventLog).delete()
        # db.query(FloodHotspot).delete()
        # db.commit()
        
        now = datetime.now(PHILIPPINE_TZ)
        
        # Generate test data for the last 30 days
        for road in SAMPLE_FLOOD_ROADS:
            print(f"\n📍 Generating flood events for: {road['road_name']}")
            
            # Random number of flood events for this road (1-8 in last 30 days)
            num_events = random.randint(1, 8)
            total_flooded_hours = 0
            event_durations = []
            
            for event_num in range(num_events):
                # Random date in last 30 days
                days_ago = random.randint(0, 30)
                hours_ago = random.randint(0, 23)
                
                flood_start = now - timedelta(days=days_ago, hours=hours_ago)
                
                # Flood duration: 1-6 hours typically
                duration_hours = random.randint(1, 6)
                flood_end = flood_start + timedelta(hours=duration_hours)
                
                total_flooded_hours += duration_hours
                event_durations.append(duration_hours)
                
                # Random environmental data
                rainfall_mm = random.uniform(15, 120)  # Heavy rain typical for floods
                elevation_m = random.uniform(2, 15)  # Zamboanga is low elevation
                distance_to_water_m = random.uniform(50, 500)  # Distance to nearest water body
                flood_level = random.choice(['low', 'medium', 'high'])
                
                # Create flood_start event
                flood_start_event = FloodEventLog(
                    road_id=road['road_id'],
                    road_name=road['road_name'],
                    event_type='flood_start',
                    event_time=flood_start,
                    flood_level=flood_level,
                    rainfall_mm=rainfall_mm,
                    elevation_m=elevation_m,
                    distance_to_water_m=distance_to_water_m,
                    location_lat=road['lat'],
                    location_lon=road['lon']
                )
                db.add(flood_start_event)
                
                # Create flood_end event
                flood_end_event = FloodEventLog(
                    road_id=road['road_id'],
                    road_name=road['road_name'],
                    event_type='flood_end',
                    event_time=flood_end,
                    flood_level=flood_level,
                    rainfall_mm=rainfall_mm,
                    elevation_m=elevation_m,
                    distance_to_water_m=distance_to_water_m,
                    location_lat=road['lat'],
                    location_lon=road['lon']
                )
                db.add(flood_end_event)
                
                print(f"  • Event {event_num + 1}: {flood_start.strftime('%Y-%m-%d %H:%M')} " +
                      f"({duration_hours}h) - {flood_level.capitalize()}")
            
            db.commit()
            
            # Calculate risk score
            frequency_per_year = (num_events / 30) * 365
            average_duration = sum(event_durations) / len(event_durations) if event_durations else 0
            
            # Risk score: (events * 5) + (hours * 0.5), max 100
            risk_score = min(50, num_events * 5) + min(50, total_flooded_hours * 0.5)
            
            # Create or update hotspot
            hotspot = db.query(FloodHotspot).filter(
                FloodHotspot.road_id == road['road_id']
            ).first()
            
            if hotspot:
                # Update existing hotspot
                hotspot.total_flood_events = num_events
                hotspot.total_flooded_hours = total_flooded_hours
                hotspot.average_duration_hours = average_duration
                hotspot.frequency_per_year = frequency_per_year
                hotspot.flood_risk_score = risk_score
                hotspot.last_updated = now
            else:
                # Create new hotspot
                hotspot = FloodHotspot(
                    road_id=road['road_id'],
                    road_name=road['road_name'],
                    location_lat=road['lat'],
                    location_lon=road['lon'],
                    total_flood_events=num_events,
                    total_flooded_hours=total_flooded_hours,
                    average_flood_duration_hours=average_duration,
                    frequency_per_year=frequency_per_year,
                    flood_risk_score=risk_score,
                    first_flood_recorded=now - timedelta(days=30),
                    last_updated=now
                )
                db.add(hotspot)
            
            db.commit()
            
            print(f"  ✓ Hotspot created/updated:")
            print(f"    - Risk Score: {risk_score:.1f}/100")
            print(f"    - Total Flooded Hours: {total_flooded_hours}")
            print(f"    - Frequency: {frequency_per_year:.2f} times/year")
        
        print("\n✅ Test flood data population completed!")
        print(f"Generated {len(SAMPLE_FLOOD_ROADS)} flood hotspots with historical events")
        print("\n🗺️  You should now see flood pins on your map!")
        print("💡 Tip: Click the '💧 Flood Hotspots' button in MapView to toggle the pins")
        
    except Exception as e:
        print(f"❌ Error populating test data: {str(e)}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    # Create tables if they don't exist
    Base.metadata.create_all(bind=db_engine)
    
    # Populate with test data
    populate_test_flood_data()
