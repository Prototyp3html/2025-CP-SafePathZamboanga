/**
 * Flood Forecast Pin Component
 * Displays predicted flood areas for the next 7 days based on weather forecast
 * Orange pins = Areas predicted to flood in the next 7 days
 */

import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import './FloodForecastPins.css';

interface PredictedFloodPin {
  road_id: string;
  road_name: string;
  confidence: number;
  location: {
    lat: number;
    lon: number;
  };
  date?: string;
}

interface ForecastDay {
  date: string;
  rainfall_mm: number;
  predicted_flooded_roads: PredictedFloodPin[];
}

interface FloodForecastPinsProps {
  map: L.Map | null;
  isVisible: boolean;
}

export function FloodForecastPins({ map, isVisible }: FloodForecastPinsProps) {
  const [forecasts, setForecasts] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const markersRef = React.useRef<L.Marker[]>([]);

  // Fetch flood predictions
  useEffect(() => {
    const fetchPredictions = async () => {
      setLoading(true);
      try {
        console.log('🌦️ Fetching flood predictions...');
        const response = await fetch('/api/flood-forecast/predictions');
        const data = await response.json();
        
        console.log('📊 Forecast API Response:', data);
        
        if (data.status === 'success') {
          console.log('✅ Flood predictions fetched:', data.predictions);
          
          // Count total predicted roads across all days
          const totalRoads = data.predictions.reduce(
            (sum: number, day: ForecastDay) => sum + day.predicted_flooded_roads.length,
            0
          );
          console.log(`📍 Total roads predicted to flood: ${totalRoads}`);
          
          setForecasts(data.predictions);
          
          // Set default to first day with predictions or first day overall
          const firstDayWithFloods = data.predictions.find(
            (day: ForecastDay) => day.predicted_flooded_roads.length > 0
          );
          if (firstDayWithFloods) {
            setSelectedDay(firstDayWithFloods.date);
            console.log(`📅 Selected first day with predictions: ${firstDayWithFloods.date}`);
          } else if (data.predictions.length > 0) {
            setSelectedDay(data.predictions[0].date);
            console.log(`📅 No predictions found, showing first day: ${data.predictions[0].date}`);
          }
        } else {
          console.error('❌ API returned error:', data);
        }
      } catch (error) {
        console.error('❌ Error fetching flood predictions:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      console.log('🔍 Flood forecast visibility toggled to TRUE - fetching predictions');
      fetchPredictions();
      // Refresh every hour as forecast updates
      const interval = setInterval(fetchPredictions, 60 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      console.log('🔍 Flood forecast visibility toggled to FALSE');
    }
  }, [isVisible]);

  // Add/remove markers from map
  useEffect(() => {
    if (!map) {
      console.warn('⚠️ Map is not available yet');
      return;
    }

    if (!isVisible) {
      console.log('📍 Removing flood forecast markers (isVisible=false)');
      // Remove all markers
      markersRef.current.forEach(marker => map.removeLayer(marker));
      markersRef.current = [];
      return;
    }

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Get predictions for selected day
    const selectedForecast = forecasts.find(f => f.date === selectedDay);
    
    if (!selectedForecast || selectedForecast.predicted_flooded_roads.length === 0) {
      console.log('📍 No predicted floods for selected day');
      return;
    }

    console.log(`📍 Adding ${selectedForecast.predicted_flooded_roads.length} forecast markers to map`);

    // Add markers for predicted floods
    selectedForecast.predicted_flooded_roads.forEach((pin, index) => {
      console.log(`📍 Creating forecast marker ${index + 1}: ${pin.road_name} (${pin.confidence}% confidence)`);

      // Create custom icon - Orange for predicted floods
      const icon = L.divIcon({
        html: `
          <div class="flood-forecast-pin" style="background-color: #FF8C00">
            <div class="forecast-pin-content">
              <span class="forecast-pin-icon">⚠️</span>
              <span class="confidence-badge">${pin.confidence}%</span>
            </div>
          </div>
        `,
        className: 'flood-forecast-icon',
        iconSize: [45, 45],
        iconAnchor: [22, 45],
        popupAnchor: [0, -45]
      });

      // Create marker
      const marker = L.marker(
        [pin.location.lat, pin.location.lon],
        { icon }
      );

      // Create popup content
      const popupContent = `
        <div class="flood-forecast-popup">
          <h3>${pin.road_name}</h3>
          <div class="forecast-badge">
            <strong>⚠️ Predicted to Flood</strong>
          </div>
          <div class="forecast-details">
            <div class="detail-row">
              <span class="label">Confidence:</span>
              <span class="value">${pin.confidence}%</span>
            </div>
            <div class="detail-row">
              <span class="label">Forecast Date:</span>
              <span class="value">${new Date(pin.date || selectedDay).toLocaleDateString()}</span>
            </div>
            <div class="detail-row">
              <span class="label">Expected Rainfall:</span>
              <span class="value">${selectedForecast.rainfall_mm}mm</span>
            </div>
          </div>
          <div class="popup-warning">
            ⚠️ Consider alternative routes for this area
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'flood-forecast-popup-container'
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });

  }, [map, isVisible, selectedDay, forecasts]);

  // Day selector UI
  const daysWithForecasts = forecasts.filter(f => f.predicted_flooded_roads.length > 0);

  return (
    <div className="flood-forecast-container">
      {isVisible && (
        <div className="flood-forecast-panel">
          <div className="forecast-header">
            <h3>🌦️ 7-Day Flood Predictions</h3>
            {loading && <span className="loading-spinner">⏳</span>}
          </div>

          {daysWithForecasts.length > 0 ? (
            <>
              <div className="day-selector">
                <p className="selector-label">Select day to view predictions:</p>
                <div className="day-buttons">
                  {daysWithForecasts.map((forecast) => (
                    <button
                      key={forecast.date}
                      className={`day-btn ${selectedDay === forecast.date ? 'active' : ''}`}
                      onClick={() => setSelectedDay(forecast.date)}
                      title={`${forecast.rainfall_mm}mm expected`}
                    >
                      <span className="date">
                        {new Date(forecast.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <span className="rainfall">{forecast.rainfall_mm}mm</span>
                      <span className="count">
                        {forecast.predicted_flooded_roads.length} roads
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDay && (
                <div className="forecast-summary">
                  <div className="summary-stat">
                    <span className="stat-label">Predicted Flooded Roads:</span>
                    <span className="stat-value">
                      {forecasts.find(f => f.date === selectedDay)?.predicted_flooded_roads.length || 0}
                    </span>
                  </div>
                  <div className="summary-stat">
                    <span className="stat-label">Expected Rainfall:</span>
                    <span className="stat-value">
                      {forecasts.find(f => f.date === selectedDay)?.rainfall_mm || 0}mm
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="no-forecasts">
              <p>✅ No floods predicted for the next 7 days</p>
              <p className="sub-text">
                {forecasts.length === 0 
                  ? '⏳ Loading forecast data...' 
                  : 'Current weather conditions are safe. Monitor as forecast updates.'}
              </p>
              {!loading && forecasts.length > 0 && (
                <div className="forecast-summary" style={{ marginTop: '12px' }}>
                  <div className="summary-stat" style={{ fontSize: '12px' }}>
                    <span className="stat-label">7-Day Summary:</span>
                    <span className="stat-value">{forecasts.length} days analyzed</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
