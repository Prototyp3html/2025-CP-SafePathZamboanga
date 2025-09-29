-- PostGIS Setup for SafePath Zamboanga Terrain-Aware Routing
-- Run this script to create the database schema with spatial capabilities

-- Create database (run as postgres superuser)
-- CREATE DATABASE safepath_zamboanga;

-- Connect to the database and enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Create enhanced roads table with terrain data
CREATE TABLE IF NOT EXISTS roads (
    id SERIAL PRIMARY KEY,
    road_id VARCHAR(100),
    osm_id VARCHAR(100),
    name VARCHAR(200),
    highway_type VARCHAR(50),
    geom GEOMETRY(LINESTRING, 4326),
    
    -- Terrain elevation data
    elev_mean FLOAT DEFAULT 0.0,
    elev_min FLOAT DEFAULT 0.0,
    elev_max FLOAT DEFAULT 0.0,
    slope_gradient FLOAT, -- Calculated: (elev_max - elev_min) / length * 100
    
    -- Flood risk data
    flood_status BOOLEAN DEFAULT FALSE,
    flood_risk_level VARCHAR(10) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH
    last_flood_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Road characteristics
    surface_type VARCHAR(50) DEFAULT 'unknown',
    max_speed INTEGER DEFAULT 40,
    oneway BOOLEAN DEFAULT FALSE,
    length_m FLOAT,
    
    -- Pre-calculated routing cost multipliers for different modes
    car_cost_multiplier FLOAT DEFAULT 1.0,
    motorcycle_cost_multiplier FLOAT DEFAULT 1.0,
    walking_cost_multiplier FLOAT DEFAULT 1.0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial indexes for high-performance queries
CREATE INDEX IF NOT EXISTS idx_roads_geom ON roads USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_roads_elevation ON roads(elev_mean);
CREATE INDEX IF NOT EXISTS idx_roads_flood ON roads(flood_status, flood_risk_level);
CREATE INDEX IF NOT EXISTS idx_roads_highway ON roads(highway_type);
CREATE INDEX IF NOT EXISTS idx_roads_slope ON roads(slope_gradient);

-- Create function to calculate slope gradient
CREATE OR REPLACE FUNCTION calculate_slope_gradient(elev_min FLOAT, elev_max FLOAT, length_m FLOAT)
RETURNS FLOAT AS $$
BEGIN
    IF length_m > 0 THEN
        RETURN ABS(elev_max - elev_min) / length_m * 100;
    ELSE
        RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to update routing cost multipliers based on terrain
CREATE OR REPLACE FUNCTION update_routing_costs()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate slope gradient
    NEW.slope_gradient := calculate_slope_gradient(NEW.elev_min, NEW.elev_max, NEW.length_m);
    
    -- Calculate car cost multiplier
    NEW.car_cost_multiplier := 1.0;
    IF NEW.flood_status THEN
        NEW.car_cost_multiplier := NEW.car_cost_multiplier * 4.0; -- Heavy penalty for cars in floods
    END IF;
    IF NEW.slope_gradient > 8 THEN
        NEW.car_cost_multiplier := NEW.car_cost_multiplier * (1.0 + NEW.slope_gradient / 100);
    END IF;
    
    -- Calculate motorcycle cost multiplier (less affected by hills)
    NEW.motorcycle_cost_multiplier := 1.0;
    IF NEW.flood_status THEN
        NEW.motorcycle_cost_multiplier := NEW.motorcycle_cost_multiplier * 2.5; -- Moderate flood penalty
    END IF;
    IF NEW.slope_gradient > 12 THEN
        NEW.motorcycle_cost_multiplier := NEW.motorcycle_cost_multiplier * (1.0 + NEW.slope_gradient / 200);
    END IF;
    
    -- Calculate walking cost multiplier (least affected by terrain)
    NEW.walking_cost_multiplier := 1.0;
    IF NEW.flood_status THEN
        NEW.walking_cost_multiplier := NEW.walking_cost_multiplier * 1.5; -- Minimal flood penalty
    END IF;
    IF NEW.slope_gradient > 15 THEN
        NEW.walking_cost_multiplier := NEW.walking_cost_multiplier * (1.0 + NEW.slope_gradient / 300);
    END IF;
    
    -- Update timestamp
    NEW.updated_at := CURRENT_TIMESTAMP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update routing costs
CREATE TRIGGER trigger_update_routing_costs
    BEFORE INSERT OR UPDATE ON roads
    FOR EACH ROW
    EXECUTE FUNCTION update_routing_costs();

-- Create table for road network topology (required for pgRouting)
CREATE TABLE IF NOT EXISTS roads_vertices_pgr (
    id SERIAL PRIMARY KEY,
    the_geom GEOMETRY(POINT, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create table for road network edges (required for pgRouting)
CREATE TABLE IF NOT EXISTS roads_network (
    id INTEGER PRIMARY KEY,
    source INTEGER,
    target INTEGER,
    cost FLOAT,
    reverse_cost FLOAT,
    the_geom GEOMETRY(LINESTRING, 4326),
    road_id VARCHAR(100),
    mode VARCHAR(20) DEFAULT 'car' -- car, motorcycle, walking
);

-- Create indexes for pgRouting performance
CREATE INDEX IF NOT EXISTS idx_roads_network_source ON roads_network(source);
CREATE INDEX IF NOT EXISTS idx_roads_network_target ON roads_network(target);
CREATE INDEX IF NOT EXISTS idx_roads_network_geom ON roads_network USING GIST(the_geom);

-- Create function to build routing network for specific transportation mode
CREATE OR REPLACE FUNCTION build_routing_network(transport_mode VARCHAR DEFAULT 'car')
RETURNS VOID AS $$
DECLARE
    cost_column VARCHAR;
BEGIN
    -- Determine which cost multiplier to use
    CASE transport_mode
        WHEN 'car' THEN cost_column := 'car_cost_multiplier';
        WHEN 'motorcycle' THEN cost_column := 'motorcycle_cost_multiplier';
        WHEN 'walking' THEN cost_column := 'walking_cost_multiplier';
        ELSE cost_column := 'car_cost_multiplier';
    END CASE;
    
    -- Clear existing network for this mode
    DELETE FROM roads_network WHERE mode = transport_mode;
    
    -- Build new network
    EXECUTE format('
        INSERT INTO roads_network (id, source, target, cost, reverse_cost, the_geom, road_id, mode)
        SELECT 
            CASE 
                WHEN %L = ''car'' THEN r.id
                WHEN %L = ''motorcycle'' THEN r.id + 100000
                WHEN %L = ''walking'' THEN r.id + 200000
                ELSE r.id + 300000
            END as id,
            r.id * 2 as source,
            r.id * 2 + 1 as target,
            ST_Length(r.geom::geography) * r.%I as cost,
            CASE WHEN r.oneway THEN -1 ELSE ST_Length(r.geom::geography) * r.%I END as reverse_cost,
            r.geom,
            r.road_id,
            %L
        FROM roads r
        WHERE r.geom IS NOT NULL
    ', transport_mode, transport_mode, transport_mode, cost_column, cost_column, transport_mode);
    
    RAISE NOTICE 'Built routing network for % with % edges', transport_mode, 
                 (SELECT count(*) FROM roads_network WHERE mode = transport_mode);
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for fast route statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS route_statistics AS
SELECT 
    highway_type,
    COUNT(*) as segment_count,
    AVG(elev_mean) as avg_elevation,
    AVG(slope_gradient) as avg_slope,
    COUNT(*) FILTER (WHERE flood_status = true) as flood_segments,
    AVG(car_cost_multiplier) as avg_car_cost,
    AVG(motorcycle_cost_multiplier) as avg_motorcycle_cost,
    AVG(walking_cost_multiplier) as avg_walking_cost,
    SUM(length_m) as total_length_m
FROM roads
GROUP BY highway_type;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_route_stats_highway ON route_statistics(highway_type);

-- Create function to refresh route statistics
CREATE OR REPLACE FUNCTION refresh_route_statistics()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW route_statistics;
END;
$$ LANGUAGE plpgsql;

-- Create function to find nearest road point with distance limit
CREATE OR REPLACE FUNCTION find_nearest_road(
    target_lat FLOAT,
    target_lng FLOAT,
    max_distance_m FLOAT DEFAULT 2000
)
RETURNS TABLE(
    road_id INTEGER,
    distance_m FLOAT,
    point_geom GEOMETRY
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        ST_Distance(r.geom::geography, ST_Point(target_lng, target_lat)::geography) as dist,
        ST_ClosestPoint(r.geom, ST_Point(target_lng, target_lat)) as closest_point
    FROM roads r
    WHERE ST_DWithin(r.geom::geography, ST_Point(target_lng, target_lat)::geography, max_distance_m)
    ORDER BY r.geom <-> ST_Point(target_lng, target_lat)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (adjust username as needed)
-- GRANT ALL PRIVILEGES ON DATABASE safepath_zamboanga TO safepath_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO safepath_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO safepath_user;

-- Sample query to test setup
-- SELECT 'PostGIS setup complete. Database ready for terrain-aware routing!' as status;