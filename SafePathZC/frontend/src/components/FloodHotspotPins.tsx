/**
 * Flood Hotspot Pin Component
 * Displays flood-prone area markers on the map
 */

import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { getFloodHotspots, getRiskLevelInfo, getDaysAgoText, type FloodHotspot } from '@/services/floodHistoryService';
import './FloodHotspotPins.css';

interface FloodHotspotPinsProps {
  map: L.Map | null;
  isVisible: boolean;
  onHotspotClick?: (hotspot: FloodHotspot) => void;
}

export function FloodHotspotPins({ map, isVisible, onHotspotClick }: FloodHotspotPinsProps) {
  const [hotspots, setHotspots] = useState<FloodHotspot[]>([]);
  const [loading, setLoading] = useState(false);
  const markersRef = React.useRef<L.Marker[]>([]);

  // Fetch flood hotspots
  useEffect(() => {
    const fetchHotspots = async () => {
      setLoading(true);
      try {
        console.log('🌊 Fetching flood hotspots...');
        const data = await getFloodHotspots(50, 0); // Get top 50 hotspots
        console.log('✅ Fetched hotspots:', data);
        setHotspots(data);
        console.log(`📍 Found ${data.length} flood hotspots`);
      } catch (error) {
        console.error('Error fetching flood hotspots:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isVisible) {
      console.log('🔍 Flood hotspots visibility toggled to TRUE - fetching data');
      fetchHotspots();
      // Refresh every 30 minutes for auto-updated data
      const interval = setInterval(fetchHotspots, 30 * 60 * 1000);
      return () => clearInterval(interval);
    } else {
      console.log('🔍 Flood hotspots visibility toggled to FALSE');
    }
  }, [isVisible]);

  // Add/remove markers from map
  useEffect(() => {
    if (!map) {
      console.warn('⚠️ Map is not available yet');
      return;
    }

    if (!isVisible) {
      console.log('📍 Removing flood hotspot markers (isVisible=false)');
      // Remove all markers
      markersRef.current.forEach(marker => map.removeLayer(marker));
      markersRef.current = [];
      return;
    }

    console.log(`📍 Adding ${hotspots.length} flood hotspot markers to map`);

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Add new markers
    hotspots.forEach((hotspot, index) => {
      const riskInfo = getRiskLevelInfo(hotspot.risk_score);
      
      console.log(`📍 Creating marker ${index + 1}/${hotspots.length}: ${hotspot.road_name} at [${hotspot.location.lat}, ${hotspot.location.lon}]`);

      // Create custom icon
      const icon = L.divIcon({
        html: `
          <div class="flood-hotspot-pin" style="background-color: ${riskInfo.color}">
            <div class="flood-pin-content">
              <span class="flood-pin-icon">💧</span>
            </div>
          </div>
        `,
        className: 'flood-hotspot-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      });

      // Create marker
      const marker = L.marker(
        [hotspot.location.lat, hotspot.location.lon],
        { icon }
      );

      // Create popup content
      const popupContent = `
        <div class="flood-hotspot-popup">
          <h3>${hotspot.road_name}</h3>
          <div class="risk-badge" style="background-color: ${riskInfo.bgColor}; border-left: 4px solid ${riskInfo.color}">
            <strong>Risk Level:</strong> ${riskInfo.level} (${hotspot.risk_score}/100)
          </div>
          <div class="flood-details">
            <div class="detail-row">
              <span class="label">Total Floods:</span>
              <span class="value">${hotspot.flood_history.total_events}</span>
            </div>
            <div class="detail-row">
              <span class="label">Total Hours Flooded:</span>
              <span class="value">${hotspot.flood_history.total_flooded_hours.toFixed(1)}h</span>
            </div>
            <div class="detail-row">
              <span class="label">Avg Duration:</span>
              <span class="value">${hotspot.flood_history.average_duration_hours.toFixed(1)}h</span>
            </div>
            <div class="detail-row">
              <span class="label">Frequency/Year:</span>
              <span class="value">${hotspot.flood_history.frequency_per_year.toFixed(1)} times</span>
            </div>
            <div class="detail-row">
              <span class="label">Last Flooded:</span>
              <span class="value">${getDaysAgoText(hotspot.last_flood.days_since)}</span>
            </div>
            <div class="detail-row">
              <span class="label">First Recorded:</span>
              <span class="value">${new Date(hotspot.first_recorded || '').toLocaleDateString()}</span>
            </div>
          </div>
          <div class="popup-actions">
            <button class="btn-view-history">View Detailed History</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'flood-hotspot-popup-container'
      });

      // Click handler
      marker.on('click', () => {
        if (onHotspotClick) {
          onHotspotClick(hotspot);
        }
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [map, hotspots, isVisible]);

  return (
    <div className="flood-hotspot-pins-info">
      {loading && <div className="loading-text">Loading flood data...</div>}
      {!loading && hotspots.length > 0 && (
        <div className="hotspot-count">
          <strong>💧 Flood Hotspots:</strong> {hotspots.length} areas
        </div>
      )}
      {!loading && hotspots.length === 0 && isVisible && (
        <div className="no-hotspots">No flood hotspots recorded yet</div>
      )}
    </div>
  );
}

export default FloodHotspotPins;
