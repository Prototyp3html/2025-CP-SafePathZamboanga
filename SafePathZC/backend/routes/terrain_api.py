"""
API endpoints for terrain database access
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import logging

from services.terrain_database import TerrainDatabaseService
from services.elevation_heatmap_service import get_elevation_heatmap_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/terrain", tags=["terrain"])

@router.get("/roads/area")
async def get_roads_in_area(
    min_lat: float = Query(..., description="Minimum latitude"),
    max_lat: float = Query(..., description="Maximum latitude"), 
    min_lon: float = Query(..., description="Minimum longitude"),
    max_lon: float = Query(..., description="Maximum longitude"),
    flood_risk_only: bool = Query(False, description="Only return flood-prone roads"),
    format: str = Query("json", description="Response format: 'json' or 'geojson'")
):
    """Get road segments within a geographic bounding box"""
    
    try:
        async with TerrainDatabaseService() as db:
            segments = await db.get_road_segments_in_area(
                min_lat, max_lat, min_lon, max_lon, flood_risk_only
            )
            
            if format.lower() == 'geojson':
                # Return as GeoJSON
                features = []
                for segment in segments:
                    feature = {
                        'type': 'Feature',
                        'properties': {
                            'osm_way_id': segment.osm_way_id,
                            'road_name': segment.road_name,
                            'highway_type': segment.highway_type,
                            'flood_risk_level': segment.flood_risk_level,
                            'flood_risk_score': segment.flood_risk_score,
                            'is_flood_prone': segment.is_flood_prone,
                            'avg_elevation': segment.avg_elevation,
                            'last_updated': segment.last_updated.isoformat() if segment.last_updated else None
                        },
                        'geometry': segment.geometry or {
                            'type': 'LineString',
                            'coordinates': [[segment.start_lon, segment.start_lat], [segment.end_lon, segment.end_lat]]
                        }
                    }
                    features.append(feature)
                
                return {
                    'type': 'FeatureCollection',
                    'features': features,
                    'metadata': {
                        'total_features': len(features),
                        'flood_risk_only': flood_risk_only,
                        'generated_at': datetime.utcnow().isoformat()
                    }
                }
            else:
                # Return as JSON array
                roads_data = []
                for segment in segments:
                    roads_data.append({
                        'id': segment.id,
                        'osm_way_id': segment.osm_way_id,
                        'road_name': segment.road_name,
                        'highway_type': segment.highway_type,
                        'coordinates': {
                            'start': {'lat': segment.start_lat, 'lon': segment.start_lon},
                            'end': {'lat': segment.end_lat, 'lon': segment.end_lon}
                        },
                        'elevation': {
                            'avg': segment.avg_elevation,
                            'min': segment.min_elevation,
                            'max': segment.max_elevation,
                            'variance': segment.elevation_variance
                        },
                        'flood_risk': {
                            'level': segment.flood_risk_level,
                            'score': segment.flood_risk_score,
                            'is_prone': segment.is_flood_prone
                        },
                        'weather': {
                            'rainfall_impact': segment.rainfall_impact,
                            'conditions': segment.weather_conditions
                        },
                        'last_updated': segment.last_updated.isoformat() if segment.last_updated else None
                    })
                
                return {
                    'roads': roads_data,
                    'total_count': len(roads_data),
                    'flood_risk_only': flood_risk_only,
                    'bounding_box': {
                        'min_lat': min_lat, 'max_lat': max_lat,
                        'min_lon': min_lon, 'max_lon': max_lon
                    }
                }
                
    except Exception as e:
        logger.error(f"Error fetching roads in area: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/roads/nearby")
async def get_roads_nearby(
    lat: float = Query(..., description="Center latitude"),
    lon: float = Query(..., description="Center longitude"),
    radius_km: float = Query(1.0, description="Search radius in kilometers"),
    limit: int = Query(50, description="Maximum number of results")
):
    """Get road segments near a specific location"""
    
    try:
        async with TerrainDatabaseService() as db:
            nearby_roads = await db.get_roads_near_location(lat, lon, radius_km)
            
            # Limit results
            nearby_roads = nearby_roads[:limit]
            
            roads_data = []
            for segment, distance in nearby_roads:
                roads_data.append({
                    'id': segment.id,
                    'osm_way_id': segment.osm_way_id,
                    'road_name': segment.road_name,
                    'highway_type': segment.highway_type,
                    'distance_km': round(distance, 3),
                    'coordinates': {
                        'start': {'lat': segment.start_lat, 'lon': segment.start_lon},
                        'end': {'lat': segment.end_lat, 'lon': segment.end_lon}
                    },
                    'flood_risk': {
                        'level': segment.flood_risk_level,
                        'score': segment.flood_risk_score,
                        'is_prone': segment.is_flood_prone
                    },
                    'elevation': segment.avg_elevation
                })
            
            return {
                'nearby_roads': roads_data,
                'center': {'lat': lat, 'lon': lon},
                'radius_km': radius_km,
                'total_found': len(roads_data)
            }
            
    except Exception as e:
        logger.error(f"Error fetching nearby roads: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/flood-zones")
async def get_flood_prone_roads(
    min_risk_level: str = Query("medium", description="Minimum risk level: low, medium, high"),
    format: str = Query("json", description="Response format: 'json' or 'geojson'")
):
    """Get all flood-prone roads above a certain risk level"""
    
    try:
        async with TerrainDatabaseService() as db:
            flood_roads = await db.get_flood_prone_roads(min_risk_level)
            
            if format.lower() == 'geojson':
                # Export as GeoJSON
                geojson = await db.export_to_geojson(
                    include_flood_data=True,
                    min_lat=6.85, max_lat=7.15,  # Zamboanga bounds
                    min_lon=121.95, max_lon=122.30
                )
                
                # Filter to only flood-prone roads
                flood_features = [
                    feature for feature in geojson['features']
                    if feature['properties'].get('is_flood_prone', False)
                ]
                
                return {
                    'type': 'FeatureCollection',
                    'features': flood_features,
                    'metadata': {
                        'total_features': len(flood_features),
                        'min_risk_level': min_risk_level,
                        'generated_at': datetime.utcnow().isoformat()
                    }
                }
            else:
                # Return as JSON
                flood_data = []
                for road in flood_roads:
                    flood_data.append({
                        'id': road.id,
                        'osm_way_id': road.osm_way_id,
                        'road_name': road.road_name,
                        'highway_type': road.highway_type,
                        'flood_risk': {
                            'level': road.flood_risk_level,
                            'score': road.flood_risk_score
                        },
                        'coordinates': {
                            'start': {'lat': road.start_lat, 'lon': road.start_lon},
                            'end': {'lat': road.end_lat, 'lon': road.end_lon}
                        },
                        'elevation': road.avg_elevation,
                        'last_updated': road.last_updated.isoformat() if road.last_updated else None
                    })
                
                return {
                    'flood_prone_roads': flood_data,
                    'min_risk_level': min_risk_level,
                    'total_count': len(flood_data)
                }
                
    except Exception as e:
        logger.error(f"Error fetching flood-prone roads: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export/geojson")
async def export_terrain_geojson(
    include_flood_data: bool = Query(True, description="Include flood risk data"),
    min_lat: Optional[float] = Query(None, description="Minimum latitude filter"),
    max_lat: Optional[float] = Query(None, description="Maximum latitude filter"),
    min_lon: Optional[float] = Query(None, description="Minimum longitude filter"),
    max_lon: Optional[float] = Query(None, description="Maximum longitude filter")
):
    """Export terrain road data as GeoJSON"""
    
    try:
        async with TerrainDatabaseService() as db:
            geojson = await db.export_to_geojson(
                include_flood_data=include_flood_data,
                min_lat=min_lat, max_lat=max_lat,
                min_lon=min_lon, max_lon=max_lon
            )
            return geojson
            
    except Exception as e:
        logger.error(f"Error exporting GeoJSON: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
async def get_terrain_statistics():
    """Get comprehensive statistics about terrain database"""
    
    try:
        async with TerrainDatabaseService() as db:
            stats = await db.get_data_statistics()
            return {
                'database_stats': stats,
                'generated_at': datetime.utcnow().isoformat()
            }
            
    except Exception as e:
        logger.error(f"Error fetching statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/flood-history")
async def get_flood_history(
    days: int = Query(30, description="Number of days to look back")
):
    """Get recent flood zone history"""
    
    try:
        async with TerrainDatabaseService() as db:
            history = await db.get_recent_flood_history(days)
            
            history_data = []
            for record in history:
                history_data.append({
                    'id': record.id,
                    'zone_name': record.zone_name,
                    'coordinates': {
                        'lat': record.latitude,
                        'lon': record.longitude
                    },
                    'flood_level': record.flood_level,
                    'recorded_at': record.recorded_at.isoformat(),
                    'rainfall_mm': record.rainfall_mm,
                    'water_depth_cm': record.water_depth_cm,
                    'data_source': record.data_source,
                    'confidence_score': record.confidence_score
                })
            
            return {
                'flood_history': history_data,
                'days_back': days,
                'total_records': len(history_data)
            }
            
    except Exception as e:
        logger.error(f"Error fetching flood history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update/manual")
async def trigger_manual_update():
    """Manually trigger terrain data update (admin only)"""
    
    try:
        from services.database_flood_updater import update_flood_data_database
        
        logger.info("🔄 Manual terrain update triggered via API")
        
        # Run update in background
        update_stats = await update_flood_data_database()
        
        return {
            'success': True,
            'message': 'Terrain data update completed',
            'statistics': update_stats,
            'updated_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Manual update failed: {e}")
        raise HTTPException(status_code=500, detail=f"Update failed: {str(e)}")

# Legacy endpoint for backward compatibility
@router.get("/terrain_roads.geojson")
async def get_legacy_geojson():
    """Legacy endpoint that returns GeoJSON in the old format"""
    
    try:
        async with TerrainDatabaseService() as db:
            geojson = await db.export_to_geojson(include_flood_data=True)
            return geojson
            
    except Exception as e:
        logger.error(f"Error in legacy GeoJSON endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/elevation_heatmap_grid")
async def get_elevation_heatmap_grid(sample_rate: int = Query(10, description="Pixel sampling rate (higher = less detailed but faster)")):
    """
    Get elevation data as [lat, lon, intensity] array for Leaflet.heat heatmap.
    Uses COP30 DEM (Digital Elevation Model) TIF file for full terrain coverage.
    
    Args:
        sample_rate: Sample every Nth pixel (higher = faster processing)
    
    Returns:
        JSON with heatmap_data array of [lat, lon, intensity] tuples
    """
    try:
        service = get_elevation_heatmap_service()
        heatmap_data = service.get_elevation_grid(sample_rate=sample_rate)
        
        if not heatmap_data:
            raise HTTPException(status_code=404, detail="No elevation data available")
        
        return {
            "type": "heatmap",
            "source": "COP30 DEM (Digital Elevation Model)",
            "point_count": len(heatmap_data),
            "heatmap_data": heatmap_data
        }
        
    except Exception as e:
        logger.error(f"Error generating elevation heatmap: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        logger.error(f"Error in legacy GeoJSON endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))