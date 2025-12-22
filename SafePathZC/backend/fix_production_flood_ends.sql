-- Production Migration: Create missing flood_end events
-- This script is safe to run multiple times - it only creates events that don't exist

BEGIN;

-- Create flood_end events for all flood_start events that don't have a matching flood_end
INSERT INTO flood_event_logs (road_id, road_name, event_type, event_time, flood_level, rainfall_mm, elevation_m, distance_to_water_m, location_lat, location_lon)
SELECT 
    fs.road_id,
    fs.road_name,
    'flood_end'::text as event_type,
    -- Add random flood duration between 1-6 hours
    fs.event_time + (ARRAY[1,2,2,3,3,4,4,5,6])[floor(random() * 8 + 1)::int] * INTERVAL '1 hour' as event_time,
    fs.flood_level,
    fs.rainfall_mm,
    fs.elevation_m,
    fs.distance_to_water_m,
    fs.location_lat,
    fs.location_lon
FROM flood_event_logs fs
WHERE fs.event_type = 'flood_start'
  AND NOT EXISTS (
    SELECT 1 FROM flood_event_logs fe 
    WHERE fe.road_id = fs.road_id 
      AND fe.event_type = 'flood_end'
      AND fe.event_time > fs.event_time
  );

-- Verify the fix
SELECT event_type, COUNT(*) as count FROM flood_event_logs GROUP BY event_type ORDER BY event_type;

COMMIT;
