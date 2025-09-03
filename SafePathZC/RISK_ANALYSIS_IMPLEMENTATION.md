# SafePathZC Risk Analysis & Visualization Implementation

## Overview

Complete implementation of Safe Route Filtering (Option A) and Frontend Leaflet.js visualization for the SafePathZC application.

## Backend Implementation

### Enhanced Safe Route Filtering Endpoint

**Endpoint**: `POST /api/safe-route-filter`

**Logic Flow (Option A: Filter after routing)**:

1. Request default route from OSRM API
2. Request alternative routes from OSRM API
3. For each route, get elevation data from Open-Elevation API
4. For each route, get weather/rainfall data from Open-Meteo API
5. Calculate risk scores for all segments using elevation, slope, and rainfall
6. Return all evaluated routes with detailed risk analysis
7. Recommend the route with the lowest overall risk score

**Request Format**:

```json
{
  "start_lat": 6.9214,
  "start_lng": 122.079,
  "end_lat": 6.9244,
  "end_lng": 122.0816
}
```

**Response Format**:

```json
{
  "evaluated_routes": [
    {
      "id": "default",
      "segments": [
        {
          "lat": 6.9214,
          "lng": 122.0790,
          "elevation": 12.0,
          "slope": 0.0,
          "rainfall_mm": 0.0,
          "risk_score": 0,
          "risk_level": "Safe"
        }
      ],
      "overall_risk": 0,
      "overall_level": "Safe",
      "distance": 0.64,
      "duration": 119,
      "geometry": {
        "type": "LineString",
        "coordinates": [[122.0790, 6.9214], ...]
      }
    }
  ],
  "recommended": {
    "id": "default",
    "segments": [...],
    "overall_risk": 0,
    "overall_level": "Safe",
    "distance": 0.64,
    "duration": 119,
    "geometry": {...}
  }
}
```

### Risk Scoring Algorithm

**Risk Factors**:

- **Elevation < 5m**: +25 points (flood risk)
- **Slope downhill < -5%**: +10 points (landslide risk)
- **Rainfall ≥ 10 mm/h**: +25 points (moderate rain risk)
- **Rainfall ≥ 20 mm/h**: +40 points (heavy rain risk)

**Risk Classifications**:

- **0-24**: Safe (Green)
- **25-49**: Caution (Yellow)
- **50-74**: Risky (Orange)
- **75-100**: Avoid (Red)

### API Integration

**External APIs Used**:

1. **OSRM Routing API**: `http://router.project-osrm.org/route/v1/driving/`

   - Gets default and alternative routes
   - Returns GeoJSON geometry for map rendering

2. **Open-Elevation API**: `https://api.open-elevation.com/api/v1/lookup`

   - Provides elevation data for route points
   - Used for slope calculations

3. **Open-Meteo API**: `https://api.open-meteo.com/v1/forecast`
   - Free weather API (no API key required)
   - Provides current rainfall data

## Frontend Implementation

### HTML Version (`risk-visualization.html`)

**Features**:

- ✅ Interactive Leaflet.js map centered on Zamboanga City
- ✅ Risk-colored route segments (Green/Yellow/Orange/Red)
- ✅ High-risk point markers with detailed popups
- ✅ Risk legend showing color-to-risk mapping
- ✅ Route information panel with statistics
- ✅ Coordinate input controls for custom routes
- ✅ Responsive design with modern UI

**Risk Visualization**:

- **Route Segments**: Colored by risk level with smooth polylines
- **Risk Markers**: Circle markers for Risky/Avoid points only (to reduce clutter)
- **Tooltips**: Hover tooltips showing risk level and segment count
- **Popups**: Detailed popups with elevation, slope, rainfall, and risk score

### React Component Version (`RiskRouteMap.tsx`)

**Integration**:

- Drop-in React component using Leaflet and TypeScript
- Tailwind CSS styling for consistency with existing UI
- State management for route data and loading states
- Error handling and user feedback

**Usage**:

```jsx
import RiskRouteMap from "./components/RiskRouteMap";

function App() {
  return (
    <div>
      <RiskRouteMap />
    </div>
  );
}
```

## Installation & Setup

### Backend Dependencies

```bash
# Already installed in requirements.txt
requests==2.31.0
```

### Frontend Dependencies

```bash
# For HTML version - no additional dependencies (uses CDN)

# For React version - already in package.json
npm install leaflet @types/leaflet
```

## Testing

### Backend Testing

```bash
# Test the enhanced safe route filtering
python test_safe_route_filter.py
```

### Frontend Testing

1. **HTML Version**: Open `risk-visualization.html` in browser
2. **React Version**: Import and use `RiskRouteMap` component

## Example Usage

### Step-by-Step Route Analysis

1. **Input Coordinates**:

   - Start: Zamboanga City Hall (6.9214, 122.0790)
   - End: Zamboanga Port (6.9244, 122.0816)

2. **Backend Processing**:

   - Fetches routes from OSRM
   - Gets elevation/weather data
   - Calculates risk scores
   - Returns detailed analysis

3. **Frontend Visualization**:
   - Draws color-coded route segments
   - Shows risk markers for dangerous areas
   - Displays route statistics and recommendations

## Production Deployment

### Backend Considerations

- Configure proper CORS for production domains
- Add rate limiting for external API calls
- Implement caching for elevation/weather data
- Add monitoring for external API failures

### Frontend Considerations

- Replace localhost API URL with production endpoint
- Add loading states and error boundaries
- Optimize map tile caching
- Add responsive breakpoints for mobile

## Educational Value

**Learning Objectives Achieved**:
✅ **API Integration**: Multiple external services (OSRM, Open-Elevation, Open-Meteo)
✅ **Risk Analysis**: Mathematical scoring algorithms with real-world heuristics  
✅ **Geospatial Processing**: Coordinate transformations and GeoJSON handling
✅ **Interactive Mapping**: Leaflet.js with advanced visualization techniques
✅ **Full-Stack Development**: FastAPI backend + React/HTML frontend integration
✅ **Production Practices**: Error handling, input validation, and user experience

This implementation provides a comprehensive foundation for student learning in geospatial web development, risk analysis, and interactive mapping applications.
