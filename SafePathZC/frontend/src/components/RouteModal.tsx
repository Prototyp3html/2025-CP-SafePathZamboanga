
import { useState } from 'react';

interface RouteModalProps {
  onClose: () => void;
}

export const RouteModal = ({ onClose }: RouteModalProps) => {
  const [startLocation, setStartLocation] = useState('');
  const [endLocation, setEndLocation] = useState('');
  const [routeOptions, setRouteOptions] = useState<string[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const handlePlanRoute = () => {
    if (startLocation && endLocation) {
      // Simulate route planning
      const options = [
        `${startLocation} → Veterans Ave → ${endLocation} (12 min, Safe)`,
        `${startLocation} → Tetuan Junction → ${endLocation} (15 min, Caution - Light Traffic)`,
        `${startLocation} → Governor Camins Ave → ${endLocation} (18 min, Safe - Recommended)`
      ];
      setRouteOptions(options);
      console.log('Route planned from', startLocation, 'to', endLocation);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 animate-scale-in">
        {/* Modal Header */}
        <div className="bg-wmsu-blue text-white p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center">
              <i className="fas fa-compass mr-2"></i>
              Plan Your Route
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {/* Location Inputs */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-map-marker-alt text-safe-green mr-1"></i>
                From (Starting Point)
              </label>
              <input
                type="text"
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                placeholder="Enter starting location"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <i className="fas fa-map-marker-alt text-alert-red mr-1"></i>
                To (Destination)
              </label>
              <input
                type="text"
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
                placeholder="Enter destination"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none"
              />
            </div>
          </div>

          {/* Plan Route Button */}
          <button
            onClick={handlePlanRoute}
            disabled={!startLocation || !endLocation}
            className="w-full bg-wmsu-blue text-white py-3 px-4 rounded-lg font-medium hover:bg-wmsu-blue-light transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
          >
            <i className="fas fa-route mr-2"></i>
            Find Best Routes
          </button>

          {/* Route Options */}
          {routeOptions.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Available Routes</h4>
              <div className="space-y-3">
                {routeOptions.map((route, index) => (
                  <div
                    key={index}
                    className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedRoute === route
                        ? 'border-wmsu-blue bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedRoute(route)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm text-gray-700">{route}</p>
                      </div>
                      <div className="ml-2">
                        {route.includes('Safe') && (
                          <span className="px-2 py-1 bg-safe-green text-white text-xs rounded-full">
                            Safe
                          </span>
                        )}
                        {route.includes('Caution') && (
                          <span className="px-2 py-1 bg-caution-yellow text-white text-xs rounded-full">
                            Caution
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
            >
              Cancel
            </button>
            {selectedRoute && (
              <button
                onClick={() => {
                  console.log('Selected route:', selectedRoute);
                  onClose();
                }}
                className="flex-1 bg-wmsu-blue text-white py-2 px-4 rounded-lg font-medium hover:bg-wmsu-blue-light transition-colors duration-200"
              >
                Start Navigation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};