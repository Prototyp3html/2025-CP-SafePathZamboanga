
import { useState, useEffect } from 'react';

interface InteractiveMapProps {
  selectedRoute: string;
}

export const InteractiveMap = ({ selectedRoute }: InteractiveMapProps) => {
  const [zoomLevel, setZoomLevel] = useState(12);
  const [showWeatherOverlay, setShowWeatherOverlay] = useState(false);
  const [showTerrainOverlay, setShowTerrainOverlay] = useState(false);
  const [selectedTool, setSelectedTool] = useState<'route' | 'zoom' | null>(null);
  const [routePoints, setRoutePoints] = useState<Array<{x: number, y: number, name: string}>>([]);
  const [hoveredLocation, setHoveredLocation] = useState<{name: string, x: number, y: number, elevation: number, slope: number, floodRisk: number} | null>(null);
  const [terrainLoading, setTerrainLoading] = useState(false);

  const mapLocations = [
    { name: 'TETUAN', x: 45, y: 65, type: 'district', elevation: 8, slope: 3, floodRisk: 15 },
    { name: 'TUMAGA', x: 55, y: 35, type: 'district', elevation: 12, slope: 5, floodRisk: 10 },
    { name: 'PASONANCA', x: 35, y: 25, type: 'district', elevation: 15, slope: 7, floodRisk: 5 },
    { name: 'CABATANGAN', x: 25, y: 15, type: 'district', elevation: 18, slope: 8, floodRisk: 3 },
    { name: 'Gov. Ramos Ave', x: 35, y: 55, type: 'street', elevation: 6, slope: 2, floodRisk: 22 },
    { name: 'CANELAR', x: 15, y: 75, type: 'district', elevation: 3, slope: 1, floodRisk: 35 },
    { name: 'SAN JOSE CAWA-CAWA', x: 25, y: 85, type: 'district', elevation: 2, slope: 1, floodRisk: 40 },
    { name: 'Zamboanga', x: 40, y: 95, type: 'city', elevation: 5, slope: 2, floodRisk: 25 },
    { name: 'Veterans Avenue', x: 50, y: 70, type: 'street', elevation: 4, slope: 2, floodRisk: 25 },
  ];

  const getTerrainColor = (elevation: number) => {
    if (elevation <= 5) return 'rgba(173, 216, 230, 0.6)'; // Light blue for 0-5m
    if (elevation <= 10) return 'rgba(144, 238, 144, 0.6)'; // Light green for 5-10m
    return 'rgba(255, 255, 0, 0.6)'; // Yellow for 10+m
  };

  const getFloodRiskColor = (risk: number) => {
    if (risk < 15) return '#10B981'; // Safe green
    if (risk < 30) return '#F59E0B'; // Caution yellow
    return '#EF4444'; // Alert red
  };

  const handleZoomIn = () => {
    if (zoomLevel < 18) setZoomLevel(zoomLevel + 1);
  };

  const handleZoomOut = () => {
    if (zoomLevel > 8) setZoomLevel(zoomLevel - 1);
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (selectedTool === 'route') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      setRoutePoints(prev => [...prev, { x, y, name: `Point ${prev.length + 1}` }]);
    }
  };

  const clearRoute = () => {
    setRoutePoints([]);
  };

  const toggleTerrainOverlay = () => {
    if (!showTerrainOverlay) {
      setTerrainLoading(true);
      // Simulate API call for terrain data
      setTimeout(() => {
        setTerrainLoading(false);
        setShowTerrainOverlay(true);
      }, 2500);
    } else {
      setShowTerrainOverlay(false);
    }
  };

  const handleLocationHover = (location: any) => {
    setHoveredLocation({
      name: location.name,
      x: location.x,
      y: location.y,
      elevation: location.elevation,
      slope: location.slope,
      floodRisk: location.floodRisk
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
            onClick={() => setSelectedTool(selectedTool === 'route' ? null : 'route')}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors duration-200 ${
              selectedTool === 'route'
                ? 'bg-white text-wmsu-blue'
                : 'bg-wmsu-blue-light text-white hover:bg-white hover:text-wmsu-blue'
            }`}
          >
            <i className="fas fa-route mr-1"></i>
            Plan Route
          </button>
          <button
            onClick={() => setShowWeatherOverlay(!showWeatherOverlay)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors duration-200 ${
              showWeatherOverlay
                ? 'bg-white text-wmsu-blue'
                : 'bg-wmsu-blue-light text-white hover:bg-white hover:text-wmsu-blue'
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
                ? 'bg-white text-wmsu-blue'
                : 'bg-wmsu-blue-light text-white hover:bg-white hover:text-wmsu-blue'
            } ${terrainLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {terrainLoading ? (
              <>
                <i className="fas fa-spinner animate-spin mr-1"></i>
                Loading...
              </>
            ) : (
              <>
                <i className="fas fa-mountain mr-1"></i>
                Terrain
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
              <div key={`h-${i}`} className="absolute w-full border-t border-gray-400" style={{ top: `${i * 5}%` }} />
            ))}
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={`v-${i}`} className="absolute h-full border-l border-gray-400" style={{ left: `${i * 5}%` }} />
            ))}
          </div>

          {/* Water bodies */}
          <div className="absolute bottom-0 right-0 w-32 h-24 bg-blue-200 opacity-60 rounded-tl-full"></div>
          <div className="absolute top-10 right-10 w-20 h-16 bg-blue-200 opacity-40 rounded-full"></div>

          {/* Roads */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-400 opacity-60 transform -rotate-12"></div>
          <div className="absolute top-1/3 left-1/4 w-1/2 h-1 bg-gray-400 opacity-60 transform rotate-45"></div>
          <div className="absolute bottom-1/3 left-0 w-3/4 h-1 bg-gray-400 opacity-60 transform rotate-12"></div>

          {/* Terrain Overlay */}
          {showTerrainOverlay && (
            <div className="absolute inset-0 animate-fade-in">
              {mapLocations.map((location, index) => (
                <div
                  key={`terrain-${index}`}
                  className="absolute rounded-full animate-fade-in"
                  style={{
                    left: `${location.x - 8}%`,
                    top: `${location.y - 8}%`,
                    width: '16%',
                    height: '16%',
                    backgroundColor: getTerrainColor(location.elevation),
                    border: `2px solid ${getFloodRiskColor(location.floodRisk)}`,
                  }}
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
              <div className={`text-xs font-medium px-2 py-1 rounded transition-all duration-200 ${
                location.type === 'city' ? 'bg-wmsu-blue text-white text-sm font-bold' :
                location.type === 'district' ? 'bg-white text-gray-800 shadow-sm hover:shadow-lg' :
                'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>
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

          {/* Location Tooltip */}
          {hoveredLocation && (
            <div
              className="absolute bg-white rounded-lg shadow-xl p-3 border border-gray-200 z-30 animate-fade-in"
              style={{
                left: `${hoveredLocation.x + 5}%`,
                top: `${hoveredLocation.y - 10}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="text-sm font-semibold text-gray-800 mb-1">{hoveredLocation.name}</div>
              <div className="text-xs text-gray-600 space-y-1">
                <div>Elevation: {hoveredLocation.elevation}m</div>
                <div>Slope: {hoveredLocation.slope}°</div>
                <div className={`font-medium`} style={{ color: getFloodRiskColor(hoveredLocation.floodRisk) }}>
                  Flood Risk: {hoveredLocation.floodRisk}%
                  {hoveredLocation.elevation <= 5 && ' (Low terrain)'}
                </div>
              </div>
            </div>
          )}

          {/* Weather Overlay */}
          {showWeatherOverlay && (
            <div className="absolute inset-0 bg-blue-500 opacity-20 animate-fade-in">
              <div className="absolute top-1/4 left-1/3 w-20 h-20 bg-blue-600 opacity-40 rounded-full animate-pulse"></div>
              <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-blue-700 opacity-50 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
            </div>
          )}
        </div>

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
        {selectedTool === 'route' && (
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 z-20">
            <div className="text-sm font-medium text-gray-800 mb-2">Route Planning</div>
            <div className="text-xs text-gray-600 mb-2">Click on map to add points</div>
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
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 z-20">
          <h4 className="font-semibold text-gray-800 mb-2 text-sm">Legend</h4>
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-700 mb-1">Risk Levels</div>
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
                <div className="text-xs font-medium text-gray-700 mt-2 mb-1">Terrain Elevation</div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgb(173, 216, 230)' }}></div>
                    <span className="text-xs text-gray-700">0-5m</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgb(144, 238, 144)' }}></div>
                    <span className="text-xs text-gray-700">5-10m</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <span className="text-xs text-gray-700">10+m</span>
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