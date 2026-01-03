/**
 * Flood Forecast Pin Component - ENHANCED
 * Displays predicted flood zones with major road pins and interactive radius analysis
 * - Major roads only: Pins show primary/trunk/highway roads that will flood
 * - Pulsing radius: Circle shows flood impact zone for each day
 * - Hover analysis: Move mouse within radius to see flood percentage by distance
 */

import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import './FloodForecastPins.css';
import { API_URL } from '@/config/api';

interface PredictedFloodPin {
  road_id: string;
  road_name: string;
  confidence: number;
  highway_type: string;
  is_major_road: boolean;
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
  const [hoverInfo, setHoverInfo] = useState<{
    distance: number;
    floodPercent: number;
    position: { x: number; y: number };
  } | null>(null);
  
  const markersRef = React.useRef<L.Marker[]>([]);
  const circlesRef = React.useRef<L.Circle[]>([]);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);

  // Fetch flood predictions
  useEffect(() => {
    const fetchPredictions = async () => {
      setLoading(true);
      try {
        console.log('🌦️ Fetching flood predictions from:', `${API_URL}/api/flood-forecast/predictions`);
        const response = await fetch(`${API_URL}/api/flood-forecast/predictions`);
        const data = await response.json();
        
        console.log('📊 Forecast API Response:', data);
        
        if (data.status === 'success') {
          console.log('✅ Flood predictions fetched:', data.predictions);
          
          // Count total major roads across all days
          const totalMajorRoads = data.predictions.reduce(
            (sum: number, day: ForecastDay) => sum + day.predicted_flooded_roads.filter((r: PredictedFloodPin) => r.is_major_road).length,
            0
          );
          console.log(`📍 Total major roads predicted to flood: ${totalMajorRoads}`);
          
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

  // Add/remove markers and radius circles from map
  useEffect(() => {
    if (!map) {
      console.warn('⚠️ Map is not available yet');
      return;
    }

    if (!isVisible) {
      console.log('📍 Removing flood forecast visualization (isVisible=false)');
      // Remove all markers
      markersRef.current.forEach(marker => map.removeLayer(marker));
      markersRef.current = [];
      // Remove all circles
      circlesRef.current.forEach(circle => map.removeLayer(circle));
      circlesRef.current = [];
      return;
    }

    // Clear existing markers and circles
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];
    circlesRef.current.forEach(circle => map.removeLayer(circle));
    circlesRef.current = [];

    // Get predictions for selected day
    const selectedForecast = forecasts.find(f => f.date === selectedDay);
    
    if (!selectedForecast || selectedForecast.predicted_flooded_roads.length === 0) {
      console.log('📍 No predicted floods for selected day');
      return;
    }

    // Filter major roads only
    const majorRoads = selectedForecast.predicted_flooded_roads.filter(road => road.is_major_road);
    const otherRoads = selectedForecast.predicted_flooded_roads.filter(road => !road.is_major_road);

    console.log(`📍 Major roads: ${majorRoads.length}, Other roads: ${otherRoads.length}`);

    // Get center point (average of all roads)
    const center = majorRoads.length > 0 ? {
      lat: majorRoads.reduce((sum, r) => sum + r.location.lat, 0) / majorRoads.length,
      lon: majorRoads.reduce((sum, r) => sum + r.location.lon, 0) / majorRoads.length
    } : {
      lat: selectedForecast.predicted_flooded_roads[0].location.lat,
      lon: selectedForecast.predicted_flooded_roads[0].location.lon
    };

    // Calculate radius based on rainfall (more rain = larger impact zone)
    // 10mm = 500m radius, 20mm = 1000m radius, 30mm = 1500m radius
    const baseRadius = 500 + (selectedForecast.rainfall_mm * 50);
    const maxRadius = Math.min(baseRadius, 2000); // Cap at 2km

    // Add pulsing radius circle
    const radiusCircle = L.circle(
      [center.lat, center.lon],
      {
        radius: maxRadius,
        color: '#FF8C00',
        weight: 2,
        opacity: 0.3,
        fillColor: '#FF8C00',
        fillOpacity: 0.05,
        dashArray: '5, 5',
        className: 'flood-forecast-radius'
      }
    );
    radiusCircle.addTo(map);
    circlesRef.current.push(radiusCircle);

    // Add center point marker
    const centerIcon = L.divIcon({
      html: `
        <div class="flood-forecast-center">
          <div class="center-pulse"></div>
        </div>
      `,
      className: 'flood-forecast-center-icon',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -30]
    });

    const centerMarker = L.marker([center.lat, center.lon], { icon: centerIcon });
    const centerPopup = `
      <div class="flood-forecast-popup">
        <h3>⚠️ Flood Impact Zone</h3>
        <div class="forecast-details">
          <div class="detail-row">
            <span class="label">Impact Radius:</span>
            <span class="value">${(maxRadius / 1000).toFixed(1)}km</span>
          </div>
          <div class="detail-row">
            <span class="label">Expected Rainfall:</span>
            <span class="value">${selectedForecast.rainfall_mm}mm</span>
          </div>
          <div class="detail-row">
            <span class="label">Major Roads Affected:</span>
            <span class="value">${majorRoads.length}</span>
          </div>
          <div class="detail-row">
            <span class="label">Total Affected Roads:</span>
            <span class="value">${selectedForecast.predicted_flooded_roads.length}</span>
          </div>
        </div>
        <div class="popup-tip">
          💡 Hover in the radius zone to see flood risk by distance
        </div>
      </div>
    `;
    centerMarker.bindPopup(centerPopup, { maxWidth: 300 });
    centerMarker.addTo(map);
    markersRef.current.push(centerMarker);

    // Add markers for MAJOR ROADS only
    console.log(`📍 Adding ${majorRoads.length} major road markers to map`);
    majorRoads.forEach((pin, index) => {
      console.log(`📍 Creating major road marker ${index + 1}: ${pin.road_name} (${pin.confidence}% confidence)`);

      // Create custom icon - Red for major roads
      const icon = L.divIcon({
        html: `
          <div class="flood-forecast-pin major-road-pin" style="background-color: #DC143C">
            <div class="forecast-pin-content">
              <span class="forecast-pin-icon">🛣️</span>
              <span class="confidence-badge">${pin.confidence}%</span>
            </div>
          </div>
        `,
        className: 'flood-forecast-icon major-road-icon',
        iconSize: [50, 50],
        iconAnchor: [25, 50],
        popupAnchor: [0, -50]
      });

      // Create marker
      const marker = L.marker(
        [pin.location.lat, pin.location.lon],
        { icon }
      );

      // Create popup content
      const popupContent = `
        <div class="flood-forecast-popup">
          <h3>🛣️ Major Road</h3>
          <div class="road-name">${pin.road_name}</div>
          <div class="forecast-badge major-road">
            <strong>⚠️ Will Flood</strong>
          </div>
          <div class="forecast-details">
            <div class="detail-row">
              <span class="label">Road Type:</span>
              <span class="value">${pin.highway_type}</span>
            </div>
            <div class="detail-row">
              <span class="label">Flood Confidence:</span>
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
            ⚠️ CRITICAL: Major road closure likely - use alternative routes
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

    // Add hover listener to radius circle for interactive flood analysis
    radiusCircle.on('mousemove', (e: any) => {
      const mousePoint = e.latlng;
      const distance = map.latLngToLayerPoint([center.lat, center.lon]).distanceTo(
        map.latLngToLayerPoint([mousePoint.lat, mousePoint.lng])
      );
      
      // Convert pixel distance to meters (approximate)
      // At zoom level ~15, 1 pixel ≈ ~1.2 meters
      const zoomScale = 40075016.686 / Math.pow(2, map.getZoom() + 8);
      const distanceMeters = distance * zoomScale;

      // Calculate flood percentage based on distance from center
      // At center (0m): 100% flood risk
      // At radius edge: 20% flood risk (some areas still affected)
      // Formula: 100 - (distance/radius * 80)
      const floodPercent = Math.max(
        20,
        100 - (distanceMeters / maxRadius * 80)
      );

      setHoverInfo({
        distance: distanceMeters,
        floodPercent: Math.round(floodPercent),
        position: { x: e.originalEvent.clientX, y: e.originalEvent.clientY }
      });
    });

    radiusCircle.on('mouseleave', () => {
      setHoverInfo(null);
    });

  }, [map, isVisible, selectedDay, forecasts]);

  // Day selector UI
  const daysWithForecasts = forecasts.filter(f => f.predicted_flooded_roads.length > 0);

  return (
    <>
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
                  <p className="selector-label">Select day to view impact zone:</p>
                  <div className="day-buttons">
                    {daysWithForecasts.map((forecast) => {
                      const majorRoadCount = forecast.predicted_flooded_roads.filter(r => r.is_major_road).length;
                      return (
                        <button
                          key={forecast.date}
                          className={`day-btn ${selectedDay === forecast.date ? 'active' : ''}`}
                          onClick={() => setSelectedDay(forecast.date)}
                          title={`${forecast.rainfall_mm}mm expected - ${majorRoadCount} major roads`}
                        >
                          <span className="date">
                            {new Date(forecast.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </span>
                          <span className="rainfall">{forecast.rainfall_mm}mm</span>
                          <span className="count">
                            {majorRoadCount > 0 ? `${majorRoadCount} major` : 'No major roads'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedDay && (
                  <div className="forecast-summary">
                    <div className="summary-stat">
                      <span className="stat-label">Major Roads:</span>
                      <span className="stat-value">
                        {forecasts.find(f => f.date === selectedDay)?.predicted_flooded_roads.filter(r => r.is_major_road).length || 0}
                      </span>
                    </div>
                    <div className="summary-stat">
                      <span className="stat-label">Total Affected:</span>
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

                <div className="forecast-legend">
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#DC143C' }}></div>
                    <span>Major Road (Highway/Trunk)</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color" style={{ backgroundColor: '#FF8C00' }}></div>
                    <span>Flood Impact Zone</span>
                  </div>
                  <div className="legend-tip">
                    💡 Hover in radius zone to see distance-based flood %
                  </div>
                </div>
              </>
            ) : (
              <div className="no-forecasts">
                <p>✅ No major roads predicted to flood</p>
                <p className="sub-text">
                  {forecasts.length === 0 
                    ? '⏳ Loading forecast data...' 
                    : 'Current weather conditions are safe. Monitor as forecast updates.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover analysis tooltip */}
      {hoverInfo && (
        <div
          ref={tooltipRef}
          className="flood-hover-tooltip"
          style={{
            left: `${hoverInfo.position.x + 15}px`,
            top: `${hoverInfo.position.y - 60}px`
          }}
        >
          <div className="tooltip-title">Flood Analysis</div>
          <div className="tooltip-row">
            <span className="tooltip-label">Distance:</span>
            <span className="tooltip-value">{(hoverInfo.distance / 1000).toFixed(2)}km</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Flood Risk:</span>
            <span className="tooltip-value" style={{
              color: hoverInfo.floodPercent > 70 ? '#DC143C' : hoverInfo.floodPercent > 40 ? '#FF8C00' : '#90EE90'
            }}>
              {hoverInfo.floodPercent}%
            </span>
          </div>
        </div>
      )}
    </>
  );
}
