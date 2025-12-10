"""
Clean routing logger for organized, readable output.
Provides structured logging for routing analysis with clear visual separation.
"""

import logging
from typing import List, Dict, Any
from enum import Enum

class RoutingPhase(Enum):
    """Routing analysis phases for organized logging"""
    INITIALIZATION = "🟦 INIT"
    WAYPOINT_GENERATION = "📍 WAYPOINTS"
    OSRM_ROUTING = "🛣️  OSRM"
    LOCAL_ROUTING = "🔍 LOCAL"
    FLOOD_ANALYSIS = "💧 FLOOD"
    ROUTE_SELECTION = "✅ SELECT"
    FINAL_RESULT = "📊 RESULT"
    ERROR = "❌ ERROR"
    WARNING = "⚠️  WARNING"

class RouteLogger:
    """Organized logging for routing operations"""
    
    def __init__(self, name: str = "routes.flood_routing"):
        self.logger = logging.getLogger(name)
        self.current_phase = None
        
    def phase_start(self, phase: RoutingPhase, message: str = ""):
        """Start a new phase with clear visual separation"""
        self.current_phase = phase
        separator = "=" * 80
        self.logger.info(f"\n{separator}")
        self.logger.info(f"{phase.value} {message}")
        self.logger.info(separator)
    
    def phase_end(self, message: str = ""):
        """End current phase"""
        if message:
            self.logger.info(f"✓ {message}\n")
    
    def info(self, message: str, indent: int = 1):
        """Log info with indentation"""
        prefix = "  " * indent
        self.logger.info(f"{prefix}{message}")
    
    def warning(self, message: str, indent: int = 1):
        """Log warning with indentation"""
        prefix = "  " * indent
        self.logger.warning(f"{prefix}{message}")
    
    def error(self, message: str, indent: int = 1):
        """Log error with indentation"""
        prefix = "  " * indent
        self.logger.error(f"{prefix}{message}")
    
    def route_summary(self, routes: List[Dict[str, Any]]):
        """Display formatted route summary"""
        self.phase_start(RoutingPhase.FINAL_RESULT, "ROUTE OPTIONS")
        
        categories = ["Safe", "Manageable", "Flood-prone"]
        
        for idx, route in enumerate(routes[:3]):
            if idx < len(categories):
                flood_pct = route.get("flood_percentage", 0)
                distance = route.get("distance", 0)
                duration = route.get("duration", 0)
                
                # Color coding based on flood risk
                if flood_pct <= 2:
                    risk_emoji = "🟢"
                elif flood_pct <= 10:
                    risk_emoji = "🟡"
                else:
                    risk_emoji = "🔴"
                
                self.info(
                    f"{risk_emoji} {categories[idx]:12} | "
                    f"Flood: {flood_pct:5.1f}% | "
                    f"Distance: {distance:5.0f}m | "
                    f"Time: {int(duration)}s",
                    indent=0
                )
        
        self.logger.info("")
    
    def progress(self, current: int, total: int, message: str, visited_count: int = 0, open_set_size: int = 0):
        """Log progress for long operations (A* search)"""
        self.logger.info(f"A* Progress: Iter {current}/{total}, {message}, visited {visited_count} nodes, open set size={open_set_size}")
    
    def dead_end_detected(self, point1: int, point2: int, straight: float, path: float):
        """Log dead-end detection"""
        deviation = ((path - straight) / straight) * 100
        self.warning(
            f"Dead-end loop: Points {point1} & {point2} | "
            f"Straight: {straight:.0f}m, Path: {path:.0f}m (+{deviation:.0f}%)",
            indent=1
        )
    
    def routing_attempt(self, strategy: str, method: str, attempt_num: int = None):
        """Log routing attempt"""
        attempt_text = f" (Attempt {attempt_num})" if attempt_num else ""
        self.info(f"{strategy} - Trying {method}{attempt_text}", indent=1)
    
    def routing_success(self, method: str, distance: float, flood_pct: float, duration: float):
        """Log successful route"""
        self.info(
            f"✓ {method}: {distance:.0f}m | {flood_pct:.1f}% flooded | {int(duration)}s",
            indent=2
        )
    
    def routing_failed(self, method: str, reason: str):
        """Log failed routing attempt"""
        self.warning(f"✗ {method} failed: {reason}", indent=2)
    
    def route_selection(self, category: str, index: int, flood_pct: float, distance: float, duration: float):
        """Log final route selection"""
        if flood_pct <= 2:
            emoji = "🟢"
        elif flood_pct <= 10:
            emoji = "🟡"
        else:
            emoji = "🔴"
        
        self.info(
            f"{emoji} Selected {category}: {flood_pct:.1f}% flooded, {distance:.0f}m, {int(duration)}s",
            indent=0
        )
    
    def correlation_analysis(self, data: Dict[str, Any]):
        """Log correlation analysis results"""
        self.phase_start(RoutingPhase.FINAL_RESULT, "ANALYSIS SUMMARY")
        
        for key, value in data.items():
            if isinstance(value, float):
                self.info(f"• {key}: {value:.3f}", indent=0)
            else:
                self.info(f"• {key}: {value}", indent=0)
        
        self.logger.info("")


# Convenience function
_route_logger = None

def get_route_logger():
    """Get or create route logger instance"""
    global _route_logger
    if _route_logger is None:
        _route_logger = RouteLogger()
    return _route_logger
