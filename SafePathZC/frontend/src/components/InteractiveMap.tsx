import { useState, useEffect } from "react";

interface InteractiveMapProps {
  selectedRoute: string;
}

interface ElevationPoint {
  lat: number;
  lng: number;
  elevation: number;
  x: number; // Screen position percentage
  y: number; // Screen position percentage
}

export const InteractiveMap = ({ selectedRoute }: InteractiveMapProps) => {
  const [zoomLevel, setZoomLevel] = useState(12);
  const [showWeatherOverlay, setShowWeatherOverlay] = useState(false);
  const [showTerrainOverlay, setShowTerrainOverlay] = useState(false);
  const [selectedTool, setSelectedTool] = useState<"route" | "zoom" | null>(
    null
  );
  const [routePoints, setRoutePoints] = useState<
    Array<{ x: number; y: number; name: string }>
  >([]);
  const [hoveredLocation, setHoveredLocation] = useState<{
    name: string;
    x: number;
    y: number;
    elevation: number;
    slope: number;
    floodRisk: number;
  } | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(false);
  const [elevationData, setElevationData] = useState<ElevationPoint[]>([]);

  // Zamboanga City bounding box coordinates
  const zamboBounds = {
    north: 6.95,
    south: 6.85,
    east: 122.15,
    west: 122.05,
  };

  const mapLocations = [
    {
      name: "TETUAN",
      x: 45,
      y: 65,
      type: "district",
      elevation: 8,
      slope: 3,
      floodRisk: 15,
      lat: 6.9134,
      lng: 122.0734,
    },
    {
      name: "TUMAGA",
      x: 55,
      y: 35,
      type: "district",
      elevation: 12,
      slope: 5,
      floodRisk: 10,
      lat: 6.9234,
      lng: 122.0834,
    },
    {
      name: "PASONANCA",
      x: 35,
      y: 25,
      type: "district",
      elevation: 15,
      slope: 7,
      floodRisk: 5,
      lat: 6.9334,
      lng: 122.0634,
    },
    {
      name: "CABATANGAN",
      x: 25,
      y: 15,
      type: "district",
      elevation: 18,
      slope: 8,
      floodRisk: 3,
      lat: 6.9434,
      lng: 122.0534,
    },
    {
      name: "Gov. Ramos Ave",
      x: 35,
      y: 55,
      type: "street",
      elevation: 6,
      slope: 2,
      floodRisk: 22,
      lat: 6.9034,
      lng: 122.0634,
    },
    {
      name: "CANELAR",
      x: 15,
      y: 75,
      type: "district",
      elevation: 3,
      slope: 1,
      floodRisk: 35,
      lat: 6.8934,
      lng: 122.0534,
    },
    {
      name: "SAN JOSE CAWA-CAWA",
      x: 25,
      y: 85,
      type: "district",
      elevation: 2,
      slope: 1,
      floodRisk: 40,
      lat: 6.8834,
      lng: 122.0634,
    },
    {
      name: "Zamboanga",
      x: 40,
      y: 95,
      type: "city",
      elevation: 5,
      slope: 2,
      floodRisk: 25,
      lat: 6.9067,
      lng: 122.0734,
    },
    {
      name: "Veterans Avenue",
      x: 50,
      y: 70,
      type: "street",
      elevation: 4,
      slope: 2,
      floodRisk: 25,
      lat: 6.9034,
      lng: 122.0834,
    },
  ];

  // Convert lat/lng to screen coordinates (percentage)
  const latLngToScreenPercent = (lat: number, lng: number) => {
    const x =
      ((lng - zamboBounds.west) / (zamboBounds.east - zamboBounds.west)) * 100;
    const y =
      ((zamboBounds.north - lat) / (zamboBounds.north - zamboBounds.south)) *
      100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  };

  // Fetch elevation data from Open-Elevation API
  const fetchElevationData = async () => {
    try {
      // Generate a grid of coordinates (10x10 grid across Zamboanga City)
      const gridSize = 10;
      const locations = [];

      for (let i = 0; i <= gridSize; i++) {
        for (let j = 0; j <= gridSize; j++) {
          const lat =
            zamboBounds.south +
            (i / gridSize) * (zamboBounds.north - zamboBounds.south);
          const lng =
            zamboBounds.west +
            (j / gridSize) * (zamboBounds.east - zamboBounds.west);
          locations.push({ latitude: lat, longitude: lng });
        }
      }

      // Open-Elevation API endpoint
      const response = await fetch(
        "https://api.open-elevation.com/api/v1/lookup",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locations: locations,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch elevation data");
      }

      const data = await response.json();

      // Convert to our ElevationPoint format with screen coordinates
      const elevationPoints: ElevationPoint[] = data.results.map(
        (result: any) => {
          const screenPos = latLngToScreenPercent(
            result.latitude,
            result.longitude
          );
          return {
            lat: result.latitude,
            lng: result.longitude,
            elevation: result.elevation || 0,
            x: screenPos.x,
            y: screenPos.y,
          };
        }
      );

      setElevationData(elevationPoints);
    } catch (error) {
      console.error("Error fetching elevation data:", error);
      // Fallback to existing mock data if API fails
      const fallbackData: ElevationPoint[] = mapLocations.map((loc) => ({
        lat: loc.lat,
        lng: loc.lng,
        elevation: loc.elevation,
        x: loc.x,
        y: loc.y,
      }));
      setElevationData(fallbackData);
    }
  };

  const getTerrainColor = (elevation: number) => {
    if (elevation <= 5) return "rgba(46, 204, 113, 0.6)"; // Green for 0-5m (safe)
    if (elevation <= 10) return "rgba(241, 196, 15, 0.6)"; // Yellow for 5-10m (moderate)
    if (elevation <= 20) return "rgba(230, 126, 34, 0.6)"; // Orange for 10-20m (elevated)
    return "rgba(231, 76, 60, 0.6)"; // Red for 20m+ (high terrain)
  };

  const getTerrainIntensity = (elevation: number) => {
    // Return size multiplier based on elevation
    if (elevation <= 5) return 0.8;
    if (elevation <= 10) return 1.0;
    if (elevation <= 20) return 1.2;
    return 1.4;
  };

  const getFloodRiskColor = (risk: number) => {
    if (risk < 15) return "#10B981"; // Safe green
    if (risk < 30) return "#F59E0B"; // Caution yellow
    return "#EF4444"; // Alert red
  };

  const handleZoomIn = () => {
    if (zoomLevel < 18) setZoomLevel(zoomLevel + 1);
  };

  const handleZoomOut = () => {
    if (zoomLevel > 8) setZoomLevel(zoomLevel - 1);
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedTool === "route") {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setRoutePoints((prev) => [
        ...prev,
        { x, y, name: `Point ${prev.length + 1}` },
      ]);
    }
  };

  const clearRoute = () => {
    setRoutePoints([]);
  };

  const toggleTerrainOverlay = async () => {
    console.log(
      "🎯 Toggle terrain clicked, current state:",
      showTerrainOverlay
    );
    if (!showTerrainOverlay) {
      setTerrainLoading(true);
      console.log("🔄 Starting terrain loading...");
      // Fetch real elevation data from Open-Elevation API
      await fetchElevationData();
      setTerrainLoading(false);
      setShowTerrainOverlay(true);
      console.log("✅ Terrain overlay enabled");
    } else {
      setShowTerrainOverlay(false);
      console.log("❌ Terrain overlay disabled");
    }
  };

  const handleLocationHover = (location: any) => {
    setHoveredLocation({
      name: location.name,
      x: location.x,
      y: location.y,
      elevation: location.elevation,
      slope: location.slope,
      floodRisk: location.floodRisk,
    });
  };

  const handleLocationLeave = () => {
    setHoveredLocation(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden h-full">
      {/* Map Header */}
      <div className="bg-wmsu-blue text-white p-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          <i className="fas fa-map mr-2"></i>
          Zamboanga City Routes
        </h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() =>
              setSelectedTool(selectedTool === "route" ? null : "route")
            }
            className={`px-3 py-1 rounded text-sm font-medium transition-colors duration-200 ${
              selectedTool === "route"
                ? "bg-white text-wmsu-blue"
                : "bg-wmsu-blue-light text-white hover:bg-white hover:text-wmsu-blue"
            }`}
          >
            <i className="fas fa-route mr-1"></i>
            Plan Route
          </button>
          <button
            onClick={() => setShowWeatherOverlay(!showWeatherOverlay)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors duration-200 ${
              showWeatherOverlay
                ? "bg-white text-wmsu-blue"
                : "bg-wmsu-blue-light text-white hover:bg-white hover:text-wmsu-blue"
            }`}
          >
            <i className="fas fa-cloud-rain mr-1"></i>
            Weather
          </button>
          <button
            onClick={toggleTerrainOverlay}
            disabled={terrainLoading}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors duration-200 ${
              showTerrainOverlay
                ? "bg-white text-wmsu-blue"
                : "bg-wmsu-blue-light text-white hover:bg-white hover:text-wmsu-blue"
            } ${terrainLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {terrainLoading ? (
              <>
                <i className="fas fa-spinner animate-spin mr-1"></i>
                Loading Terrain...
              </>
            ) : showTerrainOverlay ? (
              <>
                <i className="fas fa-mountain mr-1"></i>
                Hide Terrain
              </>
            ) : (
              <>
                <i className="fas fa-mountain mr-1"></i>
                Show Terrain
              </>
            )}
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div
        className="relative h-96 lg:h-[600px] bg-gradient-to-br from-blue-50 to-green-50 cursor-crosshair"
        onClick={handleMapClick}
      >
        {/* Base Map Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-100 via-blue-50 to-green-100">
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-10">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute w-full border-t border-gray-400"
                style={{ top: `${i * 5}%` }}
              />
            ))}
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute h-full border-l border-gray-400"
                style={{ left: `${i * 5}%` }}
              />
            ))}
          </div>

          {/* Water bodies */}
          <div className="absolute bottom-0 right-0 w-32 h-24 bg-blue-200 opacity-60 rounded-tl-full"></div>
          <div className="absolute top-10 right-10 w-20 h-16 bg-blue-200 opacity-40 rounded-full"></div>

          {/* Roads */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-400 opacity-60 transform -rotate-12"></div>
          <div className="absolute top-1/3 left-1/4 w-1/2 h-1 bg-gray-400 opacity-60 transform rotate-45"></div>
          <div className="absolute bottom-1/3 left-0 w-3/4 h-1 bg-gray-400 opacity-60 transform rotate-12"></div>

          {/* Enhanced Terrain Overlay with Real Elevation Data */}
          {showTerrainOverlay && (
            <div className="absolute inset-0 animate-fade-in">
              {/* DEBUG: Simple test overlay */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50">
                🏔️ TERRAIN OVERLAY ACTIVE - Points: {elevationData.length}
              </div>

              {/* Terrain Grid Points */}
              {elevationData.map((point, index) => {
                const intensity = getTerrainIntensity(point.elevation);
                const size = 12 * intensity; // Fixed size in pixels for perfect circles
                return (
                  <div
                    key={`terrain-grid-${index}`}
                    className="absolute rounded-full transition-all duration-300 hover:scale-125 cursor-pointer"
                    style={{
                      left: `calc(${point.x}% - ${size / 2}px)`,
                      top: `calc(${point.y}% - ${size / 2}px)`,
                      width: `${size}px`,
                      height: `${size}px`,
                      backgroundColor: getTerrainColor(point.elevation),
                      border: `2px solid ${getTerrainColor(
                        point.elevation
                      ).replace("0.6", "0.9")}`,
                      zIndex: 5,
                    }}
                    onMouseEnter={() =>
                      setHoveredLocation({
                        name: `Grid Point`,
                        x: point.x,
                        y: point.y,
                        elevation: point.elevation,
                        slope: 0,
                        floodRisk: 0,
                      })
                    }
                    onMouseLeave={handleLocationLeave}
                    title={`Elevation: ${point.elevation}m`}
                  />
                );
              })}

              {/* Location-based terrain overlay (for known locations) */}
              {mapLocations.map((location, index) => (
                <div
                  key={`terrain-location-${index}`}
                  className="absolute rounded-full animate-fade-in border-2 cursor-pointer hover:scale-110 transition-all duration-300"
                  style={{
                    left: `calc(${location.x}% - 30px)`,
                    top: `calc(${location.y}% - 30px)`,
                    width: "60px",
                    height: "60px",
                    backgroundColor: getTerrainColor(location.elevation),
                    borderColor: getFloodRiskColor(location.floodRisk),
                    zIndex: 10,
                  }}
                  onMouseEnter={() => handleLocationHover(location)}
                  onMouseLeave={handleLocationLeave}
                />
              ))}
            </div>
          )}

          {/* Location Labels */}
          {mapLocations.map((location, index) => (
            <div
              key={location.name}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer"
              style={{ left: `${location.x}%`, top: `${location.y}%` }}
              onMouseEnter={() => handleLocationHover(location)}
              onMouseLeave={handleLocationLeave}
            >
              <div
                className={`text-xs font-medium px-2 py-1 rounded transition-all duration-200 ${
                  location.type === "city"
                    ? "bg-wmsu-blue text-white text-sm font-bold"
                    : location.type === "district"
                    ? "bg-white text-gray-800 shadow-sm hover:shadow-lg"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {location.name}
              </div>
            </div>
          ))}

          {/* Route Points and Lines */}
          {routePoints.map((point, index) => (
            <div key={index}>
              <div
                className="absolute w-3 h-3 bg-wmsu-blue rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 z-10"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
              {index > 0 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-5">
                  <line
                    x1={`${routePoints[index - 1].x}%`}
                    y1={`${routePoints[index - 1].y}%`}
                    x2={`${point.x}%`}
                    y2={`${point.y}%`}
                    stroke="#1e40af"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                  />
                </svg>
              )}
            </div>
          ))}

          {/* Enhanced Location Tooltip */}
          {hoveredLocation && (
            <div
              className="absolute bg-white rounded-lg shadow-xl p-3 border border-gray-200 z-30 animate-fade-in min-w-[140px]"
              style={{
                left: `${Math.min(hoveredLocation.x + 5, 85)}%`,
                top: `${Math.max(hoveredLocation.y - 15, 5)}%`,
                transform:
                  hoveredLocation.x > 85 ? "translateX(-100%)" : "none",
              }}
            >
              <div className="text-sm font-semibold text-gray-800 mb-1">
                {hoveredLocation.name === "Grid Point"
                  ? `Elevation Point`
                  : hoveredLocation.name}
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                <div className="font-medium text-blue-600">
                  Elevation: {hoveredLocation.elevation}m
                </div>
                {hoveredLocation.name !== "Grid Point" && (
                  <>
                    <div>Slope: {hoveredLocation.slope}°</div>
                    <div
                      className={`font-medium`}
                      style={{
                        color: getFloodRiskColor(hoveredLocation.floodRisk),
                      }}
                    >
                      Flood Risk: {hoveredLocation.floodRisk}%
                      {hoveredLocation.elevation <= 5 && " (Low terrain)"}
                    </div>
                  </>
                )}
                <div className="text-xs text-gray-500 border-t border-gray-100 pt-1 mt-1">
                  {hoveredLocation.elevation <= 5 && "🟢 Low elevation"}
                  {hoveredLocation.elevation > 5 &&
                    hoveredLocation.elevation <= 10 &&
                    "🟡 Moderate elevation"}
                  {hoveredLocation.elevation > 10 &&
                    hoveredLocation.elevation <= 20 &&
                    "🟠 Elevated terrain"}
                  {hoveredLocation.elevation > 20 && "🔴 High terrain"}
                </div>
              </div>
            </div>
          )}

          {/* Weather Overlay */}
          {showWeatherOverlay && (
            <div className="absolute inset-0 bg-blue-500 opacity-20 animate-fade-in">
              <div className="absolute top-1/4 left-1/3 w-20 h-20 bg-blue-600 opacity-40 rounded-full animate-pulse"></div>
              <div
                className="absolute top-1/2 right-1/4 w-16 h-16 bg-blue-700 opacity-50 rounded-full animate-pulse"
                style={{ animationDelay: "1s" }}
              ></div>
            </div>
          )}
        </div>

        {/* Terrain Loading Indicator */}
        {terrainLoading && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-4 z-30">
            <div className="flex items-center space-x-3">
              <i className="fas fa-mountain text-wmsu-blue text-xl animate-pulse"></i>
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  Loading Terrain Data
                </div>
                <div className="text-xs text-gray-600">
                  Fetching elevation from Open-Elevation API...
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Map Controls */}
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg z-20">
          <button
            onClick={handleZoomIn}
            className="block w-10 h-10 text-wmsu-blue hover:bg-gray-100 transition-colors duration-200 border-b border-gray-200 rounded-t-lg"
          >
            <i className="fas fa-plus"></i>
          </button>
          <div className="px-2 py-1 text-xs text-center border-b border-gray-200 bg-gray-50">
            {zoomLevel}x
          </div>
          <button
            onClick={handleZoomOut}
            className="block w-10 h-10 text-wmsu-blue hover:bg-gray-100 transition-colors duration-200 rounded-b-lg"
          >
            <i className="fas fa-minus"></i>
          </button>
        </div>

        {/* Route Controls */}
        {selectedTool === "route" && (
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-20">
            <div className="text-sm font-medium text-gray-800 mb-2">
              Route Planning
            </div>
            <div className="text-xs text-gray-600 mb-2">
              Click on map to add points
            </div>
            <div className="flex space-x-2">
              <button
                onClick={clearRoute}
                className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
              >
                Clear
              </button>
              <div className="text-xs text-gray-600 py-1">
                Points: {routePoints.length}
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Legend */}
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-20 max-w-xs">
          <h4 className="font-semibold text-gray-800 mb-2 text-sm">Legend</h4>
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700 mb-1">
              Risk Levels
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-safe-green"></div>
                <span className="text-xs text-gray-700">Safe</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-caution-yellow"></div>
                <span className="text-xs text-gray-700">Caution</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full bg-alert-red"></div>
                <span className="text-xs text-gray-700">High Risk</span>
              </div>
            </div>
            {showTerrainOverlay && (
              <>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="text-xs font-medium text-gray-700 mb-1">
                    Terrain Elevation
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="flex items-center space-x-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "rgb(46, 204, 113)" }}
                      ></div>
                      <span className="text-gray-700">0-5m</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "rgb(241, 196, 15)" }}
                      ></div>
                      <span className="text-gray-700">5-10m</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "rgb(230, 126, 34)" }}
                      ></div>
                      <span className="text-gray-700">10-20m</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: "rgb(231, 76, 60)" }}
                      ></div>
                      <span className="text-gray-700">20m+</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-2 italic border-t border-gray-100 pt-1">
                    Data: Open-Elevation API
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
