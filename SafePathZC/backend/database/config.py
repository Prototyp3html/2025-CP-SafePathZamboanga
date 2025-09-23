"""
Database configuration and connection management for PostGIS routing
Provides connection pooling, health monitoring, and configuration management
"""

import os
import logging
from typing import Dict, Optional
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv
import time

load_dotenv()

logger = logging.getLogger(__name__)

class DatabaseConfig:
    """PostGIS database configuration manager"""
    
    def __init__(self):
        self.host = os.getenv('POSTGRES_HOST', 'localhost')
        self.port = int(os.getenv('POSTGRES_PORT', '5432'))
        self.database = os.getenv('POSTGRES_DB', 'safepath_zamboanga')
        self.user = os.getenv('POSTGRES_USER', 'postgres')
        self.password = os.getenv('POSTGRES_PASSWORD', 'password')
        
        # Connection pool settings
        self.min_connections = int(os.getenv('POSTGRES_MIN_CONNECTIONS', '5'))
        self.max_connections = int(os.getenv('POSTGRES_MAX_CONNECTIONS', '20'))
        self.connection_timeout = int(os.getenv('POSTGRES_CONNECTION_TIMEOUT', '30'))
        
        # Performance settings
        self.statement_timeout = int(os.getenv('POSTGRES_STATEMENT_TIMEOUT', '30000'))
        self.query_timeout = int(os.getenv('POSTGRES_QUERY_TIMEOUT', '10000'))
        
        # Routing settings
        self.max_distance_km = float(os.getenv('ROUTING_MAX_DISTANCE_KM', '50'))
        self.default_mode = os.getenv('ROUTING_DEFAULT_MODE', 'car')
        self.enable_alternatives = os.getenv('ROUTING_ENABLE_ALTERNATIVES', 'true').lower() == 'true'
        self.cache_ttl = int(os.getenv('ROUTING_CACHE_TTL_SECONDS', '300'))
        
        # Terrain settings
        self.steep_gradient_threshold = float(os.getenv('TERRAIN_STEEP_GRADIENT_THRESHOLD', '8.0'))
        self.flood_penalty_multiplier = float(os.getenv('TERRAIN_FLOOD_PENALTY_MULTIPLIER', '3.0'))
        self.elevation_weight = float(os.getenv('TERRAIN_ELEVATION_WEIGHT', '0.1'))
        
        # Feature flags
        self.enable_postgis_routing = os.getenv('ENABLE_POSTGIS_ROUTING', 'true').lower() == 'true'
        self.enable_route_caching = os.getenv('ENABLE_ROUTE_CACHING', 'true').lower() == 'true'
        self.enable_performance_monitoring = os.getenv('ENABLE_PERFORMANCE_MONITORING', 'true').lower() == 'true'
        
        # Logging settings
        self.log_queries = os.getenv('LOG_POSTGIS_QUERIES', 'false').lower() == 'true'
        self.log_route_calculations = os.getenv('LOG_ROUTE_CALCULATIONS', 'true').lower() == 'true'
    
    def get_connection_string(self) -> str:
        """Get PostgreSQL connection string"""
        return f"host={self.host} port={self.port} dbname={self.database} user={self.user} password={self.password}"
    
    def get_connection_params(self) -> Dict[str, str]:
        """Get connection parameters as dictionary"""
        return {
            'host': self.host,
            'port': self.port,
            'database': self.database,
            'user': self.user,
            'password': self.password
        }

class DatabaseManager:
    """PostGIS database connection manager with pooling"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.connection_pool = None
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool"""
        try:
            self.connection_pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=self.config.min_connections,
                maxconn=self.config.max_connections,
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.user,
                password=self.config.password,
                connect_timeout=self.config.connection_timeout
            )
            logger.info(f"Initialized PostGIS connection pool: {self.config.min_connections}-{self.config.max_connections} connections")
        except Exception as e:
            logger.error(f"Failed to initialize connection pool: {e}")
            self.connection_pool = None
    
    def get_connection(self):
        """Get connection from pool"""
        if not self.connection_pool:
            raise Exception("Connection pool not initialized")
        
        try:
            return self.connection_pool.getconn()
        except Exception as e:
            logger.error(f"Failed to get connection from pool: {e}")
            raise
    
    def return_connection(self, conn):
        """Return connection to pool"""
        if self.connection_pool and conn:
            try:
                self.connection_pool.putconn(conn)
            except Exception as e:
                logger.error(f"Failed to return connection to pool: {e}")
    
    def close_all_connections(self):
        """Close all connections in pool"""
        if self.connection_pool:
            try:
                self.connection_pool.closeall()
                logger.info("Closed all database connections")
            except Exception as e:
                logger.error(f"Failed to close connections: {e}")
    
    def get_pool_status(self) -> Dict:
        """Get connection pool status"""
        if not self.connection_pool:
            return {"status": "unavailable"}
        
        try:
            # Note: These are internal attributes, may not be available in all psycopg2 versions
            return {
                "status": "active",
                "min_connections": self.config.min_connections,
                "max_connections": self.config.max_connections,
                "pool_type": "ThreadedConnectionPool"
            }
        except Exception as e:
            logger.warning(f"Could not get detailed pool status: {e}")
            return {"status": "active", "details": "unavailable"}

class DatabaseHealthChecker:
    """Database health monitoring and diagnostics"""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
    
    def check_connection(self) -> Dict:
        """Check basic database connectivity"""
        try:
            start_time = time.time()
            conn = self.db_manager.get_connection()
            
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1;")
                result = cursor.fetchone()
            
            self.db_manager.return_connection(conn)
            
            connection_time = (time.time() - start_time) * 1000
            
            return {
                "status": "healthy",
                "connection_time_ms": connection_time,
                "result": result[0] if result else None
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }
    
    def check_postgis(self) -> Dict:
        """Check PostGIS extension availability"""
        try:
            conn = self.db_manager.get_connection()
            
            with conn.cursor() as cursor:
                cursor.execute("SELECT PostGIS_version();")
                version = cursor.fetchone()
                
                cursor.execute("SELECT ST_Point(0, 0);")
                cursor.fetchone()
            
            self.db_manager.return_connection(conn)
            
            return {
                "status": "healthy",
                "postgis_version": version[0] if version else None
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }
    
    def check_routing_tables(self) -> Dict:
        """Check routing table availability and data"""
        try:
            conn = self.db_manager.get_connection()
            
            with conn.cursor() as cursor:
                # Check roads table
                cursor.execute("SELECT COUNT(*) FROM roads;")
                roads_count = cursor.fetchone()[0]
                
                # Check routing networks
                cursor.execute("SELECT mode, COUNT(*) FROM roads_network GROUP BY mode;")
                network_counts = dict(cursor.fetchall())
                
                # Check spatial indexes
                cursor.execute("""
                    SELECT schemaname, tablename, indexname 
                    FROM pg_indexes 
                    WHERE tablename IN ('roads', 'roads_network') 
                    AND indexname LIKE '%gist%';
                """)
                spatial_indexes = cursor.fetchall()
            
            self.db_manager.return_connection(conn)
            
            return {
                "status": "healthy",
                "roads_count": roads_count,
                "network_counts": network_counts,
                "spatial_indexes": len(spatial_indexes)
            }
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e)
            }
    
    def get_comprehensive_health(self) -> Dict:
        """Get comprehensive health status"""
        health_report = {
            "timestamp": time.time(),
            "overall_status": "healthy"
        }
        
        # Check individual components
        connection_health = self.check_connection()
        postgis_health = self.check_postgis()
        routing_health = self.check_routing_tables()
        pool_status = self.db_manager.get_pool_status()
        
        health_report["components"] = {
            "database_connection": connection_health,
            "postgis_extension": postgis_health,
            "routing_tables": routing_health,
            "connection_pool": pool_status
        }
        
        # Determine overall status
        component_statuses = [
            connection_health.get("status"),
            postgis_health.get("status"),
            routing_health.get("status")
        ]
        
        if "unhealthy" in component_statuses:
            health_report["overall_status"] = "unhealthy"
        elif "degraded" in component_statuses:
            health_report["overall_status"] = "degraded"
        
        return health_report

# Global instances
_db_config = None
_db_manager = None
_health_checker = None

def get_database_config() -> DatabaseConfig:
    """Get global database configuration"""
    global _db_config
    if _db_config is None:
        _db_config = DatabaseConfig()
    return _db_config

def get_database_manager() -> DatabaseManager:
    """Get global database manager"""
    global _db_manager
    if _db_manager is None:
        config = get_database_config()
        _db_manager = DatabaseManager(config)
    return _db_manager

def get_health_checker() -> DatabaseHealthChecker:
    """Get global health checker"""
    global _health_checker
    if _health_checker is None:
        db_manager = get_database_manager()
        _health_checker = DatabaseHealthChecker(db_manager)
    return _health_checker

def initialize_database():
    """Initialize database connections and perform health checks"""
    try:
        config = get_database_config()
        
        if not config.enable_postgis_routing:
            logger.info("PostGIS routing disabled by configuration")
            return False
        
        db_manager = get_database_manager()
        health_checker = get_health_checker()
        
        # Perform initial health check
        health_report = health_checker.get_comprehensive_health()
        
        if health_report["overall_status"] == "healthy":
            logger.info("PostGIS database initialized successfully")
            return True
        else:
            logger.error(f"PostGIS database health check failed: {health_report}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to initialize PostGIS database: {e}")
        return False

def cleanup_database():
    """Cleanup database connections on shutdown"""
    global _db_manager
    if _db_manager:
        _db_manager.close_all_connections()
        _db_manager = None
        logger.info("PostGIS database connections cleaned up")