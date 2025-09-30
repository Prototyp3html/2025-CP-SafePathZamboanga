#!/usr/bin/env python3
"""
PostGIS Data Import Script for SafePath Zamboanga
Imports terrain_roads.geojson into PostGIS database with optimized spatial indexing
"""

import json
import psycopg2
import psycopg2.extras
from pathlib import Path
import logging
from typing import Dict, List, Optional, Any
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


def _parse_flood_flag(value: Any) -> bool:
    """Normalise flood flags stored as strings into a proper boolean."""

    if isinstance(value, bool):
        return value

    if value is None:
        return False

    if isinstance(value, (int, float)):
        return value != 0

    if isinstance(value, str):
        normalised = value.strip().lower()
        if normalised in {"1", "true", "t", "yes", "y"}:
            return True
        if normalised in {"0", "false", "f", "no", "n", ""}:
            return False

    return False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PostGISImporter:
    """Import GeoJSON terrain data into PostGIS database"""
    
    def __init__(self, db_config: Dict[str, str]):
        self.db_config = db_config
        self.conn = None
        self.cursor = None
        
    def connect(self) -> bool:
        """Connect to PostgreSQL database"""
        try:
            self.conn = psycopg2.connect(
                host=self.db_config['host'],
                database=self.db_config['database'],
                user=self.db_config['user'],
                password=self.db_config['password'],
                port=self.db_config.get('port', 5432)
            )
            self.cursor = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            logger.info("Connected to PostGIS database successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            return False
    
    def setup_database(self) -> bool:
        """Run initial database setup if needed"""
        try:
            # Check if PostGIS is installed
            self.cursor.execute("SELECT PostGIS_version();")
            version = self.cursor.fetchone()
            logger.info(f"PostGIS version: {version['postgis_version']}")
            
            # Check if roads table exists
            self.cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'roads'
                );
            """)
            
            table_exists = self.cursor.fetchone()['exists']
            if not table_exists:
                logger.warning("Roads table doesn't exist. Please run postgis_setup.sql first.")
                return False
                
            return True
        except Exception as e:
            logger.error(f"Database setup check failed: {e}")
            return False
    
    def clear_existing_data(self) -> bool:
        """Clear existing roads data"""
        try:
            self.cursor.execute("DELETE FROM roads;")
            self.cursor.execute("DELETE FROM roads_network;")
            self.cursor.execute("DELETE FROM roads_vertices_pgr;")
            
            # Reset sequences
            self.cursor.execute("ALTER SEQUENCE roads_id_seq RESTART WITH 1;")
            self.cursor.execute("ALTER SEQUENCE roads_vertices_pgr_id_seq RESTART WITH 1;")
            
            self.conn.commit()
            logger.info("Cleared existing roads data")
            return True
        except Exception as e:
            logger.error(f"Failed to clear existing data: {e}")
            self.conn.rollback()
            return False
    
    def import_geojson(self, geojson_path: str) -> bool:
        """Import GeoJSON data into PostGIS"""
        try:
            with open(geojson_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            features = data.get('features', [])
            logger.info(f"Importing {len(features)} road features from {geojson_path}")
            
            imported_count = 0
            batch_size = 100
            batch_data = []
            
            for feature in features:
                if feature['geometry']['type'] != 'LineString':
                    continue
                
                properties = feature['properties']
                geometry = feature['geometry']
                
                # Skip non-road features
                if not properties.get('highway') and properties.get('barrier'):
                    continue
                
                # Extract properties with defaults
                road_data = {
                    'road_id': properties.get('road_id', ''),
                    'osm_id': properties.get('osm_id', ''),
                    'name': properties.get('name'),
                    'highway_type': properties.get('highway'),
                    'elev_mean': float(properties.get('elev_mean') or 0.0),
                    'elev_min': float(properties.get('elev_min') or 0.0),
                    'elev_max': float(properties.get('elev_max') or 0.0),
                    'flood_status': _parse_flood_flag(properties.get('flooded')),
                    'length_m': float(properties.get('length_m') or 0.0),
                    'surface_type': self._extract_surface(properties.get('other_tags', '')),
                    'max_speed': self._extract_maxspeed(properties.get('other_tags', '')),
                    'oneway': self._extract_oneway(properties.get('other_tags', '')),
                    'coordinates': geometry['coordinates']
                }
                
                batch_data.append(road_data)
                
                if len(batch_data) >= batch_size:
                    imported_count += self._insert_batch(batch_data)
                    batch_data = []
            
            # Insert remaining data
            if batch_data:
                imported_count += self._insert_batch(batch_data)
            
            self.conn.commit()
            logger.info(f"Successfully imported {imported_count} road segments")
            return True
            
        except Exception as e:
            logger.error(f"Failed to import GeoJSON: {e}")
            self.conn.rollback()
            return False
    
    def _insert_batch(self, batch_data: List[Dict]) -> int:
        """Insert a batch of road data"""
        try:
            insert_query = """
                INSERT INTO roads (
                    road_id, osm_id, name, highway_type, geom,
                    elev_mean, elev_min, elev_max, flood_status, length_m,
                    surface_type, max_speed, oneway
                ) VALUES %s
            """
            
            values = []
            for road in batch_data:
                # Convert coordinates to PostGIS LINESTRING
                coords_str = ','.join([f"{coord[0]} {coord[1]}" for coord in road['coordinates']])
                linestring_wkt = f"LINESTRING({coords_str})"
                
                values.append((
                    road['road_id'],
                    road['osm_id'],
                    road['name'],
                    road['highway_type'],
                    linestring_wkt,
                    road['elev_mean'],
                    road['elev_min'],
                    road['elev_max'],
                    road['flood_status'],
                    road['length_m'],
                    road['surface_type'],
                    road['max_speed'],
                    road['oneway']
                ))
            
            # Use execute_values for efficient batch insert
            psycopg2.extras.execute_values(
                self.cursor,
                insert_query.replace('VALUES %s', 'VALUES %s'),
                values,
                template=None,
                page_size=100
            )
            
            return len(values)
            
        except Exception as e:
            logger.error(f"Failed to insert batch: {e}")
            return 0
    
    def _extract_surface(self, other_tags: str) -> str:
        """Extract surface type from other_tags"""
        if '"surface"=>' in other_tags:
            try:
                return other_tags.split('"surface"=>"')[1].split('"')[0]
            except IndexError:
                pass
        return 'unknown'
    
    def _extract_maxspeed(self, other_tags: str) -> int:
        """Extract max speed from other_tags"""
        if '"maxspeed"=>' in other_tags:
            try:
                maxspeed_str = other_tags.split('"maxspeed"=>"')[1].split('"')[0]
                return int(maxspeed_str)
            except (IndexError, ValueError):
                pass
        return 40
    
    def _extract_oneway(self, other_tags: str) -> bool:
        """Extract oneway status from other_tags"""
        return '"oneway"=>"yes"' in other_tags
    
    def build_routing_networks(self) -> bool:
        """Build routing networks for all transportation modes"""
        try:
            modes = ['car', 'motorcycle', 'walking']
            
            for mode in modes:
                logger.info(f"Building routing network for {mode}...")
                self.cursor.execute("SELECT build_routing_network(%s);", (mode,))
                
                # Check network size
                self.cursor.execute(
                    "SELECT COUNT(*) as count FROM roads_network WHERE mode = %s;", 
                    (mode,)
                )
                count = self.cursor.fetchone()['count']
                logger.info(f"Built {count} edges for {mode} routing network")
            
            self.conn.commit()
            logger.info("All routing networks built successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to build routing networks: {e}")
            self.conn.rollback()
            return False
    
    def create_indexes(self) -> bool:
        """Create additional performance indexes"""
        try:
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_roads_road_id ON roads(road_id);",
                "CREATE INDEX IF NOT EXISTS idx_roads_name ON roads(name);",
                "CREATE INDEX IF NOT EXISTS idx_roads_length ON roads(length_m);",
                "VACUUM ANALYZE roads;",
                "VACUUM ANALYZE roads_network;",
            ]
            
            for index_sql in indexes:
                logger.info(f"Creating index: {index_sql}")
                self.cursor.execute(index_sql)
            
            self.conn.commit()
            logger.info("Performance indexes created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create indexes: {e}")
            self.conn.rollback()
            return False
    
    def get_import_statistics(self) -> Dict:
        """Get statistics about imported data"""
        try:
            stats = {}
            
            # Basic counts
            self.cursor.execute("SELECT COUNT(*) as total_roads FROM roads;")
            stats['total_roads'] = self.cursor.fetchone()['total_roads']
            
            # Terrain statistics
            self.cursor.execute("""
                SELECT 
                    AVG(elev_mean) as avg_elevation,
                    MIN(elev_mean) as min_elevation,
                    MAX(elev_mean) as max_elevation,
                    COUNT(*) FILTER (WHERE flood_status = true) as flooded_segments,
                    AVG(slope_gradient) as avg_slope
                FROM roads;
            """)
            terrain_stats = self.cursor.fetchone()
            stats.update(terrain_stats)
            
            # Highway type distribution
            self.cursor.execute("""
                SELECT highway_type, COUNT(*) as count 
                FROM roads 
                WHERE highway_type IS NOT NULL 
                GROUP BY highway_type 
                ORDER BY count DESC;
            """)
            stats['highway_distribution'] = self.cursor.fetchall()
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            return {}
    
    def close(self):
        """Close database connection"""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Database connection closed")

def main():
    """Main import function"""
    # Database configuration
    db_config = {
        'host': os.getenv('POSTGRES_HOST', 'localhost'),
        'database': os.getenv('POSTGRES_DB', 'safepath_zamboanga'),
        'user': os.getenv('POSTGRES_USER', 'postgres'),
        'password': os.getenv('POSTGRES_PASSWORD', 'password'),
        'port': os.getenv('POSTGRES_PORT', '5432')
    }
    
    # GeoJSON file path
    geojson_path = Path(__file__).parent.parent / "data" / "terrain_roads.geojson"
    
    if not geojson_path.exists():
        logger.error(f"GeoJSON file not found: {geojson_path}")
        return False
    
    importer = PostGISImporter(db_config)
    
    try:
        # Connect to database
        if not importer.connect():
            return False
        
        # Setup database
        if not importer.setup_database():
            return False
        
        # Clear existing data
        logger.info("Clearing existing data...")
        if not importer.clear_existing_data():
            return False
        
        # Import GeoJSON data
        logger.info(f"Starting import from {geojson_path}")
        if not importer.import_geojson(str(geojson_path)):
            return False
        
        # Build routing networks
        if not importer.build_routing_networks():
            return False
        
        # Create performance indexes
        if not importer.create_indexes():
            return False
        
        # Show statistics
        stats = importer.get_import_statistics()
        logger.info("Import completed successfully!")
        logger.info(f"Statistics: {json.dumps(stats, indent=2, default=str)}")
        
        return True
        
    finally:
        importer.close()

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)