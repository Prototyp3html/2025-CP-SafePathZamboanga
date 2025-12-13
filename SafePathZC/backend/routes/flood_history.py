"""
Flood History API Endpoints
Provides access to flood event logs, hotspots, and historical data
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging

from models import get_db, FloodEventLog, FloodHotspot, FloodStatistics

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/flood-history", tags=["flood-history"])


@router.get("/hotspots")
def get_flood_hotspots(
    limit: int = Query(20, ge=1, le=100),
    min_risk_score: float = Query(0, ge=0, le=100),
    db: Session = Depends(get_db)
):
    """
    Get flood hotspots - roads that flood repeatedly
    
    Query Parameters:
    - limit: Maximum number of hotspots to return (1-100)
    - min_risk_score: Minimum risk score filter (0-100)
    
    Returns:
        List of flood hotspots sorted by risk score
    """
    try:
        hotspots = db.query(FloodHotspot).filter(
            FloodHotspot.total_flood_events > 0,
            FloodHotspot.flood_risk_score >= min_risk_score
        ).order_by(FloodHotspot.flood_risk_score.desc()).limit(limit).all()
        
        result = []
        for hotspot in hotspots:
            result.append({
                'road_id': hotspot.road_id,
                'road_name': hotspot.road_name,
                'location': {
                    'lat': hotspot.location_lat,
                    'lon': hotspot.location_lon
                },
                'flood_history': {
                    'total_events': hotspot.total_flood_events,
                    'total_flooded_hours': round(hotspot.total_flooded_hours, 2),
                    'average_duration_hours': round(hotspot.average_flood_duration_hours, 2),
                    'frequency_per_year': round(hotspot.frequency_per_year, 2)
                },
                'risk_score': round(hotspot.flood_risk_score, 2),
                'last_flood': {
                    'start': hotspot.last_flood_start.isoformat() if hotspot.last_flood_start else None,
                    'end': hotspot.last_flood_end.isoformat() if hotspot.last_flood_end else None,
                    'days_since': hotspot.days_since_last_flood
                },
                'first_recorded': hotspot.first_flood_recorded.isoformat() if hotspot.first_flood_recorded else None
            })
        
        return {
            'status': 'success',
            'count': len(result),
            'hotspots': result
        }
    except Exception as e:
        logger.error(f"Error retrieving flood hotspots: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve flood hotspots")


@router.get("/events")
def get_flood_events(
    road_id: str = Query(None, description="Optional specific road ID to filter"),
    days_back: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum events to return"),
    db: Session = Depends(get_db)
):
    """
    Get flood events history
    
    Query Parameters:
    - road_id: Optional specific road to query (OSM way ID)
    - days_back: Number of days to look back (1-365)
    - limit: Maximum events to return (1-1000)
    
    Returns:
        List of flood events with timestamps and details
    """
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        query = db.query(FloodEventLog).filter(
            FloodEventLog.event_time >= cutoff_date
        )
        
        if road_id:
            query = query.filter(FloodEventLog.road_id == road_id)
        
        events = query.order_by(FloodEventLog.event_time.desc()).limit(limit).all()
        
        result = []
        for event in events:
            result.append({
                'event_id': event.id,
                'road_id': event.road_id,
                'road_name': event.road_name,
                'event_type': event.event_type,  # 'flood_start' or 'flood_end'
                'event_time': event.event_time.isoformat(),
                'flood_level': event.flood_level,
                'environmental_data': {
                    'rainfall_mm': event.rainfall_mm,
                    'elevation_m': event.elevation_m,
                    'distance_to_water_m': event.distance_to_water_m
                },
                'location': {
                    'lat': event.location_lat,
                    'lon': event.location_lon
                }
            })
        
        return {
            'status': 'success',
            'count': len(result),
            'period_days': days_back,
            'start_date': cutoff_date.isoformat(),
            'events': result
        }
    except Exception as e:
        logger.error(f"Error retrieving flood events: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve flood events")


@router.get("/statistics")
def get_flood_statistics(
    days_back: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    db: Session = Depends(get_db)
):
    """
    Get aggregate flood statistics
    
    Query Parameters:
    - days_back: Number of days to analyze (1-365)
    
    Returns:
        Aggregate statistics and trends
    """
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        
        # Get all flood events in the period
        events = db.query(FloodEventLog).filter(
            FloodEventLog.event_time >= cutoff_date
        ).all()
        
        if not events:
            return {
                'status': 'success',
                'period_days': days_back,
                'analysis_start_date': cutoff_date.isoformat(),
                'analysis_end_date': datetime.utcnow().isoformat(),
                'total_events': 0,
                'message': 'No flood events recorded in this period'
            }
        
        # Calculate statistics
        total_events = len(events)
        start_events = len([e for e in events if e.event_type == 'flood_start'])
        end_events = len([e for e in events if e.event_type == 'flood_end'])
        
        # Get unique roads flooded
        roads_flooded = len(set(e.road_id for e in events))
        
        # Get flood level distribution
        high_severity = len([e for e in events if e.flood_level == 'high'])
        medium_severity = len([e for e in events if e.flood_level == 'medium'])
        low_severity = len([e for e in events if e.flood_level == 'low'])
        
        # Calculate average rainfall during floods
        avg_rainfall = 0
        rainfall_values = [e.rainfall_mm for e in events if e.rainfall_mm is not None]
        if rainfall_values:
            avg_rainfall = sum(rainfall_values) / len(rainfall_values)
        
        # Get top 10 most flooded roads
        road_counts = {}
        for event in events:
            if event.road_id not in road_counts:
                road_counts[event.road_id] = {'count': 0, 'name': event.road_name}
            road_counts[event.road_id]['count'] += 1
        
        top_flooded_roads = sorted(
            [{'road_id': rid, 'road_name': data['name'], 'event_count': data['count']}
             for rid, data in road_counts.items()],
            key=lambda x: x['event_count'],
            reverse=True
        )[:10]
        
        return {
            'status': 'success',
            'period_days': days_back,
            'analysis_start_date': cutoff_date.isoformat(),
            'analysis_end_date': datetime.utcnow().isoformat(),
            'total_events': total_events,
            'flood_start_events': start_events,
            'flood_end_events': end_events,
            'unique_roads_affected': roads_flooded,
            'severity_distribution': {
                'high': high_severity,
                'medium': medium_severity,
                'low': low_severity
            },
            'average_rainfall_mm': round(avg_rainfall, 2),
            'top_flooded_roads': top_flooded_roads
        }
    except Exception as e:
        logger.error(f"Error retrieving flood statistics: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve flood statistics")


@router.get("/road/{road_id}")
def get_road_flood_history(
    road_id: str,
    db: Session = Depends(get_db)
):
    """
    Get complete flood history for a specific road
    
    Path Parameters:
    - road_id: OSM way ID for the road
    
    Returns:
        Complete flood history for the road including all events and hotspot data
    """
    try:
        # Get hotspot data
        hotspot = db.query(FloodHotspot).filter(
            FloodHotspot.road_id == road_id
        ).first()
        
        # Get all events for this road
        events = db.query(FloodEventLog).filter(
            FloodEventLog.road_id == road_id
        ).order_by(FloodEventLog.event_time.desc()).all()
        
        if not hotspot and not events:
            raise HTTPException(status_code=404, detail="No flood history found for this road")
        
        result = {
            'road_id': road_id,
            'status': 'success'
        }
        
        if hotspot:
            result['hotspot'] = {
                'road_name': hotspot.road_name,
                'location': {
                    'lat': hotspot.location_lat,
                    'lon': hotspot.location_lon
                },
                'flood_history': {
                    'total_events': hotspot.total_flood_events,
                    'total_flooded_hours': round(hotspot.total_flooded_hours, 2),
                    'average_duration_hours': round(hotspot.average_flood_duration_hours, 2),
                    'frequency_per_year': round(hotspot.frequency_per_year, 2)
                },
                'risk_score': round(hotspot.flood_risk_score, 2),
                'last_flood': {
                    'start': hotspot.last_flood_start.isoformat() if hotspot.last_flood_start else None,
                    'end': hotspot.last_flood_end.isoformat() if hotspot.last_flood_end else None,
                    'days_since': hotspot.days_since_last_flood
                },
                'first_recorded': hotspot.first_flood_recorded.isoformat() if hotspot.first_flood_recorded else None
            }
        
        result['events'] = [
            {
                'event_id': event.id,
                'event_type': event.event_type,
                'event_time': event.event_time.isoformat(),
                'flood_level': event.flood_level,
                'rainfall_mm': event.rainfall_mm
            }
            for event in events
        ]
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving road flood history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve road flood history")


@router.get("/timeline")
def get_flood_timeline(
    days_back: int = Query(7, ge=1, le=30, description="Number of days to show"),
    db: Session = Depends(get_db)
):
    """
    Get flood events timeline for visualization
    
    Query Parameters:
    - days_back: Number of days to include (1-30)
    
    Returns:
        Events organized by date for timeline display
    """
    try:
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        
        events = db.query(FloodEventLog).filter(
            FloodEventLog.event_time >= cutoff_date
        ).order_by(FloodEventLog.event_time.desc()).all()
        
        # Group by date
        timeline = {}
        for event in events:
            date_key = event.event_time.date().isoformat()
            if date_key not in timeline:
                timeline[date_key] = []
            
            timeline[date_key].append({
                'time': event.event_time.time().isoformat(),
                'road_id': event.road_id,
                'road_name': event.road_name,
                'event_type': event.event_type,
                'flood_level': event.flood_level
            })
        
        return {
            'status': 'success',
            'period_days': days_back,
            'total_events': len(events),
            'timeline': timeline
        }
    except Exception as e:
        logger.error(f"Error retrieving flood timeline: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve flood timeline")
