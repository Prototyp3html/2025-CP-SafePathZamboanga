-- Clean up all test/old flood data from production
-- Start fresh for accurate recalculation

BEGIN;

-- Show before counts
SELECT 'BEFORE CLEANUP' as status;
SELECT event_type, COUNT(*) FROM flood_event_logs GROUP BY event_type;
SELECT COUNT(*) as hotspot_count FROM flood_hotspots;

-- Delete all flood events and hotspots (clean slate for fresh data)
DELETE FROM flood_event_logs;
DELETE FROM flood_hotspots;

-- Show after counts
SELECT 'AFTER CLEANUP' as status;
SELECT COUNT(*) as flood_events_remaining FROM flood_event_logs;
SELECT COUNT(*) as hotspots_remaining FROM flood_hotspots;

COMMIT;
