"""
Cleanup corrupted flood event data
BUG: flood_start was logged EVERY UPDATE instead of only once when flooding began
This caused 47,084 flood_starts vs only 506 flood_ends (93:1 ratio!)

This script:
1. Deletes orphan flood_start events (those without matching flood_end)
2. Keeps only properly paired events
3. Recalculates flood_hotspots with correct statistics
"""

import os
import sys
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Railway database connection
DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway')

def cleanup_flood_events():
    """Delete corrupted flood events and keep only valid paired events"""
    
    engine = create_engine(DB_URL)
    
    with engine.connect() as conn:
        # Step 1: Count current events
        result = conn.execute(text('''
            SELECT event_type, COUNT(*) 
            FROM flood_event_logs 
            GROUP BY event_type
        '''))
        print("\n📊 BEFORE CLEANUP:")
        for row in result:
            print(f"  {row[0]}: {row[1]} events")
        
        # Step 2: Get all unique roads with flood_end events
        # These are the "valid" flood cycles we want to keep
        result = conn.execute(text('''
            SELECT DISTINCT road_id FROM flood_event_logs 
            WHERE event_type = 'flood_end'
        '''))
        roads_with_ends = [row[0] for row in result]
        print(f"\n🔍 Found {len(roads_with_ends)} roads with flood_end events")
        
        # Step 3: For each road with flood_end events, find valid start/end pairs
        # A valid pair: flood_start within 72 hours BEFORE a flood_end
        valid_event_ids = []
        
        for road_id in roads_with_ends:
            # Get all flood_end events for this road
            ends = conn.execute(text('''
                SELECT id, event_time FROM flood_event_logs
                WHERE road_id = :road_id AND event_type = 'flood_end'
                ORDER BY event_time
            '''), {'road_id': road_id}).fetchall()
            
            for end_id, end_time in ends:
                valid_event_ids.append(end_id)  # Keep the flood_end
                
                # Find the CLOSEST flood_start before this end (within 72 hours)
                max_duration = timedelta(hours=72)
                min_time = end_time - max_duration
                
                start = conn.execute(text('''
                    SELECT id FROM flood_event_logs
                    WHERE road_id = :road_id 
                      AND event_type = 'flood_start'
                      AND event_time < :end_time
                      AND event_time >= :min_time
                    ORDER BY event_time DESC
                    LIMIT 1
                '''), {'road_id': road_id, 'end_time': end_time, 'min_time': min_time}).fetchone()
                
                if start:
                    valid_event_ids.append(start[0])  # Keep the matching flood_start
        
        print(f"✅ Identified {len(valid_event_ids)} valid events to keep")
        
        # Step 4: Delete all events NOT in the valid list
        if valid_event_ids:
            # Convert to tuple for SQL IN clause
            ids_str = ','.join(str(id) for id in valid_event_ids)
            
            # Count how many will be deleted
            result = conn.execute(text(f'''
                SELECT COUNT(*) FROM flood_event_logs 
                WHERE id NOT IN ({ids_str})
            '''))
            to_delete = result.fetchone()[0]
            print(f"🗑️  Deleting {to_delete} corrupted events...")
            
            # Delete corrupted events
            conn.execute(text(f'''
                DELETE FROM flood_event_logs 
                WHERE id NOT IN ({ids_str})
            '''))
            conn.commit()
        else:
            # No valid events found - delete all and start fresh
            print("⚠️  No valid paired events found. Deleting ALL events...")
            conn.execute(text('DELETE FROM flood_event_logs'))
            conn.commit()
        
        # Step 5: Verify cleanup
        result = conn.execute(text('''
            SELECT event_type, COUNT(*) 
            FROM flood_event_logs 
            GROUP BY event_type
        '''))
        print("\n📊 AFTER CLEANUP:")
        for row in result:
            print(f"  {row[0]}: {row[1]} events")
        
        print("\n✅ Flood event cleanup complete!")


def reset_flood_hotspots():
    """Reset flood hotspot statistics based on cleaned event data"""
    
    engine = create_engine(DB_URL)
    
    with engine.connect() as conn:
        print("\n🔄 Recalculating flood hotspot statistics...")
        
        # Get all unique roads from cleaned events
        result = conn.execute(text('''
            SELECT DISTINCT road_id FROM flood_event_logs
        '''))
        roads = [row[0] for row in result]
        
        print(f"Found {len(roads)} roads with valid flood history")
        
        for road_id in roads:
            # Get all events for this road, sorted by time
            events = conn.execute(text('''
                SELECT event_type, event_time, road_name, elevation_m, distance_to_water_m,
                       location_lat, location_lon
                FROM flood_event_logs
                WHERE road_id = :road_id
                ORDER BY event_time
            '''), {'road_id': road_id}).fetchall()
            
            if not events:
                continue
            
            # Count flood starts
            total_flood_events = len([e for e in events if e[0] == 'flood_start'])
            
            # Calculate total flooded hours by pairing start/end
            total_flooded_hours = 0.0
            i = 0
            while i < len(events) - 1:
                current = events[i]
                next_event = events[i + 1]
                
                if current[0] == 'flood_start' and next_event[0] == 'flood_end':
                    duration_hours = (next_event[1] - current[1]).total_seconds() / 3600
                    if 0 < duration_hours < 72:  # Sanity check: max 72 hours
                        total_flooded_hours += duration_hours
                    i += 2
                else:
                    i += 1
            
            # Get first and last event
            first_event = events[0]
            last_event = events[-1]
            
            # Calculate days between first and last
            days_between = max(1, (last_event[1] - first_event[1]).days + 1)
            
            # Calculate frequency per year
            frequency_per_year = (total_flood_events / days_between) * 365
            
            # Calculate average duration
            average_duration = total_flooded_hours / max(total_flood_events, 1)
            
            # Get terrain data
            elevations = [e[3] for e in events if e[3]]
            distances = [e[4] for e in events if e[4]]
            avg_elevation = sum(elevations) / len(elevations) if elevations else None
            avg_distance = sum(distances) / len(distances) if distances else None
            
            # Calculate risk score (simplified)
            frequency_score = min(40, (frequency_per_year ** 0.7) * 15)
            hours_score = min(30, (total_flooded_hours ** 0.6) * 2.2)
            
            terrain_score = 0
            if avg_elevation is not None:
                if avg_elevation < 3: terrain_score = 20
                elif avg_elevation < 5: terrain_score = 15
                elif avg_elevation < 10: terrain_score = 10
                elif avg_elevation < 20: terrain_score = 5
            
            proximity_score = 0
            if avg_distance is not None:
                if avg_distance < 50: proximity_score = 10
                elif avg_distance < 100: proximity_score = 7
                elif avg_distance < 200: proximity_score = 4
            
            risk_score = min(100, frequency_score + hours_score + terrain_score + proximity_score)
            
            # Get road info from events
            road_name = first_event[2]
            location_lat = first_event[5]
            location_lon = first_event[6]
            
            # Update or insert hotspot
            existing = conn.execute(text('''
                SELECT road_id FROM flood_hotspots WHERE road_id = :road_id
            '''), {'road_id': road_id}).fetchone()
            
            if existing:
                conn.execute(text('''
                    UPDATE flood_hotspots SET
                        total_flood_events = :events,
                        total_flooded_hours = :hours,
                        average_flood_duration_hours = :avg_dur,
                        frequency_per_year = :freq,
                        flood_risk_score = :risk,
                        average_elevation_m = :elev,
                        distance_to_water_m = :dist,
                        last_flood_start = :last_start,
                        last_flood_end = :last_end,
                        last_updated = :now
                    WHERE road_id = :road_id
                '''), {
                    'road_id': road_id,
                    'events': total_flood_events,
                    'hours': round(total_flooded_hours, 2),
                    'avg_dur': round(average_duration, 2),
                    'freq': round(frequency_per_year, 2),
                    'risk': round(risk_score, 2),
                    'elev': avg_elevation,
                    'dist': avg_distance,
                    'last_start': last_event[1] if last_event[0] == 'flood_start' else first_event[1],
                    'last_end': last_event[1] if last_event[0] == 'flood_end' else None,
                    'now': datetime.utcnow()
                })
            else:
                conn.execute(text('''
                    INSERT INTO flood_hotspots 
                    (road_id, road_name, location_lat, location_lon, total_flood_events,
                     total_flooded_hours, average_flood_duration_hours, frequency_per_year,
                     flood_risk_score, average_elevation_m, distance_to_water_m,
                     first_flood_recorded, last_flood_start, last_updated)
                    VALUES
                    (:road_id, :name, :lat, :lon, :events, :hours, :avg_dur, :freq,
                     :risk, :elev, :dist, :first, :last_start, :now)
                '''), {
                    'road_id': road_id,
                    'name': road_name,
                    'lat': location_lat,
                    'lon': location_lon,
                    'events': total_flood_events,
                    'hours': round(total_flooded_hours, 2),
                    'avg_dur': round(average_duration, 2),
                    'freq': round(frequency_per_year, 2),
                    'risk': round(risk_score, 2),
                    'elev': avg_elevation,
                    'dist': avg_distance,
                    'first': first_event[1],
                    'last_start': last_event[1] if last_event[0] == 'flood_start' else first_event[1],
                    'now': datetime.utcnow()
                })
            
            print(f"  ✅ {road_name[:30]:30} | Events: {total_flood_events:3} | Hours: {total_flooded_hours:6.1f}h | Risk: {risk_score:5.1f}")
        
        conn.commit()
        
        # Delete hotspots for roads that no longer have events
        conn.execute(text('''
            DELETE FROM flood_hotspots 
            WHERE road_id NOT IN (SELECT DISTINCT road_id FROM flood_event_logs)
        '''))
        conn.commit()
        
        print("\n✅ Flood hotspot recalculation complete!")


if __name__ == '__main__':
    print("="*60)
    print("FLOOD DATA CLEANUP UTILITY")
    print("Fixing bug: 47,084 flood_starts vs 506 flood_ends")
    print("="*60)
    
    # Step 1: Clean up corrupted events
    cleanup_flood_events()
    
    # Step 2: Recalculate hotspot statistics
    reset_flood_hotspots()
    
    print("\n" + "="*60)
    print("CLEANUP COMPLETE!")
    print("The flood data has been corrected.")
    print("="*60)
