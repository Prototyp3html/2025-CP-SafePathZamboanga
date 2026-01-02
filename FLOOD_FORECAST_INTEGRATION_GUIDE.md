# Flood Forecast Feature - Integration Points Reference

## Quick Reference Guide

### 🔧 Backend Files Modified/Created

#### Modified: `backend/main.py`

**Line 37:** Added import

```python
from routes.flood_forecast import router as flood_forecast_router
```

**Line 388:** Registered router

```python
app.include_router(flood_forecast_router)  # Flood predictions based on weather forecast
```

#### Created: `backend/routes/flood_forecast.py`

**Purpose:** Provides REST API endpoints for flood predictions
**Endpoints:**

- `GET /api/flood-forecast/predictions` - 7-day forecast
- `GET /api/flood-forecast/today` - Today's forecast

#### Existing: `backend/services/flood_forecast.py`

**Already created** with full flood prediction logic

- Weather forecast fetching
- Flood risk calculation
- Multi-day forecast building

---

### 🎨 Frontend Files Modified/Created

#### Modified: `frontend/src/components/MapView.tsx`

**Line 22:** Added import

```tsx
import { FloodForecastPins } from "./FloodForecastPins";
```

**Line 1301:** Added state variable

```tsx
const [showFloodForecast, setShowFloodForecast] = useState(false);
```

**Around line 8590:** Created toggle button in map control

```tsx
const floodForecastBtn = L.DomUtil.create(
  "button",
  "leaflet-control-custom",
  menuContainer
);
styleSubBtn(floodForecastBtn);
const floodForecastIcon = document.createElement("span");
floodForecastIcon.innerText = "⚠️";
floodForecastBtn.appendChild(floodForecastIcon);
floodForecastBtn.title = "Toggle Flood Forecast (Next 7 days)";
```

**Around line 8660:** Added click handler

```tsx
floodForecastBtn.onclick = (e: Event) => {
  e.stopPropagation();
  setShowFloodForecast((prev) => {
    const newState = !prev;
    floodForecastBtn.style.background = newState ? "#FF8C00" : "#451ae0ff";
    floodForecastIcon.style.opacity = newState ? "1" : "0.6";
    return newState;
  });
};
```

**Around line 10996:** Rendered component

```tsx
<FloodForecastPins map={mapRef.current} isVisible={showFloodForecast} />
```

#### Created: `frontend/src/components/FloodForecastPins.tsx`

**Purpose:** React component that displays predicted flood markers on map
**Features:**

- Fetches predictions from API
- Renders orange warning pins
- Interactive day selector
- Summary statistics panel
- Auto-refresh every hour

#### Created: `frontend/src/components/FloodForecastPins.css`

**Purpose:** Styling for forecast component and map markers

---

## Data Flow Diagram

```
┌─────────────────┐
│  User Interface │
│  (Map Controls) │
└────────┬────────┘
         │
         │ Click ⚠️ button
         ↓
┌─────────────────────────────────────┐
│   MapView.tsx State Management      │
│   setShowFloodForecast(true)        │
└────────┬────────────────────────────┘
         │
         │ isVisible prop changes
         ↓
┌─────────────────────────────────────────────┐
│   FloodForecastPins Component               │
│   Listens to isVisible prop change          │
└────────┬────────────────────────────────────┘
         │
         │ Component mounts/becomes visible
         ↓
┌─────────────────────────────────────────────┐
│   Fetch from /api/flood-forecast/predictions│
└────────┬────────────────────────────────────┘
         │
         │ HTTP GET request
         ↓
┌─────────────────────────────────────────────┐
│   Backend: flood_forecast.py route          │
│   Handles: GET /api/flood-forecast/forecast │
└────────┬────────────────────────────────────┘
         │
         │ Import FloodForecastService
         ↓
┌──────────────────────────────────────────────┐
│   FloodForecastService (flood_forecast.py)   │
│   1. get_weather_forecast()                  │
│      → Open-Meteo API call                   │
│   2. build_forecast_from_weather()           │
│      → Calculate risk for each road          │
│   3. Return predictions with confidence      │
└────────┬─────────────────────────────────────┘
         │
         │ Returns JSON: {forecast_days, predictions}
         ↓
┌──────────────────────────────────────────┐
│   FloodForecastPins Component (Frontend) │
│   1. Parse response                      │
│   2. Update state with forecast data     │
│   3. Create marker objects for each pin  │
│   4. Add markers to map                  │
│   5. Render day selector UI              │
└──────────────────────────────────────────┘
         │
         ↓
┌──────────────────────────────┐
│   Leaflet Map                │
│   (Orange pins rendered)     │
└──────────────────────────────┘
```

---

## API Request/Response Examples

### Request 1: Get 7-Day Forecast

```
GET http://localhost:8000/api/flood-forecast/predictions

Response:
{
  "status": "success",
  "generated_at": "2025-01-15T10:30:00Z",
  "forecast_days": 7,
  "predictions": [
    {
      "date": "2025-01-15",
      "rainfall_mm": 12.5,
      "predicted_flooded_roads": [
        {
          "road_id": "osm_123456",
          "road_name": "Nunez Street",
          "confidence": 85,
          "location": {
            "lat": 6.927,
            "lon": 122.079
          }
        },
        {
          "road_id": "osm_789012",
          "road_name": "Roxas Avenue",
          "confidence": 72,
          "location": {
            "lat": 6.931,
            "lon": 122.082
          }
        }
      ]
    },
    {
      "date": "2025-01-16",
      "rainfall_mm": 2.1,
      "predicted_flooded_roads": []
    }
  ]
}
```

### Request 2: Get Today's Forecast

```
GET http://localhost:8000/api/flood-forecast/today

Response:
{
  "status": "success",
  "date": "2025-01-15",
  "rainfall_mm": 12.5,
  "rainfall_probability": 85,
  "will_likely_flood": true
}
```

---

## Component Props & State

### FloodForecastPins Props

```typescript
interface FloodForecastPinsProps {
  map: L.Map | null; // Leaflet map instance
  isVisible: boolean; // Whether to show forecast pins
}
```

### FloodForecastPins Internal State

```typescript
const [forecasts, setForecasts] = useState<ForecastDay[]>([]);
const [loading, setLoading] = useState(false);
const [selectedDay, setSelectedDay] = useState<string | null>(null);
const markersRef = React.useRef<L.Marker[]>([]);
```

### MapView State

```typescript
const [showFloodForecast, setShowFloodForecast] = useState(false);
```

---

## Toggle Button Behavior

### Initial State

- Icon: ⚠️ (warning emoji)
- Background: Default purple (#451ae0ff)
- Opacity: 0.6 (dimmed)
- Forecast pins: Hidden

### Active State (After Click)

- Icon: ⚠️ (same emoji)
- Background: Orange (#FF8C00)
- Opacity: 1.0 (fully visible)
- Forecast pins: Displayed on map
- Forecast panel: Shown with day selector

### Clicking Again (Toggle Off)

- Icon: ⚠️ (same emoji)
- Background: Purple (#451ae0ff) - back to default
- Opacity: 0.6 (dimmed)
- Forecast pins: Removed from map
- Forecast panel: Hidden

---

## Marker Rendering Details

### Pin HTML Structure

```html
<div class="flood-forecast-pin" style="background-color: #FF8C00">
  <div class="forecast-pin-content">
    <span class="forecast-pin-icon">⚠️</span>
    <span class="confidence-badge">85%</span>
  </div>
</div>
```

### Pin CSS Styling

```css
.flood-forecast-pin {
  width: 45px;
  height: 45px;
  border-radius: 50% 50% 50% 0; /* Teardrop shape */
  transform: rotate(-45deg);
  background-color: #ff8c00; /* Orange */
  border: 3px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
}
```

### Popup HTML

```html
<div class="flood-forecast-popup">
  <h3>Nunez Street</h3>
  <div class="forecast-badge">⚠️ Predicted to Flood</div>
  <div class="forecast-details">
    <div class="detail-row">
      <span class="label">Confidence:</span>
      <span class="value">85%</span>
    </div>
    <div class="detail-row">
      <span class="label">Expected Rainfall:</span>
      <span class="value">12.5mm</span>
    </div>
  </div>
</div>
```

---

## Auto-Refresh Mechanism

```typescript
useEffect(() => {
  if (isVisible) {
    fetchPredictions();

    // Refresh every 60 minutes (3600000 ms)
    const interval = setInterval(fetchPredictions, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }
}, [isVisible]);
```

---

## Error Handling

### Backend Errors

```python
# In routes/flood_forecast.py
try:
    # Fetch and process
except Exception as e:
    logger.error(f"❌ Error generating predictions: {e}")
    raise HTTPException(status_code=500, detail=f"Failed to generate predictions: {str(e)}")
```

### Frontend Errors

```typescript
// In FloodForecastPins.tsx
catch (error) {
  console.error('❌ Error fetching flood predictions:', error);
  // Component gracefully falls back to "No forecasts" state
}
```

---

## Performance Optimizations

1. **Lazy Loading**: Component only fetches when `isVisible=true`
2. **Caching**: Forecast data cached in component state
3. **Limited Road Count**: Processes first 100 roads for performance
4. **Efficient Markers**: Reuses marker array refs
5. **Throttled Refresh**: Only updates once per hour
6. **Async Operations**: Uses `async/await` for non-blocking calls

---

## Browser Console Output

When feature is active, you'll see:

```
🌦️ Fetching flood predictions...
🔍 Flood forecast visibility toggled to TRUE - fetching predictions
✅ Flood predictions fetched: [...]
📍 Adding 12 forecast markers to map
📍 Creating forecast marker 1: Nunez Street (85% confidence)
📍 Creating forecast marker 2: Roxas Avenue (72% confidence)
...
```

---

## Integration Checklist Summary

- [x] Backend route created and registered
- [x] Frontend component created and imported
- [x] State variable added to MapView
- [x] Toggle button created in map controls
- [x] Click handler connects button to state
- [x] Component receives map and visibility props
- [x] Markers render on map when visible
- [x] Day selector UI displays
- [x] CSS styling applied
- [x] Error handling implemented
- [x] Documentation complete

---

## Testing Commands

### Test Backend Endpoint

```bash
# In terminal, with backend running:
curl -X GET http://localhost:8000/api/flood-forecast/predictions

curl -X GET http://localhost:8000/api/flood-forecast/today
```

### Test Frontend

1. Open browser DevTools (F12)
2. Open SafePath application
3. Click the map control menu toggle
4. Click ⚠️ button
5. Watch console for messages
6. Verify orange pins appear on map

---

## Quick Troubleshooting

| Issue                   | Solution                               |
| ----------------------- | -------------------------------------- |
| Button not visible      | Check if map control menu is expanded  |
| No orange pins shown    | Check browser console for fetch errors |
| API error 500           | Verify Open-Meteo API is accessible    |
| Pins not updating       | Check auto-refresh interval (60 min)   |
| Component not rendering | Verify import path is correct          |
| Style not applied       | Clear browser cache, hard refresh      |

---

## Summary

The flood forecast feature is fully integrated at three levels:

1. **Backend API** - Provides weather-based predictions
2. **Frontend Component** - Displays predictions on map
3. **Map Controls** - User can toggle feature on/off

All components work together to provide users with actionable 7-day flood predictions.
