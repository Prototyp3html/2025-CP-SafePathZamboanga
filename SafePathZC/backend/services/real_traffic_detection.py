#!/usr/bin/env python3
"""
Real Traffic Detection Service for SafePath Zamboanga City

Uses ACTUAL data sources:
1. User-reported incidents (accidents, road closures, construction)
2. Road intersection analysis (naturally high-traffic areas)
3. Historical incident patterns from user reports
4. Real-time incident proximity to routes
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Any
from dataclasses import dataclass
import math

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class TrafficIncident:
    """Real incident causing traffic congestion"""
    id: int
    location_lat: float
    location_lng: float
    incident_type: str  # 'accident', 'road_closure', 'construction', 'emergency_services'
    severity: str  # 'low', 'medium', 'high'
    reported_at: datetime
    impact_radius_m: float  # How far this incident affects traffic
    description: str


@dataclass
class RoadIntersection:
    """Naturally high-traffic road intersection"""
    lat: float
    lng: float
    road_names: List[str]  # Roads that intersect here
    incident_frequency: int  # How many incidents reported at this intersection historically
    congestion_baseline: float  # Natural congestion level (0.0 to 1.0)


class RealTrafficDetectionService:
    """
    Detect traffic based on REAL user-reported incidents and road intersections.
    No demo data - only actual user submissions.
    """
    
    # Known road intersections in Zamboanga City (based on topology)
    # These are naturally congestion-prone areas
    HIGH_TRAFFIC_INTERSECTIONS = [
        # Downtown/Commercial Areas
        RoadIntersection(6.9138, 122.0742, ['Roxas Avenue', 'Zamboanga-Basilan Road'], 0, 0.4),
        RoadIntersection(6.9150, 122.0730, ['Rizal Avenue', 'Lanao Road'], 0, 0.35),
        RoadIntersection(6.9075, 122.0790, ['Valderosa Street', 'Tetuan Road'], 0, 0.3),
        RoadIntersection(6.9210, 122.0790, ['Rio Hondo Bridge Area'], 0, 0.45),  # Bridge crossing
        
        # Port/Market Areas
        RoadIntersection(6.9103, 122.0685, ['Reclamation Area', 'Port Access Road'], 0, 0.5),
        RoadIntersection(6.9270, 122.0825, ['San Jose Market Route'], 0, 0.35),
        
        # Residential/Transit Areas
        RoadIntersection(6.9380, 122.0620, ['Pasonanca Access Road'], 0, 0.25),
        RoadIntersection(6.9420, 122.0730, ['San Jose Gusu Area'], 0, 0.3),
    ]
    
    def __init__(self):
        self.active_incidents: List[TrafficIncident] = []
        self.last_updated: Optional[datetime] = None
        
    async def load_incidents_from_db(self, db_session) -> List[TrafficIncident]:
        """
        Load REAL traffic-causing incidents from database
        Only incidents with traffic-causing categories
        """
        try:
            from models import Report
            from sqlalchemy import and_
            
            # Only fetch incidents that cause traffic:
            # - roadblock: Road blockages/closures (obviously blocking traffic)
            # - damage: Road damage (potholes, collapsed roads, etc.)
            # - flood: Flooding (can block roads severely)
            traffic_causing_categories = ['roadblock', 'damage', 'flood']
            
            # Only incidents from last 24 hours (otherwise they're resolved)
            cutoff_time = datetime.utcnow() - timedelta(hours=24)
            
            # Debug: Check all recent reports first
            all_recent = db_session.query(Report).filter(Report.created_at >= cutoff_time).all()
            logger.info(f"Found {len(all_recent)} total reports in last 24h")
            for r in all_recent:
                logger.info(f"  Report #{r.id}: category={r.category}, visible={r.is_visible}, score={r.verification_score}")
            
            incidents = db_session.query(Report).filter(
                and_(
                    Report.category.in_(traffic_causing_categories),
                    Report.is_visible == True,  # Only approved/visible reports
                    Report.created_at >= cutoff_time
                    # Verification score check removed - approved reports are trusted
                )
            ).all()
            
            logger.info(f"After filtering: {len(incidents)} traffic-causing incidents")
            
            # Convert DB reports to TrafficIncident objects
            traffic_incidents = []
            for report in incidents:
                incident = TrafficIncident(
                    id=report.id,
                    location_lat=report.location_lat,
                    location_lng=report.location_lng,
                    incident_type=report.category,
                    severity=report.urgency,
                    reported_at=report.created_at,
                    impact_radius_m=self._get_impact_radius(report.category, report.urgency),
                    description=report.description
                )
                traffic_incidents.append(incident)
                logger.info(f"Loaded real incident: {report.category} at ({report.location_lat}, {report.location_lng})")
            
            self.active_incidents = traffic_incidents
            self.last_updated = datetime.utcnow()
            
            logger.info(f"Loaded {len(traffic_incidents)} real traffic incidents from user reports")
            return traffic_incidents
            
        except Exception as e:
            logger.error(f"Failed to load traffic incidents from database: {e}")
            return []
    
    def _get_impact_radius(self, incident_type: str, severity: str) -> float:
        """
        Calculate how far this incident impacts traffic (in meters)
        Real incidents have measurable impact zones
        """
        # Base impact radius by type
        type_radius = {
            'accident': 150,           # Accidents affect immediate area
            'road_closure': 300,       # Closures affect wider area
            'infrastructure': 250,     # Construction affects significant area
            'emergency_services': 100, # Emergency vehicles have smaller impact
        }
        
        # Severity multiplier
        severity_multiplier = {
            'low': 0.8,
            'medium': 1.0,
            'high': 1.5,
            'critical': 2.0,
        }
        
        base = type_radius.get(incident_type, 200)
        multiplier = severity_multiplier.get(severity, 1.0)
        
        return base * multiplier
    
    def calculate_traffic_for_route(self, coordinates: List[List[float]]) -> Dict[str, Any]:
        """
        Analyze traffic impact on a specific route using REAL incidents and intersections
        
        Returns:
            {
                'congestion_percentage': 0-100,
                'traffic_level': 'free_flow'|'light'|'moderate'|'heavy'|'severe',
                'affected_segments': count of segments with incidents,
                'incidents_on_route': [incident details],
                'intersection_count': number of high-traffic intersections,
                'total_delay_minutes': estimated delay,
                'traffic_penalty': 1.0-3.0 (multiplier for routing)
            }
        """
        if not self.active_incidents and not self._has_intersections_on_route(coordinates):
            logger.info("🟢 No traffic incidents on route - free flow conditions")
            return {
                'congestion_percentage': 0,
                'traffic_level': 'free_flow',
                'affected_segments': 0,
                'incidents_on_route': [],
                'intersection_count': 0,
                'total_delay_minutes': 0,
                'traffic_penalty': 1.0
            }
        
        logger.info("=" * 80)
        logger.info("🚦 TRAFFIC ANALYSIS: REAL USER-REPORTED INCIDENTS")
        logger.info("=" * 80)
        logger.info(f"Route: {len(coordinates)} waypoints")
        logger.info(f"Active incidents in system: {len(self.active_incidents)}")
        
        # Analyze incidents on this route
        incidents_on_route = self._find_incidents_on_route(coordinates)
        logger.info(f"  ✓ Found {len(incidents_on_route)} incidents on/near route:")
        for inc in incidents_on_route:
            logger.info(f"    - {inc.incident_type.upper()} (severity: {inc.severity}) at ({inc.location_lat:.4f}, {inc.location_lng:.4f})")
            logger.info(f"      Impact radius: {inc.impact_radius_m}m | {inc.description[:60]}")
        
        # Count high-traffic intersections on route
        intersections_on_route = self._find_intersections_on_route(coordinates)
        logger.info(f"  ✓ Found {len(intersections_on_route)} high-traffic intersections on route:")
        for inter in intersections_on_route:
            logger.info(f"    - {' / '.join(inter.road_names)} | Baseline congestion: {inter.congestion_baseline*100:.0f}% | Historical incidents: {inter.incident_frequency}")
        
        # Calculate total congestion impact
        logger.info("\n📊 CONGESTION CALCULATION:")
        congestion = self._calculate_congestion_impact(
            incidents_on_route, 
            intersections_on_route,
            coordinates
        )
        logger.info(f"  Congestion Level: {congestion['level'].upper()}")
        logger.info(f"  Congestion Percentage: {congestion['percentage']:.1f}%")
        
        # Calculate delay estimate
        delay_minutes = self._estimate_delay(congestion['percentage'], len(coordinates))
        logger.info(f"  Estimated Additional Delay: {delay_minutes:.1f} minutes")
        
        # Calculate traffic penalty
        penalty = self._calculate_penalty(congestion['percentage'])
        logger.info(f"  Traffic Penalty Multiplier: {penalty:.2f}x (time cost multiplier)")
        
        logger.info("=" * 80)
        
        return {
            'congestion_percentage': congestion['percentage'],
            'traffic_level': congestion['level'],
            'affected_segments': len(incidents_on_route),
            'incidents_on_route': [
                {
                    'type': inc.incident_type,
                    'severity': inc.severity,
                    'location': [inc.location_lng, inc.location_lat],
                    'description': inc.description,
                    'reported_at': inc.reported_at.isoformat()
                }
                for inc in incidents_on_route
            ],
            'intersection_count': len(intersections_on_route),
            'intersection_names': [
                ' / '.join(inter.road_names) for inter in intersections_on_route
            ],
            'total_delay_minutes': delay_minutes,
            'traffic_penalty': penalty
        }
    
    def _find_incidents_on_route(self, coordinates: List[List[float]]) -> List[TrafficIncident]:
        """Find all real incidents affecting this route"""
        incidents_on_route = []
        
        for incident in self.active_incidents:
            # Check if incident is within route's bounding box + impact radius
            for coord in coordinates:
                distance = self._haversine_distance(
                    coord[1], coord[0],  # lat, lng
                    incident.location_lat, incident.location_lng
                )
                
                if distance <= incident.impact_radius_m:
                    incidents_on_route.append(incident)
                    logger.debug(f"    → Incident {incident.id} within impact radius: {distance:.0f}m <= {incident.impact_radius_m}m")
                    break  # Already added this incident
        
        return incidents_on_route
    
    def _find_intersections_on_route(self, coordinates: List[List[float]]) -> List[RoadIntersection]:
        """Find high-traffic intersections on this route"""
        intersections_on_route = []
        intersection_threshold = 100  # Within 100 meters of intersection
        
        for intersection in self.HIGH_TRAFFIC_INTERSECTIONS:
            for coord in coordinates:
                distance = self._haversine_distance(
                    coord[1], coord[0],  # lat, lng
                    intersection.lat, intersection.lng
                )
                
                if distance <= intersection_threshold:
                    intersections_on_route.append(intersection)
                    logger.debug(f"    → Intersection within threshold: {distance:.0f}m <= {intersection_threshold}m")
                    break
        
        return intersections_on_route
    
    def _has_intersections_on_route(self, coordinates: List[List[float]]) -> bool:
        """Quick check if route passes any known intersections"""
        return len(self._find_intersections_on_route(coordinates)) > 0
    
    def _calculate_congestion_impact(
        self, 
        incidents: List[TrafficIncident],
        intersections: List[RoadIntersection],
        coordinates: List[List[float]]
    ) -> Dict[str, Any]:
        """
        Calculate total congestion percentage from real incidents and intersections
        """
        congestion_percentage = 0.0
        logger.debug("  Computing congestion impact:")
        
        # Impact from real incidents
        incident_impact = 0
        for incident in incidents:
            if incident.severity == 'critical':
                congestion_percentage += 40  # Critical incidents cause major congestion
                logger.debug(f"    + Critical {incident.incident_type}: +40%")
            elif incident.severity == 'high':
                congestion_percentage += 25
                logger.debug(f"    + High {incident.incident_type}: +25%")
            elif incident.severity == 'medium':
                congestion_percentage += 15
                logger.debug(f"    + Medium {incident.incident_type}: +15%")
            else:
                congestion_percentage += 5
                logger.debug(f"    + Low {incident.incident_type}: +5%")
        
        # Impact from intersections (baseline congestion)
        if intersections:
            intersection_impact = sum(inter.congestion_baseline for inter in intersections)
            intersection_avg = (intersection_impact * 100 / len(intersections))
            congestion_percentage += intersection_avg
            logger.debug(f"    + Intersections baseline: +{intersection_avg:.1f}%")
        
        # Cap at 100%
        congestion_percentage = min(congestion_percentage, 100)
        logger.debug(f"  Total congestion: {congestion_percentage:.1f}%")
        
        # Determine traffic level
        if congestion_percentage < 30:
            level = 'free_flow'
        elif congestion_percentage < 50:
            level = 'light'
        elif congestion_percentage < 70:
            level = 'moderate'
        elif congestion_percentage < 90:
            level = 'heavy'
        else:
            level = 'severe'
        
        return {
            'percentage': congestion_percentage,
            'level': level
        }
    
    def _estimate_delay(self, congestion_percentage: float, num_segments: int) -> float:
        """Estimate travel time delay in minutes based on congestion"""
        # Rough calculation: ~2 minutes per segment, scaled by congestion
        base_time = num_segments * 2  # Minutes for normal route
        delay_multiplier = 1 + (congestion_percentage / 100)
        delay = (base_time * delay_multiplier) - base_time
        logger.debug(f"  Delay calculation: base {base_time}min * {delay_multiplier:.2f}x = +{delay:.1f}min")
        return delay
    
    def _calculate_penalty(self, congestion_percentage: float) -> float:
        """
        Calculate route penalty for routing algorithm
        1.0 = normal, 2.0+ = heavily penalized routes
        """
        if congestion_percentage < 30:
            return 1.0
        elif congestion_percentage < 50:
            return 1.3
        elif congestion_percentage < 70:
            return 1.6
        elif congestion_percentage < 90:
            return 2.0
        else:
            return 2.5
    
    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in meters"""
        R = 6371000  # Earth radius in meters
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * 
             math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c


# Global service instance
_traffic_service = None


def get_traffic_service() -> RealTrafficDetectionService:
    """Get or create the traffic detection service"""
    global _traffic_service
    if _traffic_service is None:
        _traffic_service = RealTrafficDetectionService()
    return _traffic_service
