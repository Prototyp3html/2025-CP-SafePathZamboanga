#!/usr/bin/env python3
"""
Traffic Incident Routes - Real incident reporting integration

Uses actual user reports to detect traffic congestion.
No demo data - only real user submissions.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging

from models import Report
from database_utils import get_db
from services.real_traffic_detection import get_traffic_service, RealTrafficDetectionService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/traffic", tags=["traffic"])


class TrafficAnalysisRequest:
    """Request for traffic analysis on a route"""
    route_coordinates: List[List[float]]  # [[lng, lat], ...]


@router.post("/analyze-route")
async def analyze_route_traffic(
    route_coordinates: List[List[float]],
    db: Session = Depends(get_db)
):
    """
    Analyze traffic impact on a specific route using REAL user-reported incidents.
    
    Uses:
    - Real accidents and road closures from user reports
    - Real construction/infrastructure issues from user reports
    - Naturally high-traffic intersections in Zamboanga
    
    No demo data - only actual incidents verified by users.
    """
    try:
        traffic_service = get_traffic_service()
        
        # Load real incidents from database on each request (fresh data)
        await traffic_service.load_incidents_from_db(db)
        
        # Analyze traffic for this route
        traffic_analysis = traffic_service.calculate_traffic_for_route(route_coordinates)
        
        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'traffic_analysis': traffic_analysis,
            'data_source': 'Real user reports + road intersections',
            'incident_count': len(traffic_analysis['incidents_on_route']),
            'intersection_count': traffic_analysis['intersection_count']
        }
        
    except Exception as e:
        logger.error(f"Traffic analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Traffic analysis failed: {str(e)}")


@router.get("/active-incidents")
async def get_active_incidents(
    category: Optional[str] = Query(None, description="Filter by category: accident, road_closure, infrastructure"),
    db: Session = Depends(get_db)
):
    """
    Get all active traffic-causing incidents from user reports.
    
    Only shows REAL incidents reported by users within last 24 hours.
    """
    try:
        from sqlalchemy import and_
        
        # Build query for traffic-causing incidents
        query = db.query(Report).filter(
            and_(
                Report.category.in_(['accident', 'road_closure', 'infrastructure']),
                Report.is_visible == True,  # Only approved reports
                Report.created_at >= datetime.utcnow() - timedelta(hours=24)
            )
        )
        
        # Optional filtering by category
        if category:
            query = query.filter(Report.category == category)
        
        incidents = query.order_by(Report.created_at.desc()).all()
        
        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'incident_count': len(incidents),
            'incidents': [
                {
                    'id': inc.id,
                    'type': inc.category,
                    'severity': inc.urgency,
                    'location': {
                        'lat': inc.location_lat,
                        'lng': inc.location_lng,
                        'address': inc.location_address
                    },
                    'description': inc.description,
                    'reported_at': inc.created_at.isoformat(),
                    'reporter': inc.reporter_name,
                    'verification_score': inc.verification_score
                }
                for inc in incidents
            ],
            'data_source': 'Real user reports only'
        }
        
    except Exception as e:
        logger.error(f"Failed to fetch incidents: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch incidents: {str(e)}")


@router.get("/incident-density")
async def get_incident_density(
    lat: float = Query(..., description="Center latitude"),
    lng: float = Query(..., description="Center longitude"),
    radius_m: float = Query(500, description="Search radius in meters"),
    db: Session = Depends(get_db)
):
    """
    Get incident density in a specific area.
    Useful for identifying traffic hotspots.
    """
    try:
        from sqlalchemy import and_
        import math
        
        # Get all recent incidents
        incidents = db.query(Report).filter(
            and_(
                Report.category.in_(['accident', 'road_closure', 'infrastructure']),
                Report.is_visible == True,
                Report.created_at >= datetime.utcnow() - timedelta(hours=24)
            )
        ).all()
        
        # Filter by radius using Haversine distance
        incidents_in_radius = []
        R = 6371000  # Earth radius in meters
        
        for inc in incidents:
            lat1_rad = math.radians(lat)
            lat2_rad = math.radians(inc.location_lat)
            delta_lat = math.radians(inc.location_lat - lat)
            delta_lon = math.radians(inc.location_lng - lng)
            
            a = (math.sin(delta_lat / 2) ** 2 + 
                 math.cos(lat1_rad) * math.cos(lat2_rad) * 
                 math.sin(delta_lon / 2) ** 2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            distance = R * c
            
            if distance <= radius_m:
                incidents_in_radius.append(inc)
        
        # Calculate density metrics
        area_km2 = (math.pi * (radius_m / 1000) ** 2)
        incident_density = len(incidents_in_radius) / area_km2 if area_km2 > 0 else 0
        
        # Categorize severity
        severity_breakdown = {
            'critical': len([i for i in incidents_in_radius if i.urgency == 'critical']),
            'high': len([i for i in incidents_in_radius if i.urgency == 'high']),
            'medium': len([i for i in incidents_in_radius if i.urgency == 'medium']),
            'low': len([i for i in incidents_in_radius if i.urgency == 'low'])
        }
        
        # Determine congestion level
        if incident_density < 0.1:
            congestion_level = 'low'
        elif incident_density < 0.5:
            congestion_level = 'moderate'
        elif incident_density < 1.0:
            congestion_level = 'high'
        else:
            congestion_level = 'severe'
        
        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'location': {'lat': lat, 'lng': lng},
            'radius_m': radius_m,
            'area_km2': round(area_km2, 2),
            'incident_count': len(incidents_in_radius),
            'incident_density': round(incident_density, 3),
            'congestion_level': congestion_level,
            'severity_breakdown': severity_breakdown,
            'incidents': [
                {
                    'id': inc.id,
                    'type': inc.category,
                    'severity': inc.urgency,
                    'location': [inc.location_lng, inc.location_lat],
                    'distance_m': round(
                        R * 2 * math.asin(math.sqrt(
                            math.sin(math.radians((inc.location_lat - lat) / 2)) ** 2 +
                            math.cos(math.radians(lat)) * math.cos(math.radians(inc.location_lat)) *
                            math.sin(math.radians((inc.location_lng - lng) / 2)) ** 2
                        )), 2
                    ),
                    'description': inc.description
                }
                for inc in incidents_in_radius
            ],
            'data_source': 'Real user reports only'
        }
        
    except Exception as e:
        logger.error(f"Failed to calculate density: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to calculate density: {str(e)}")


@router.get("/statistics")
async def get_traffic_statistics(db: Session = Depends(get_db)):
    """
    Get overall traffic incident statistics for Zamboanga City.
    Shows real trends from user reports.
    """
    try:
        from sqlalchemy import and_
        from datetime import timedelta
        
        # Get incidents from different time windows
        now = datetime.utcnow()
        last_24h = db.query(Report).filter(
            and_(
                Report.category.in_(['accident', 'road_closure', 'infrastructure']),
                Report.is_visible == True,
                Report.created_at >= now - timedelta(hours=24)
            )
        ).count()
        
        last_7d = db.query(Report).filter(
            and_(
                Report.category.in_(['accident', 'road_closure', 'infrastructure']),
                Report.is_visible == True,
                Report.created_at >= now - timedelta(days=7)
            )
        ).count()
        
        # Category breakdown (last 24h)
        incidents = db.query(Report).filter(
            and_(
                Report.category.in_(['accident', 'road_closure', 'infrastructure']),
                Report.is_visible == True,
                Report.created_at >= now - timedelta(hours=24)
            )
        ).all()
        
        category_breakdown = {}
        for inc in incidents:
            category_breakdown[inc.category] = category_breakdown.get(inc.category, 0) + 1
        
        # Severity breakdown (last 24h)
        severity_breakdown = {}
        for inc in incidents:
            severity_breakdown[inc.urgency] = severity_breakdown.get(inc.urgency, 0) + 1
        
        return {
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat(),
            'statistics': {
                'incidents_24h': last_24h,
                'incidents_7d': last_7d,
                'category_breakdown': category_breakdown,
                'severity_breakdown': severity_breakdown,
                'average_per_day': round(last_7d / 7, 1)
            },
            'data_source': 'Real user reports only',
            'note': 'All statistics based on verified user submissions'
        }
        
    except Exception as e:
        logger.error(f"Failed to get statistics: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")


from datetime import timedelta
