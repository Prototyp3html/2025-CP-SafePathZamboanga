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
}

export function FloodHotspotPins({ map, isVisible }: FloodHotspotPinsProps) {
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

      // Determine flood risk description based on risk score
      const getRiskDescription = (riskScore: number): string => {
        if (riskScore >= 90) return "Extremely flood-prone area";
        if (riskScore >= 70) return "Highly flood-prone area";
        if (riskScore >= 50) return "Frequently floods during heavy rain";
        if (riskScore >= 30) return "Moderately flood-prone area";
        if (riskScore >= 15) return "Occasionally experiences flooding";
        return "Rarely floods";
      };

      // Create popup content showing flood risk description
      const riskDescription = getRiskDescription(hotspot.risk_score);
      const popupContent = `
        <div class="flood-hotspot-popup">
          <h3>${hotspot.road_name}</h3>
          <div class="flood-risk-description">
            <span class="risk-icon">⚠️</span>
            <strong>${riskDescription}</strong>
          </div>
          <div class="flood-stats">
            <small>Risk Level: ${hotspot.risk_score.toFixed(0)}/100</small><br>
            <small>Flood History: ${hotspot.flood_history.total_events} events</small>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'flood-hotspot-popup-container'
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
