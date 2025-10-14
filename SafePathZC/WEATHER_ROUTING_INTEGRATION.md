# Weather-Integrated Routing System

## Overview

SafePathZC now integrates **real-time weather conditions** into route flood risk analysis. The system fetches current weather from WeatherAPI.com and dynamically adjusts flood risk calculations based on:

- Current rainfall intensity
- Wind speed
- Recent weather conditions

## How It Works

### 1. Weather Data Fetching

**Backend Function:** `fetch_zamboanga_weather()` in `main.py`

```python
# Fetches from WeatherAPI.com every route request
weather_data = {
    "temperature_c": 28.5,
    "condition": "Partly cloudy",
    "precipitation_mm": 2.5,  # Current rainfall in mm/hr
    "wind_kph": 15.0,         # Wind speed in km/h
    "humidity": 75,
    "condition_code": 1003
}
```

### 2. Weather Impact Multipliers

**Backend Function:** `analyze_route_flood_risk()` in `services/local_routing.py`

The system applies multipliers to flooded road segments based on weather severity:

| Weather Condition | Precipitation | Multiplier | Impact Level |
| ----------------- | ------------- | ---------- | ------------ |
| **Extreme Rain**  | > 50mm/hr     | 2.5x       | severe       |
| **Heavy Rain**    | 25-50mm/hr    | 2.0x       | high         |
| **Moderate Rain** | 10-25mm/hr    | 1.5x       | moderate     |
| **Light Rain**    | 5-10mm/hr     | 1.2x       | low          |
| **Clear**         | < 5mm/hr      | 1.0x       | none         |

**Wind Impact (additional multiplier):**
| Wind Speed | Additional Multiplier |
|-----------|----------------------|
| > 60 kph | +30% (×1.3) |
| 40-60 kph | +15% (×1.15) |

### 3. Risk Level Adjustment

During heavy weather (`severe` or `high` impact), the system uses **stricter thresholds**:

**Normal Weather Thresholds:**

- Safe: < 20% flooded
- Manageable: 20-50% flooded
- Prone: > 50% flooded

**Heavy Weather Thresholds:**

- Safe: < 10% flooded
- Manageable: 10-30% flooded
- Prone: > 30% flooded

### 4. Example Calculation

**Scenario:** Route with 30% of roads marked as flooded in GeoJSON

**Clear Weather (0mm rain):**

- Multiplier: 1.0x
- Actual flood risk: 30%
- Risk Level: **Manageable**

**Heavy Rain (30mm/hr):**

- Multiplier: 2.0x
- Actual flood risk: 60% (30% × 2.0)
- Risk Level: **Prone** (using strict threshold)

**Extreme Rain + Strong Winds (55mm + 65kph):**

- Multiplier: 3.25x (2.5 × 1.3)
- Actual flood risk: 97.5% (30% × 3.25)
- Risk Level: **Prone**

## API Response Structure

### Route Response (Backend `/route` endpoint)

```json
{
  "routes": [...],
  "analyses": [
    {
      "flood_score": 45.2,
      "flooded_percentage": 45.2,
      "risk_level": "manageable",
      "weather_impact": "moderate",
      "weather_multiplier": 1.5,
      "flooded_distance_m": 2450,
      "safe_distance_m": 3150,
      "segments_analyzed": 142
    }
  ],
  "weather": {
    "condition": "Moderate rain",
    "temperature_c": 26.5,
    "precipitation_mm": 12.3,
    "wind_kph": 25.8,
    "humidity": 85
  },
  "source": "hybrid_osrm_geojson"
}
```

## Benefits

### 1. **Dynamic Safety Assessment**

- Routes that are safe in clear weather may become dangerous during heavy rain
- System automatically adjusts recommendations based on current conditions

### 2. **Real-Time Weather Integration**

- Weather data refreshed on every route request (~1-2 second latency)
- No manual weather input required

### 3. **Accurate Flood Risk Prediction**

- Accounts for current rainfall making already flood-prone areas more dangerous
- Wind conditions add additional safety considerations

### 4. **Coordinated with Alert System**

- Same weather data source as AlertBanner component
- Consistent weather information across frontend and routing

## Console Output Example

```
☁️ Fetching current weather conditions for Zamboanga City...
   Weather: Moderate rain, 12.3mm rain, 25.8kph wind

🔬 Step 2: Analyzing flood risk for 3 routes (with weather impact)...
✅ Route 1: 35.2% flooded, risk: manageable
✅ Route 2: 48.7% flooded, risk: prone
✅ Route 3: 42.1% flooded, risk: manageable

📊 Route analysis: 35.2% flooded (1250m/3550m) - manageable (weather: moderate, 12.3mm rain, 26kph wind)
```

## Frontend Integration (Future Enhancement)

The frontend can display weather-adjusted flood risk:

```typescript
// Example: Display weather impact on route card
if (analysis.weather_impact !== "none") {
  return (
    <div className="weather-warning">
      <i className="fas fa-cloud-rain"></i>
      Flood risk increased by {analysis.weather_multiplier}x due to{" "}
      {analysis.weather_impact} weather
    </div>
  );
}
```

## Technical Details

### Weather API Configuration

- **Provider:** WeatherAPI.com
- **Location:** Zamboanga City, Philippines (6.91°N, 122.07°E)
- **API Key:** Stored in `fetch_zamboanga_weather()` function
- **Timeout:** 10 seconds
- **Fallback:** Safe defaults if API fails (0mm rain, 10kph wind)

### Performance Impact

- **Weather fetch time:** ~500-800ms per request
- **Additional overhead:** Minimal (weather multiplier calculation is O(1))
- **Total route generation time:** Still 2-3 seconds (weather fetch runs during route generation)

### Error Handling

- If WeatherAPI fails, system falls back to safe defaults (clear weather)
- Routes still generated with terrain data only
- Error logged to console with warning message

## Maintenance

### API Key Management

The WeatherAPI key is currently hardcoded. For production:

1. Move to environment variable: `WEATHER_API_KEY=your_key_here`
2. Update `fetch_zamboanga_weather()` to read from `os.getenv("WEATHER_API_KEY")`

### Rate Limits

WeatherAPI.com Free Tier:

- **1 million calls/month** (~380 calls/hour)
- SafePathZC usage: ~10-50 calls/hour (well within limits)

## Future Enhancements

1. **Forecast Integration**

   - Use 3-hour forecast to predict future flood risk
   - Recommend delaying travel if heavy rain expected

2. **Historical Weather Data**

   - Track rainfall over past 24 hours
   - Cumulative rain better predictor of flooding

3. **Weather-Based Route Preferences**

   - Allow users to set weather sensitivity (cautious/normal/aggressive)
   - Adjust multipliers based on user preference

4. **Seasonal Adjustments**
   - Higher multipliers during monsoon season (June-October)
   - Lower multipliers during dry season (November-May)

## Testing

### Manual Testing

1. **Clear Weather:** Navigate from Zamboanga Airport to Downtown

   - Should show normal flood percentages
   - Weather impact: "none"

2. **Simulated Rain:** Temporarily lower threshold in code
   ```python
   if precipitation_mm > 0.1:  # Instead of > 10
       weather_multiplier = 1.5
   ```
   - Flood percentages should increase
   - Weather impact: "moderate"

### Automated Testing

```python
def test_weather_integration():
    # Test with heavy rain
    weather = {"precipitation_mm": 30.0, "wind_kph": 45.0}
    analysis = analyze_route_flood_risk(test_coords, weather_data=weather)

    assert analysis["weather_impact"] == "high"
    assert analysis["weather_multiplier"] == 2.3  # 2.0 * 1.15
    assert analysis["risk_level"] in ["manageable", "prone"]
```

## Implementation Date

**October 14, 2025**

## Contributors

- SafePathZC Development Team
- WeatherAPI.com for real-time weather data
