#!/usr/bin/env python3
import sqlite3

conn = sqlite3.connect(r'C:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend\safepath.db')
cursor = conn.cursor()

# Overall stats
cursor.execute('''
    SELECT 
        COUNT(*) as total,
        MIN(location_lat) as min_lat,
        MAX(location_lat) as max_lat,
        MIN(location_lon) as min_lon,
        MAX(location_lon) as max_lon,
        COUNT(DISTINCT ROUND(location_lat, 1) || ',' || ROUND(location_lon, 1)) as grid_cells,
        ROUND(AVG(flood_risk_score), 2) as avg_risk,
        COUNT(CASE WHEN flood_risk_score >= 15 THEN 1 END) as high_risk_count
    FROM flood_hotspots
''')

stats = cursor.fetchone()
print("IMPROVED COVERAGE STATISTICS:")
print("="*60)
print(f"Total hotspots: {stats[0]:,}")
print(f"Geographic span: {stats[1]:.4f} to {stats[2]:.4f}N, {stats[3]:.4f} to {stats[4]:.4f}E")
print(f"Grid cells covered (0.1 degrees): {stats[5]}")
print(f"Average flood risk score: {stats[6]}")
print(f"High-risk areas (score >= 15): {stats[7]}")
print("="*60)

# Distribution by grid
cursor.execute('''
    SELECT 
        ROUND(location_lat, 1) as lat_bin,
        ROUND(location_lon, 1) as lon_bin,
        COUNT(*) as count
    FROM flood_hotspots
    GROUP BY ROUND(location_lat, 1), ROUND(location_lon, 1)
    ORDER BY count DESC
''')

print("\nCoverage by grid cell (0.1 degree):")
for row in cursor.fetchall():
    print(f"  Lat {row[0]:4.1f}, Lon {row[1]:6.1f}: {row[2]:5d} roads")

conn.close()
