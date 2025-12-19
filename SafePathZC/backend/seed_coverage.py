#!/usr/bin/env python3
"""
Seed flood hotspot data from complete road network to fill coverage gaps
This ensures all peripheral areas of Zamboanga City get flood analysis
"""

import json
import sqlite3
import sys
from pathlib import Path
from datetime import datetime
import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in km"""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon/2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

def get_existing_hotspots(db_path):
    """Get all existing hotspots"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT road_id, location_lat, location_lon 
        FROM flood_hotspots
    ''')
    
    existing = {row[0]: (row[1], row[2]) for row in cursor.fetchall()}
    conn.close()
    return existing

def load_complete_roads(geojson_path):
    """Load complete road network"""
    print(f"Loading roads from {Path(geojson_path).name}...")
    with open(geojson_path, 'r') as f:
        data = json.load(f)
    
    roads = []
    for feat in data.get('features', []):
        props = feat.get('properties', {})
        geometry = feat.get('geometry', {})
        
        if geometry['type'] == 'LineString':
            coords = geometry['coordinates']
            if len(coords) > 0:
                road = {
                    'id': props.get('id', f"road_{len(roads)}"),
                    'name': props.get('name', f"Road {len(roads)}"),
                    'lat': coords[0][1],
                    'lon': coords[0][0],
                    'highway_type': props.get('highway', 'unclassified'),
                }
                roads.append(road)
    
    return roads

def estimate_flood_risk(lat, lon):
    """
    Estimate flood risk for a location based on known flood-prone areas
    Uses proximity to known high-risk zones
    """
    # Known flood-prone areas in Zamboanga
    FLOOD_PRONE_AREAS = [
        {'name': 'Rio Hondo', 'lat': 6.9119, 'lon': 122.0790, 'base_score': 18.0},
        {'name': 'Tetuan', 'lat': 6.9210, 'lon': 122.0790, 'base_score': 16.5},
        {'name': 'Canelar', 'lat': 6.9060, 'lon': 122.0800, 'base_score': 14.0},
        {'name': 'San Jose Gusu', 'lat': 6.9420, 'lon': 122.0730, 'base_score': 12.0},
        {'name': 'Sta. Maria', 'lat': 6.9050, 'lon': 122.0740, 'base_score': 11.0},
        {'name': 'Pasonanca', 'lat': 6.9380, 'lon': 122.0620, 'base_score': 8.0},
    ]
    
    max_score = 0
    
    for area in FLOOD_PRONE_AREAS:
        distance = haversine_distance(lat, lon, area['lat'], area['lon'])
        # Score decreases with distance (1km away = score drops to 80%, 2km = 60%, etc.)
        if distance < 2:  # Only consider areas within 2km
            proximity_factor = max(0, 1 - (distance / 2)) * 0.5  # Max 50% boost from proximity
            score = area['base_score'] * (1 + proximity_factor)
            max_score = max(max_score, score)
    
    # If not near any known flood area, assign lower baseline score
    if max_score == 0:
        max_score = 5.0  # Low flood risk baseline for peripheral areas
    
    return round(max_score, 2)

def seed_hotspot_data(db_path, geojson_path, dry_run=False):
    """Seed missing hotspots from complete road network"""
    
    print("\n" + "="*70)
    print("SEEDING FLOOD HOTSPOT DATA FROM COMPLETE ROAD NETWORK")
    print("="*70)
    
    # Get existing hotspots
    existing = get_existing_hotspots(db_path)
    print(f"\n📊 Existing hotspots: {len(existing)}")
    
    # Load complete roads
    all_roads = load_complete_roads(geojson_path)
    print(f"📍 Complete road network: {len(all_roads)} roads")
    
    # Find missing roads
    missing_roads = [r for r in all_roads if r['id'] not in existing]
    print(f"🔍 Missing roads needing analysis: {len(missing_roads)}")
    
    if not missing_roads:
        print("\n✅ All roads already have flood analysis data!")
        return
    
    # Analyze missing roads
    print(f"\n📈 Analyzing {len(missing_roads)} missing roads for flood risk...")
    
    new_hotspots = []
    for i, road in enumerate(missing_roads):
        if (i + 1) % 1000 == 0:
            print(f"   Processed {i + 1}/{len(missing_roads)}...")
        
        risk_score = estimate_flood_risk(road['lat'], road['lon'])
        
        hotspot = {
            'road_id': road['id'],
            'road_name': road['name'],
            'location_lat': road['lat'],
            'location_lon': road['lon'],
            'total_flood_events': 0,
            'total_flooded_hours': 0.0,
            'average_flood_duration_hours': 0.0,
            'flood_risk_score': risk_score,
            'frequency_per_year': 0.0,
            'last_updated': datetime.utcnow().isoformat()
        }
        
        new_hotspots.append(hotspot)
    
    print(f"\n✅ Estimated flood risk for {len(new_hotspots)} roads")
    
    # Insert into database
    if not dry_run:
        print(f"\n💾 Inserting {len(new_hotspots)} new hotspots into database...")
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Insert in batches
        batch_size = 500
        for i in range(0, len(new_hotspots), batch_size):
            batch = new_hotspots[i:i + batch_size]
            
            for hs in batch:
                cursor.execute('''
                    INSERT INTO flood_hotspots (
                        road_id, road_name, location_lat, location_lon,
                        total_flood_events, total_flooded_hours, 
                        average_flood_duration_hours, flood_risk_score,
                        frequency_per_year, last_updated
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    hs['road_id'], hs['road_name'],
                    hs['location_lat'], hs['location_lon'],
                    hs['total_flood_events'], hs['total_flooded_hours'],
                    hs['average_flood_duration_hours'], hs['flood_risk_score'],
                    hs['frequency_per_year'], hs['last_updated']
                ))
            
            conn.commit()
            print(f"   Inserted batch {i//batch_size + 1}...")
        
        conn.close()
        print(f"\n✅ Successfully inserted {len(new_hotspots)} new hotspots!")
    else:
        print("\n(DRY RUN - No data inserted)")
    
    # Show coverage improvement
    print("\n📊 COVERAGE IMPROVEMENT:")
    print(f"   Before: {len(existing)} hotspots")
    print(f"   After: {len(existing) + len(new_hotspots)} hotspots")
    print(f"   Added: {len(new_hotspots)} (+{len(new_hotspots)/len(existing)*100:.1f}%)")
    
    # Analyze new distribution
    print("\n📍 NEW GEOGRAPHIC DISTRIBUTION:")
    grid = {}
    for hs in new_hotspots:
        lat_bin = round(hs['location_lat'], 1)
        lon_bin = round(hs['location_lon'], 1)
        key = f"{lat_bin},{lon_bin}"
        grid[key] = grid.get(key, 0) + 1
    
    print("   New roads added by grid cell (0.1° cells):")
    sorted_grid = sorted(grid.items(), key=lambda x: x[1], reverse=True)
    for cell, count in sorted_grid[:8]:
        print(f"     {cell}: +{count} roads")
    
    print("\n" + "="*70)

def main():
    db_path = r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\safepath.db'
    geojson_path = r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\zamboanga_complete_roads.geojson'
    
    if not Path(db_path).exists():
        print(f"❌ Database not found: {db_path}")
        return
    
    if not Path(geojson_path).exists():
        print(f"❌ Road data not found: {geojson_path}")
        print("   Run expand_coverage.py first to create zamboanga_complete_roads.geojson")
        return
    
    # Check if we should do dry run
    dry_run = len(sys.argv) > 1 and sys.argv[1] == '--dry-run'
    
    seed_hotspot_data(db_path, geojson_path, dry_run=dry_run)

if __name__ == '__main__':
    main()
