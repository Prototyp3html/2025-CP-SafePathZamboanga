import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const RiskRouteMap = () => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const routeLayersRef = useRef(null);
  const markerLayersRef = useRef(null);

  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [coordinates, setCoordinates] = useState({
    startLat: 6.9214,
    startLng: 122.079,
    endLat: 6.9244,
    endLng: 122.0816,
  });

  // Risk level colors
  const riskColors = {
    Safe: "#28a745",
    Caution: "#ffc107",
    Risky: "#fd7e14",
    Avoid: "#dc3545",
  };

  // Initialize map
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      // Initialize map
      mapInstanceRef.current = L.map(mapRef.current).setView(
        [6.9214, 122.079],
        13
      );

      // Add tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors | SafePathZC Risk Analysis",
        maxZoom: 18,
      }).addTo(mapInstanceRef.current);

      // Initialize layer groups
      routeLayersRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      markerLayersRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Draw risk segments
  const drawRiskSegments = (route) => {
    const segments = route.segments;

    // Group consecutive segments by risk level
    let currentRiskLevel = null;
    let currentSegmentCoords = [];

    segments.forEach((segment, index) => {
      const coord = [segment.lat, segment.lng];

      if (segment.risk_level !== currentRiskLevel) {
        // Draw previous segment if exists
        if (currentSegmentCoords.length > 1 && currentRiskLevel) {
          const polyline = L.polyline(currentSegmentCoords, {
            color: riskColors[currentRiskLevel],
            weight: 6,
            opacity: 0.8,
            lineCap: "round",
          });

          polyline.bindTooltip(
            `<strong>Risk: ${currentRiskLevel}</strong><br>
                         Segments: ${currentSegmentCoords.length}`,
            { sticky: true }
          );

          routeLayersRef.current.addLayer(polyline);
        }

        // Start new segment
        currentRiskLevel = segment.risk_level;
        currentSegmentCoords =
          index > 0 ? [[segments[index - 1].lat, segments[index - 1].lng]] : [];
        currentSegmentCoords.push(coord);
      } else {
        currentSegmentCoords.push(coord);
      }
    });

    // Draw final segment
    if (currentSegmentCoords.length > 1 && currentRiskLevel) {
      const polyline = L.polyline(currentSegmentCoords, {
        color: riskColors[currentRiskLevel],
        weight: 6,
        opacity: 0.8,
        lineCap: "round",
      });

      polyline.bindTooltip(
        `<strong>Risk: ${currentRiskLevel}</strong><br>
                 Segments: ${currentSegmentCoords.length}`,
        { sticky: true }
      );

      routeLayersRef.current.addLayer(polyline);
    }
  };

  // Add risk markers
  const addRiskMarkers = (route) => {
    const highRiskPoints = route.segments.filter((s) =>
      ["Risky", "Avoid"].includes(s.risk_level)
    );

    highRiskPoints.forEach((segment) => {
      const marker = L.circleMarker([segment.lat, segment.lng], {
        color: riskColors[segment.risk_level],
        fillColor: riskColors[segment.risk_level],
        fillOpacity: 0.8,
        radius: 8,
        weight: 3,
      });

      marker.bindPopup(`
                <div style="font-size: 0.9rem; max-width: 200px;">
                    <strong>⚠️ ${segment.risk_level} Risk Point</strong><br>
                    <strong>Location:</strong> ${segment.lat.toFixed(
                      4
                    )}, ${segment.lng.toFixed(4)}<br>
                    <strong>Risk Score:</strong> ${segment.risk_score}/100<br>
                    <strong>Elevation:</strong> ${segment.elevation}m<br>
                    <strong>Slope:</strong> ${segment.slope}%<br>
                    <strong>Rainfall:</strong> ${segment.rainfall_mm}mm/h
                </div>
            `);

      markerLayersRef.current.addLayer(marker);
    });
  };

  // Analyze route
  const analyzeRoute = async () => {
    setLoading(true);

    // Clear previous results
    if (routeLayersRef.current) routeLayersRef.current.clearLayers();
    if (markerLayersRef.current) markerLayersRef.current.clearLayers();

    try {
      const response = await fetch(
        "http://127.0.0.1:8001/api/safe-route-filter",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            start_lat: coordinates.startLat,
            start_lng: coordinates.startLng,
            end_lat: coordinates.endLat,
            end_lng: coordinates.endLng,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRouteData(data);

      // Draw routes
      data.evaluated_routes.forEach((route) => {
        drawRiskSegments(route);
        if (route.id === data.recommended.id) {
          addRiskMarkers(route);
        }
      });

      // Add start/end markers
      const startMarker = L.marker([
        coordinates.startLat,
        coordinates.startLng,
      ]).bindPopup("🚩 Start Location");
      const endMarker = L.marker([
        coordinates.endLat,
        coordinates.endLng,
      ]).bindPopup("🏁 End Location");

      markerLayersRef.current.addLayer(startMarker);
      markerLayersRef.current.addLayer(endMarker);

      // Fit map to route
      const allCoords = data.recommended.segments.map((s) => [s.lat, s.lng]);
      if (allCoords.length > 0) {
        mapInstanceRef.current.fitBounds(allCoords, { padding: [20, 20] });
      }
    } catch (error) {
      console.error("Error analyzing route:", error);
      alert("Error analyzing route: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    return minutes > 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  };

  const getRiskBadgeClass = (level) => {
    const classes = {
      Safe: "bg-green-500",
      Caution: "bg-yellow-500",
      Risky: "bg-orange-500",
      Avoid: "bg-red-500",
    };
    return `${classes[level]} text-white px-2 py-1 rounded text-xs font-medium`;
  };

  return (
    <div className="relative w-full h-full">
      {/* Map Container */}
      <div ref={mapRef} className="w-full h-full" />

      {/* Controls Panel */}
      <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg z-[1000] w-72 border border-gray-100">
        <h3 className="text-lg font-semibold mb-4 text-gray-800 flex items-center gap-2">
          🗺️ Route Analysis
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">
                Start Lat:
              </label>
              <input
                type="number"
                step="0.0001"
                value={coordinates.startLat}
                onChange={(e) =>
                  setCoordinates((prev) => ({
                    ...prev,
                    startLat: parseFloat(e.target.value),
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">
                Start Lng:
              </label>
              <input
                type="number"
                step="0.0001"
                value={coordinates.startLng}
                onChange={(e) =>
                  setCoordinates((prev) => ({
                    ...prev,
                    startLng: parseFloat(e.target.value),
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">
                End Lat:
              </label>
              <input
                type="number"
                step="0.0001"
                value={coordinates.endLat}
                onChange={(e) =>
                  setCoordinates((prev) => ({
                    ...prev,
                    endLat: parseFloat(e.target.value),
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">
                End Lng:
              </label>
              <input
                type="number"
                step="0.0001"
                value={coordinates.endLng}
                onChange={(e) =>
                  setCoordinates((prev) => ({
                    ...prev,
                    endLng: parseFloat(e.target.value),
                  }))
                }
                className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <button
            onClick={analyzeRoute}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
          >
            {loading ? "🔄 Analyzing..." : "🔍 Analyze Route"}
          </button>
        </div>
      </div>

      {/* Risk Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg z-[1000] border border-gray-100">
        <h4 className="text-sm font-semibold mb-3 text-gray-800">
          Risk Levels
        </h4>
        <div className="space-y-2">
          {Object.entries(riskColors).map(([level, color]) => (
            <div key={level} className="flex items-center text-xs">
              <div
                className="w-6 h-3 rounded-sm mr-3 border border-gray-200"
                style={{ backgroundColor: color }}
              ></div>
              <span className="text-gray-700">
                {level}{" "}
                {level === "Safe"
                  ? "(0-24)"
                  : level === "Caution"
                  ? "(25-49)"
                  : level === "Risky"
                  ? "(50-74)"
                  : "(75-100)"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Route Info Panel */}
      {routeData && (
        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg z-[1000] max-w-sm border border-gray-100">
          <h4 className="text-lg font-semibold mb-3 text-gray-800 flex items-center gap-2">
            🏆 Route {routeData.recommended.id.toUpperCase()}
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Distance:</span>
              <span className="font-medium text-gray-800">
                {routeData.recommended.distance.toFixed(2)} km
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Duration:</span>
              <span className="font-medium text-gray-800">
                {formatDuration(routeData.recommended.duration)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Risk Level:</span>
              <span
                className={getRiskBadgeClass(
                  routeData.recommended.overall_level
                )}
              >
                {routeData.recommended.overall_level}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Risk Score:</span>
              <span className="font-medium text-gray-800">
                {routeData.recommended.overall_risk}/100
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RiskRouteMap;
