"""
Database service for terrain and flood data operations
"""
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc
from geopy.distance import geodesic

# Direct imports to avoid circular import issues
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from datetime import datetime

# Get database config from environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./safepath.db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Import terrain models - we'll define them here to avoid import issues
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.dialects.postgresql import JSON

Base = declarative_base()

# Define models directly here to avoid import conflicts
class TerrainRoadSegment(Base):
    __tablename__ = 'terrain_road_segments'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    osm_way_id = Column(String(50), unique=True, index=True)
    road_name = Column(String(200))
    highway_type = Column(String(50))
    geometry = Column(JSON)
    start_lat = Column(Float, nullable=False)
    start_lon = Column(Float, nullable=False)
    end_lat = Column(Float, nullable=False)
    end_lon = Column(Float, nullable=False)
    avg_elevation = Column(Float)
    min_elevation = Column(Float)
    max_elevation = Column(Float)
    elevation_variance = Column(Float)
    flood_risk_level = Column(String(20))
    flood_risk_score = Column(Float)
    is_flood_prone = Column(Boolean, default=False)
    rainfall_impact = Column(Float)
    weather_conditions = Column(String(100))
    last_updated = Column(DateTime, default=datetime.utcnow)
    data_sources = Column(JSON)

class FloodZoneHistory(Base):
    __tablename__ = 'flood_zone_history'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    zone_name = Column(String(200))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    flood_level = Column(String(20))
    recorded_at = Column(DateTime, default=datetime.utcnow)
    rainfall_mm = Column(Float)
    water_depth_cm = Column(Float)
    data_source = Column(String(100))
    confidence_score = Column(Float)

class TerrainDataUpdate(Base):
    __tablename__ = 'terrain_data_updates'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    update_started = Column(DateTime, default=datetime.utcnow)
    update_completed = Column(DateTime)
    status = Column(String(20))
    roads_processed = Column(Integer, default=0)
    roads_updated = Column(Integer, default=0)
    roads_added = Column(Integer, default=0)
    osm_requests = Column(Integer, default=0)
    elevation_requests = Column(Integer, default=0)
    weather_requests = Column(Integer, default=0)
    error_message = Column(Text)
    success_rate = Column(Float)
    execution_time_seconds = Column(Float)

logger = logging.getLogger(__name__)

class TerrainDatabaseService:
    """Service for managing terrain data in PostgreSQL database"""
    
    def __init__(self):
        self.session: Optional[Session] = None
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = SessionLocal()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            if exc_type:
                self.session.rollback()
            else:
                self.session.commit()
            self.session.close()
    
    # =============================
    # TERRAIN ROAD SEGMENTS
    # =============================
    
    async def store_road_segments(self, segments: List[Dict[str, Any]]) -> int:
        """
        Store or update multiple road segments with terrain data
        
        Args:
            segments: List of road segment dictionaries with terrain data
            
        Returns:
            Number of segments processed
        """
        processed = 0
        
        for segment_data in segments:
            try:
                # Check if segment already exists
                existing = self.session.query(TerrainRoadSegment).filter_by(
                    osm_way_id=segment_data.get('osm_way_id')
                ).first()
                
                if existing:
                    # Update existing segment
                    for key, value in segment_data.items():
                        if hasattr(existing, key):
                            setattr(existing, key, value)
                    existing.last_updated = datetime.utcnow()
                else:
                    # Create new segment
                    segment = TerrainRoadSegment(**segment_data)
                    self.session.add(segment)
                
                processed += 1
                
            except Exception as e:
                logger.error(f"Error storing road segment {segment_data.get('osm_way_id', 'unknown')}: {e}")
        
        try:
            self.session.commit()
            logger.info(f"✅ Stored {processed} road segments to database")
        except Exception as e:
            self.session.rollback()
            logger.error(f"❌ Failed to commit road segments: {e}")
            raise
        
        return processed
    
    async def get_road_segments_in_area(
        self, 
        min_lat: float, 
        max_lat: float, 
        min_lon: float, 
        max_lon: float,
        flood_risk_only: bool = False
    ) -> List[TerrainRoadSegment]:
        """
        Get road segments within a geographic bounding box
        
        Args:
            min_lat, max_lat, min_lon, max_lon: Bounding box coordinates
            flood_risk_only: If True, only return flood-prone segments
        
        Returns:
            List of TerrainRoadSegment objects
        """
        query = self.session.query(TerrainRoadSegment).filter(
            and_(
                TerrainRoadSegment.start_lat >= min_lat,
                TerrainRoadSegment.start_lat <= max_lat,
                TerrainRoadSegment.start_lon >= min_lon,
                TerrainRoadSegment.start_lon <= max_lon
            )
        )
        
        if flood_risk_only:
            query = query.filter(TerrainRoadSegment.is_flood_prone == True)
        
        return query.all()
    
    async def get_roads_near_location(
        self, 
        lat: float, 
        lon: float, 
        radius_km: float = 1.0
    ) -> List[Tuple[TerrainRoadSegment, float]]:
        """
        Get road segments near a specific location with distances
        
        Args:
            lat, lon: Center coordinates
            radius_km: Search radius in kilometers
            
        Returns:
            List of (segment, distance_km) tuples
        """
        # Approximate bounding box (1 degree ≈ 111km)
        degree_radius = radius_km / 111.0
        
        segments = await self.get_road_segments_in_area(
            lat - degree_radius,
            lat + degree_radius,
            lon - degree_radius,
            lon + degree_radius
        )
        
        # Calculate actual distances and filter
        nearby_segments = []
        for segment in segments:
            # Calculate distance to segment start point
            distance = geodesic((lat, lon), (segment.start_lat, segment.start_lon)).kilometers
            
            if distance <= radius_km:
                nearby_segments.append((segment, distance))
        
        # Sort by distance
        nearby_segments.sort(key=lambda x: x[1])
        return nearby_segments
    
    async def get_flood_prone_roads(self, min_risk_level: str = 'medium') -> List[TerrainRoadSegment]:
        """
        Get all flood-prone roads above a certain risk level
        
        Args:
            min_risk_level: 'low', 'medium', or 'high'
            
        Returns:
            List of flood-prone road segments
        """
        risk_order = {'low': 1, 'medium': 2, 'high': 3}
        min_level = risk_order.get(min_risk_level, 2)
        
        return self.session.query(TerrainRoadSegment).filter(
            and_(
                TerrainRoadSegment.is_flood_prone == True,
                func.case(
                    (TerrainRoadSegment.flood_risk_level == 'low', 1),
                    (TerrainRoadSegment.flood_risk_level == 'medium', 2),
                    (TerrainRoadSegment.flood_risk_level == 'high', 3),
                    else_=0
                ) >= min_level
            )
        ).all()
    
    # =============================
    # FLOOD ZONE HISTORY
    # =============================
    
    async def record_flood_data(
        self, 
        zone_name: str, 
        lat: float, 
        lon: float, 
        flood_level: str,
        rainfall_mm: Optional[float] = None,
        water_depth_cm: Optional[float] = None,
        data_source: str = 'api'
    ) -> FloodZoneHistory:
        """Record historical flood data"""
        
        flood_record = FloodZoneHistory(
            zone_name=zone_name,
            latitude=lat,
            longitude=lon,
            flood_level=flood_level,
            rainfall_mm=rainfall_mm,
            water_depth_cm=water_depth_cm,
            data_source=data_source,
            confidence_score=0.8  # Default confidence
        )
        
        self.session.add(flood_record)
        self.session.commit()
        
        logger.info(f"📊 Recorded flood data: {zone_name} - {flood_level} risk")
        return flood_record
    
    async def get_recent_flood_history(
        self, 
        days: int = 30
    ) -> List[FloodZoneHistory]:
        """Get flood records from the last N days"""
        
        since_date = datetime.utcnow() - timedelta(days=days)
        
        return self.session.query(FloodZoneHistory).filter(
            FloodZoneHistory.recorded_at >= since_date
        ).order_by(desc(FloodZoneHistory.recorded_at)).all()
    
    # =============================
    # DATA UPDATE TRACKING
    # =============================
    
    async def start_update_session(self) -> TerrainDataUpdate:
        """Start a new terrain data update session"""
        
        update_session = TerrainDataUpdate(
            status='running'
        )
        
        self.session.add(update_session)
        self.session.commit()
        
        logger.info(f"🚀 Started terrain update session #{update_session.id}")
        return update_session
    
    async def complete_update_session(
        self, 
        session_id: int, 
        stats: Dict[str, Any]
    ) -> None:
        """Complete a terrain data update session with statistics"""
        
        update_session = self.session.query(TerrainDataUpdate).get(session_id)
        if not update_session:
            logger.error(f"❌ Update session {session_id} not found")
            return
        
        # Update session with final statistics
        update_session.update_completed = datetime.utcnow()
        update_session.status = stats.get('status', 'completed')
        update_session.roads_processed = stats.get('roads_processed', 0)
        update_session.roads_updated = stats.get('roads_updated', 0)
        update_session.roads_added = stats.get('roads_added', 0)
        update_session.osm_requests = stats.get('osm_requests', 0)
        update_session.elevation_requests = stats.get('elevation_requests', 0)
        update_session.weather_requests = stats.get('weather_requests', 0)
        update_session.error_message = stats.get('error_message')
        update_session.success_rate = stats.get('success_rate', 0.0)
        
        # Calculate execution time
        if update_session.update_started:
            execution_time = (update_session.update_completed - update_session.update_started).total_seconds()
            update_session.execution_time_seconds = execution_time
        
        self.session.commit()
        
        logger.info(f"✅ Completed terrain update session #{session_id}")
        logger.info(f"   📊 Processed: {update_session.roads_processed} roads")
        logger.info(f"   ⏱️  Duration: {update_session.execution_time_seconds:.1f}s")
        logger.info(f"   📈 Success Rate: {update_session.success_rate:.1f}%")
    
    # =============================
    # GEOJSON EXPORT
    # =============================
    
    async def export_to_geojson(
        self, 
        include_flood_data: bool = True,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Export terrain road data as GeoJSON format
        
        Args:
            include_flood_data: Include flood risk properties
            min_lat, max_lat, min_lon, max_lon: Optional bounding box
            
        Returns:
            GeoJSON FeatureCollection dictionary
        """
        
        # Build query
        query = self.session.query(TerrainRoadSegment)
        
        if all(coord is not None for coord in [min_lat, max_lat, min_lon, max_lon]):
            query = query.filter(
                and_(
                    TerrainRoadSegment.start_lat >= min_lat,
                    TerrainRoadSegment.start_lat <= max_lat,
                    TerrainRoadSegment.start_lon >= min_lon,
                    TerrainRoadSegment.start_lon <= max_lon
                )
            )
        
        segments = query.all()
        
        # Build GeoJSON features
        features = []
        for segment in segments:
            properties = {
                'osm_way_id': segment.osm_way_id,
                'road_name': segment.road_name,
                'highway_type': segment.highway_type,
                'avg_elevation': segment.avg_elevation,
                'last_updated': segment.last_updated.isoformat() if segment.last_updated else None
            }
            
            if include_flood_data:
                properties.update({
                    'flood_risk_level': segment.flood_risk_level,
                    'flood_risk_score': segment.flood_risk_score,
                    'is_flood_prone': segment.is_flood_prone,
                    'rainfall_impact': segment.rainfall_impact,
                    'weather_conditions': segment.weather_conditions
                })
            
            feature = {
                'type': 'Feature',
                'properties': properties,
                'geometry': segment.geometry or {
                    'type': 'LineString',
                    'coordinates': [[segment.start_lon, segment.start_lat], [segment.end_lon, segment.end_lat]]
                }
            }
            
            features.append(feature)
        
        geojson = {
            'type': 'FeatureCollection',
            'features': features,
            'metadata': {
                'generated_at': datetime.utcnow().isoformat(),
                'total_features': len(features),
                'source': 'SafePath Database'
            }
        }
        
        logger.info(f"📋 Exported {len(features)} road segments to GeoJSON")
        return geojson
    
    # =============================
    # STATISTICS & MONITORING
    # =============================
    
    async def get_data_statistics(self) -> Dict[str, Any]:
        """Get comprehensive statistics about stored terrain data"""
        
        total_roads = self.session.query(TerrainRoadSegment).count()
        flood_prone_roads = self.session.query(TerrainRoadSegment).filter(
            TerrainRoadSegment.is_flood_prone == True
        ).count()
        
        # Risk level breakdown
        risk_stats = self.session.query(
            TerrainRoadSegment.flood_risk_level,
            func.count(TerrainRoadSegment.id)
        ).group_by(TerrainRoadSegment.flood_risk_level).all()
        
        # Recent updates
        recent_updates = self.session.query(TerrainDataUpdate).filter(
            TerrainDataUpdate.update_started >= datetime.utcnow() - timedelta(days=7)
        ).count()
        
        # Last successful update
        last_update = self.session.query(TerrainDataUpdate).filter(
            TerrainDataUpdate.status == 'completed'
        ).order_by(desc(TerrainDataUpdate.update_completed)).first()
        
        return {
            'total_road_segments': total_roads,
            'flood_prone_roads': flood_prone_roads,
            'flood_prone_percentage': (flood_prone_roads / total_roads * 100) if total_roads > 0 else 0,
            'risk_level_breakdown': {risk: count for risk, count in risk_stats},
            'recent_updates_count': recent_updates,
            'last_successful_update': last_update.update_completed.isoformat() if last_update else None,
            'data_freshness_hours': (
                (datetime.utcnow() - last_update.update_completed).total_seconds() / 3600
            ) if last_update else None
        }