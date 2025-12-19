#!/usr/bin/env python3
"""
Expand flood hotspot coverage across entire Zamboanga City
- Uses the fuller zcroadmap.geojson (11,982 roads) instead of terrain_roads.geojson (10,727 roads)
- Expands analysis boundaries to include all of Zamboanga City
- Fills gaps in flood analysis
"""

import json
import sqlite3
import math
from pathlib import Path
from datetime import datetime

# Zamboanga City expanded boundaries (more comprehensive)
BOUNDS = {
    'min_lat': 6.83,
    'max_lat': 7.18,
    'min_lon': 121.92,
    'max_lon': 122.32
}

def load_road_network(geojson_path: str) -> list:
    """Load road network from GeoJSON"""
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
                # Use first coordinate as representative point
                road = {
                    'id': props.get('id', f"road_{len(roads)}"),
                    'name': props.get('name', f"Road {len(roads)}"),
                    'lat': coords[0][1],
                    'lon': coords[0][0],
                    'highway_type': props.get('highway', 'unclassified'),
                    'coordinates': coords
                }
                
                # Check if within expanded bounds
                if (BOUNDS['min_lat'] <= road['lat'] <= BOUNDS['max_lat'] and
                    BOUNDS['min_lon'] <= road['lon'] <= BOUNDS['max_lon']):
                    roads.append(road)
    
    return roads

def analyze_coverage(roads: list) -> dict:
    """Analyze geographic coverage"""
    if not roads:
        return {}
    
    lats = [r['lat'] for r in roads]
    lons = [r['lon'] for r in roads]
    
    # Grid analysis (0.1 degree cells)
    grid = {}
    for road in roads:
        lat_bin = round(road['lat'], 1)
        lon_bin = round(road['lon'], 1)
        key = f"{lat_bin},{lon_bin}"
        grid[key] = grid.get(key, 0) + 1
    
    return {
        'total_roads': len(roads),
        'lat_range': (min(lats), max(lats)),
        'lon_range': (min(lons), max(lons)),
        'grid_cells_covered': len(grid),
        'densest_cell': max(grid.items(), key=lambda x: x[1]) if grid else None,
        'coverage_grid': grid
    }

def compare_datasets():
    """Compare current dataset with expanded dataset"""
    print("\n" + "="*70)
    print("COVERAGE ANALYSIS REPORT")
    print("="*70)
    
    # Analyze current dataset
    terrain_roads = load_road_network(
        r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\terrain_roads.geojson'
    )
    terrain_stats = analyze_coverage(terrain_roads)
    
    # Analyze fuller dataset
    zc_roads = load_road_network(
        r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\zcroadmap.geojson'
    )
    zc_stats = analyze_coverage(zc_roads)
    
    print("\n📊 CURRENT DATASET (terrain_roads.geojson):")
    print(f"   Total roads: {terrain_stats['total_roads']}")
    print(f"   Latitude range: {terrain_stats['lat_range'][0]:.4f} to {terrain_stats['lat_range'][1]:.4f}")
    print(f"   Longitude range: {terrain_stats['lon_range'][0]:.4f} to {terrain_stats['lon_range'][1]:.4f}")
    print(f"   Grid cells covered: {terrain_stats['grid_cells_covered']}")
    if terrain_stats['densest_cell']:
        print(f"   Densest cell: {terrain_stats['densest_cell'][0]} ({terrain_stats['densest_cell'][1]} roads)")
    
    print("\n📊 EXPANDED DATASET (zcroadmap.geojson):")
    print(f"   Total roads: {zc_stats['total_roads']}")
    print(f"   Latitude range: {zc_stats['lat_range'][0]:.4f} to {zc_stats['lat_range'][1]:.4f}")
    print(f"   Longitude range: {zc_stats['lon_range'][0]:.4f} to {zc_stats['lon_range'][1]:.4f}")
    print(f"   Grid cells covered: {zc_stats['grid_cells_covered']}")
    if zc_stats['densest_cell']:
        print(f"   Densest cell: {zc_stats['densest_cell'][0]} ({zc_stats['densest_cell'][1]} roads)")
    
    improvement = ((zc_stats['total_roads'] - terrain_stats['total_roads']) / terrain_stats['total_roads'] * 100)
    grid_improvement = ((zc_stats['grid_cells_covered'] - terrain_stats['grid_cells_covered']) / terrain_stats['grid_cells_covered'] * 100)
    
    print("\n📈 IMPROVEMENT:")
    print(f"   Additional roads: {zc_stats['total_roads'] - terrain_stats['total_roads']} (+{improvement:.1f}%)")
    print(f"   Additional grid cells: {zc_stats['grid_cells_covered'] - terrain_stats['grid_cells_covered']} (+{grid_improvement:.1f}%)")
    
    # Coverage distribution
    print("\n📍 COVERAGE BY GRID CELL (0.1° cells):")
    print("\n   CURRENT (terrain_roads):")
    current_sorted = sorted(terrain_stats['coverage_grid'].items(), key=lambda x: x[1], reverse=True)
    for cell, count in current_sorted[:5]:
        print(f"     {cell}: {count} roads")
    
    print("\n   EXPANDED (zcroadmap):")
    expanded_sorted = sorted(zc_stats['coverage_grid'].items(), key=lambda x: x[1], reverse=True)
    for cell, count in expanded_sorted[:10]:
        print(f"     {cell}: {count} roads")
    
    return terrain_stats, zc_stats

def identify_coverage_gaps(stats: dict) -> list:
    """Identify grid cells with low coverage"""
    gaps = []
    for cell, count in stats['coverage_grid'].items():
        if count < 50:  # Cells with less than 50 roads
            gaps.append((cell, count))
    return sorted(gaps, key=lambda x: x[1])

def create_expanded_geojson():
    """Create an optimized GeoJSON combining best coverage"""
    print("\n" + "="*70)
    print("GENERATING OPTIMIZED COVERAGE GEOJSON")
    print("="*70)
    
    with open(r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\zcroadmap.geojson', 'r') as f:
        data = json.load(f)
    
    # Filter for optimal coverage
    filtered_features = []
    for feat in data.get('features', []):
        geometry = feat.get('geometry', {})
        if geometry['type'] == 'LineString':
            coords = geometry['coordinates']
            if len(coords) > 0:
                lat = coords[0][1]
                lon = coords[0][0]
                if (BOUNDS['min_lat'] <= lat <= BOUNDS['max_lat'] and
                    BOUNDS['min_lon'] <= lon <= BOUNDS['max_lon']):
                    filtered_features.append(feat)
    
    output_data = {
        'type': 'FeatureCollection',
        'features': filtered_features
    }
    
    output_path = r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\data\zamboanga_complete_roads.geojson'
    with open(output_path, 'w') as f:
        json.dump(output_data, f)
    
    print(f"\n✅ Created optimized GeoJSON: zamboanga_complete_roads.geojson")
    print(f"   Features: {len(filtered_features)}")
    print(f"   Path: {output_path}")
    
    return output_path, len(filtered_features)

def main():
    print("\n🚀 SafePath Coverage Expansion Tool")
    print("="*70)
    
    # Compare datasets
    terrain_stats, zc_stats = compare_datasets()
    
    # Identify gaps in current coverage
    print("\n🔍 COVERAGE GAPS IN CURRENT DATASET:")
    gaps = identify_coverage_gaps(terrain_stats)
    if gaps:
        print(f"   Found {len(gaps)} grid cells with <50 roads")
        print("   Areas needing expansion:")
        for cell, count in gaps[:5]:
            print(f"     {cell}: {count} roads")
    
    # Create optimized geojson
    output_path, feature_count = create_expanded_geojson()
    
    print("\n" + "="*70)
    print("NEXT STEPS:")
    print("="*70)
    print("\n1. Update flood_data_updater.py to use the new expanded boundaries:")
    print("   ZAMBOANGA_BOUNDS = {")
    print(f"       'min_lat': {BOUNDS['min_lat']},")
    print(f"       'max_lat': {BOUNDS['max_lat']},")
    print(f"       'min_lon': {BOUNDS['min_lon']},")
    print(f"       'max_lon': {BOUNDS['max_lon']}")
    print("   }")
    
    print("\n2. Option A: Use Overpass API (real-time)")
    print("   - Already fetches OSM data, will automatically get better coverage")
    print("   - Currently limited to OSM completeness in each area")
    
    print("\n2. Option B: Pre-load roads from complete dataset")
    print("   - Use zamboanga_complete_roads.geojson as seed data")
    print("   - Ensures all peripheral areas are analyzed")
    
    print("\n3. Run flood analysis on expanded road network:")
    print("   python -c \"from services.flood_data_updater import FloodDataUpdater; ...")
    print("   - Will analyze all new roads for flood risk")
    print("   - Results will fill coverage gaps")
    
    print("\n" + "="*70)

if __name__ == '__main__':
    main()
