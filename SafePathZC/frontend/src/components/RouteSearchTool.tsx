import { useState } from 'react';

interface RouteSearchToolProps {
  onRouteSelect: (route: string) => void;
}

export const RouteSearchTool = ({ onRouteSelect }: RouteSearchToolProps) => {
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [terrainSafeMode, setTerrainSafeMode] = useState(false);

  const locations = [
    { name: 'Tetuan Junction', elevation: 8, floodRisk: 15 },
    { name: 'Veterans Avenue', elevation: 4, floodRisk: 25 },
    { name: 'Canelar Road', elevation: 3, floodRisk: 35 },
    { name: 'Governor Camins Avenue', elevation: 12, floodRisk: 8 },
    { name: 'Mayor Jaldon Street', elevation: 7, floodRisk: 18 },
    { name: 'Pilar Street', elevation: 9, floodRisk: 12 },
    { name: 'Don Pablo Lorenzo Street', elevation: 6, floodRisk: 20 },
    { name: 'Valderosa Street', elevation: 11, floodRisk: 10 },
    { name: 'WMSU Campus', elevation: 15, floodRisk: 5 },
    { name: 'Ayala Mall Zamboanga', elevation: 10, floodRisk: 12 },
    { name: 'Downtown Plaza', elevation: 5, floodRisk: 22 },
    { name: 'Zamboanga Airport', elevation: 18, floodRisk: 3 },
    { name: 'Port Area', elevation: 2, floodRisk: 45 },
    { name: 'Tumaga District', elevation: 12, floodRisk: 10 },
    { name: 'Pasonanca Park', elevation: 15, floodRisk: 5 }
  ];

  const getFilteredLocations = (searchTerm: string) => {
    let filtered = locations.filter(location =>
      location.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (terrainSafeMode) {
      // Filter for safer terrain (higher elevation, lower flood risk)
      filtered = filtered.filter(location => location.elevation >= 6 && location.floodRisk <= 20);
    }

    return filtered;
  };

  const getLocationRiskIndicator = (location: any) => {
    if (location.floodRisk > 30) return '🔴';
    if (location.floodRisk > 15) return '🟡';
    return '🟢';
  };

  const handleSearch = () => {
    if (fromLocation.trim() && toLocation.trim()) {
      const route = `${fromLocation} to ${toLocation}`;
      onRouteSelect(route);
      console.log('Planning route:', route);
    }
  };

  const handleLocationSelect = (location: string, type: 'from' | 'to') => {
    if (type === 'from') {
      setFromLocation(location);
      setShowFromDropdown(false);
    } else {
      setToLocation(location);
      setShowToDropdown(false);
    }
  };

  const swapLocations = () => {
    const temp = fromLocation;
    setFromLocation(toLocation);
    setToLocation(temp);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      <h2 className="text-lg font-bold text-wmsu-blue mb-4 flex items-center">
        <i className="fas fa-route mr-2"></i>
        Route Planner
      </h2>

      {/* Terrain Safe Mode Toggle */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={terrainSafeMode}
            onChange={(e) => setTerrainSafeMode(e.target.checked)}
            className="rounded border-gray-300 text-wmsu-blue focus:ring-wmsu-blue"
          />
          <div className="flex items-center space-x-2">
            <i className="fas fa-mountain text-wmsu-blue"></i>
            <span className="text-sm font-medium text-gray-700">Terrain-Safe Routes Only</span>
          </div>
        </label>
        <p className="text-xs text-gray-600 mt-1 ml-6">
          Prioritizes higher elevation routes with lower flood risk
        </p>
      </div>

      {/* From Location */}
      <div className="relative mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
        <div className="flex items-center border-2 border-gray-300 rounded-lg overflow-hidden focus-within:border-wmsu-blue">
          <div className="pl-3">
            <i className="fas fa-circle text-safe-green text-sm"></i>
          </div>
          <input
            type="text"
            value={fromLocation}
            onChange={(e) => {
              setFromLocation(e.target.value);
              setShowFromDropdown(true);
            }}
            onFocus={() => setShowFromDropdown(true)}
            placeholder="Choose starting point"
            className="flex-1 px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {showFromDropdown && fromLocation && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-32 overflow-y-auto">
            {getFilteredLocations(fromLocation).map((location, index) => (
              <button
                key={index}
                onClick={() => handleLocationSelect(location.name, 'from')}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-wmsu-blue transition-colors duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-map-marker-alt mr-2 text-gray-400"></i>
                    {location.name}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{getLocationRiskIndicator(location)}</span>
                    <span>{location.elevation}m</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Swap Button */}
      <div className="flex justify-center mb-3">
        <button
          onClick={swapLocations}
          className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <i className="fas fa-exchange-alt text-gray-600 text-sm"></i>
        </button>
      </div>

      {/* To Location */}
      <div className="relative mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
        <div className="flex items-center border-2 border-gray-300 rounded-lg overflow-hidden focus-within:border-wmsu-blue">
          <div className="pl-3">
            <i className="fas fa-map-marker-alt text-alert-red text-sm"></i>
          </div>
          <input
            type="text"
            value={toLocation}
            onChange={(e) => {
              setToLocation(e.target.value);
              setShowToDropdown(true);
            }}
            onFocus={() => setShowToDropdown(true)}
            placeholder="Choose destination"
            className="flex-1 px-3 py-2 text-sm focus:outline-none"
          />
        </div>

        {showToDropdown && toLocation && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-32 overflow-y-auto">
            {getFilteredLocations(toLocation).map((location, index) => (
              <button
                key={index}
                onClick={() => handleLocationSelect(location.name, 'to')}
                className="block w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-wmsu-blue transition-colors duration-150"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-map-marker-alt mr-2 text-gray-400"></i>
                    {location.name}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{getLocationRiskIndicator(location)}</span>
                    <span>{location.elevation}m</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Button */}
      <button
        onClick={handleSearch}
        disabled={!fromLocation.trim() || !toLocation.trim()}
        className="w-full bg-wmsu-blue text-white py-2 px-4 rounded-lg font-medium hover:bg-wmsu-blue-light transition-colors duration-200 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
      >
        <i className="fas fa-search mr-2"></i>
        Find {terrainSafeMode ? 'Safe ' : ''}Route
      </button>

      {/* Quick Options */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-600 mb-2">Quick Options:</p>
        <div className="flex flex-wrap gap-1">
          <button className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-wmsu-blue hover:text-white transition-all duration-200">
            Avoid Floods
          </button>
          <button className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-wmsu-blue hover:text-white transition-all duration-200">
            High Ground
          </button>
          <button className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-wmsu-blue hover:text-white transition-all duration-200">
            Fastest
          </button>
          <button className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-wmsu-blue hover:text-white transition-all duration-200">
            Safest
          </button>
        </div>
      </div>
    </div>
  );
};