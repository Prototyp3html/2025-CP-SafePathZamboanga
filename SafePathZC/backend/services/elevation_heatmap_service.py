"""
Elevation-based heatmap service using COP30 DEM (Digital Elevation Model) TIF file.
Generates elevation data for terrain visualization with full area coverage.
"""

import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple, Optional

try:
    import rasterio
except ImportError:
    rasterio = None

logger = logging.getLogger(__name__)


class ElevationHeatmapService:
    """Service to read and process elevation data from COP30 DEM TIF files."""
    
    def __init__(self):
        self.tif_path = Path(__file__).parent.parent / "data" / "heatmap" / "rasters_COP30" / "output_hh.tif"
        self.elevation_data = None
        self.bounds = None
        self.metadata = None
        self._loaded = False
        
    def load_elevation_data(self):
        """Load elevation data from TIF file."""
        if self._loaded:
            return
            
        if not rasterio:
            logger.error("rasterio not installed. Install with: pip install rasterio")
            return False
            
        if not self.tif_path.exists():
            logger.error(f"DEM file not found: {self.tif_path}")
            return False
        
        try:
            with rasterio.open(self.tif_path) as src:
                self.elevation_data = src.read(1)  # Read first band
                self.metadata = src.meta
                self.bounds = src.bounds  # (left, bottom, right, top)
                self._loaded = True
                logger.info(f"✅ Loaded elevation data: {self.elevation_data.shape}")
                logger.info(f"   Bounds: {self.bounds}")
                logger.info(f"   Value range: {np.nanmin(self.elevation_data):.1f}m to {np.nanmax(self.elevation_data):.1f}m")
                return True
        except Exception as e:
            logger.error(f"Error loading elevation data: {e}")
            return False
    
    def _pixel_to_coords(self, row: int, col: int) -> Tuple[float, float]:
        """Convert pixel row/col to lat/lon coordinates."""
        if not self.bounds or not self.metadata:
            return None
        
        # Bounds are (left, bottom, right, top) = (minx, miny, maxx, maxy)
        pixel_width = (self.bounds[2] - self.bounds[0]) / self.metadata['width']
        pixel_height = (self.bounds[3] - self.bounds[1]) / self.metadata['height']
        
        lon = self.bounds[0] + (col + 0.5) * pixel_width
        lat = self.bounds[3] - (row + 0.5) * pixel_height
        
        return lat, lon
    
    def get_elevation_grid(self, sample_rate: int = 10) -> List[Tuple[float, float, float]]:
        """
        Get elevation data as array of [lat, lon, intensity] for Leaflet heatmap.
        
        Args:
            sample_rate: Sample every Nth pixel
        
        Returns:
            List of [lat, lon, intensity] tuples normalized to 0-1
        """
        if not self._loaded:
            self.load_elevation_data()
        
        if self.elevation_data is None:
            return []
        
        heatmap_data = []
        rows, cols = self.elevation_data.shape
        
        # Find min/max for normalization
        valid_data = self.elevation_data[~np.isnan(self.elevation_data) & (self.elevation_data > -9000)]
        if len(valid_data) == 0:
            return []
        
        elev_min = float(np.nanmin(valid_data))
        elev_max = float(np.nanmax(valid_data))
        elev_range = elev_max - elev_min if elev_max > elev_min else 1
        
        logger.info(f"Elevation range: {elev_min:.1f}m to {elev_max:.1f}m")
        
        # Sample the DEM
        for row in range(0, rows, sample_rate):
            for col in range(0, cols, sample_rate):
                elevation = self.elevation_data[row, col]
                
                # Skip NoData values
                if np.isnan(elevation) or elevation < -9000:
                    continue
                
                coords = self._pixel_to_coords(row, col)
                if coords is None:
                    continue
                
                lat, lon = coords
                
                # Normalize elevation to 0-1 range for heatmap intensity
                intensity = float((elevation - elev_min) / elev_range if elev_range > 0 else 0.5)
                
                # Convert to plain Python floats for JSON serialization
                heatmap_data.append([float(lat), float(lon), intensity])
        
        logger.info(f"✅ Generated elevation grid with {len(heatmap_data)} points")
        return heatmap_data


# Global instance
_elevation_service: Optional[ElevationHeatmapService] = None


def get_elevation_heatmap_service() -> ElevationHeatmapService:
    """Get or create the global elevation heatmap service instance."""
    global _elevation_service
    if _elevation_service is None:
        _elevation_service = ElevationHeatmapService()
    return _elevation_service
