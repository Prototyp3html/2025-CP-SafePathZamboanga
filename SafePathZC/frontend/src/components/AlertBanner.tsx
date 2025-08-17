import { useState, useEffect } from 'react';

export const AlertBanner = () => {
  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: 'flood',
      severity: 'high',
      message: 'Flood Alert: Avoid Canelar Road – Low Elevation Risk (3m elevation)',
      action: 'View Terrain'
    },
    {
      id: 2,
      type: 'weather',
      severity: 'moderate',
      message: 'Heavy Rain Warning: Exercise caution in low-lying areas below 5m elevation',
      action: 'See Safe Routes'
    },
    {
      id: 3,
      type: 'terrain',
      severity: 'moderate',
      message: 'Terrain Advisory: Veterans Avenue low elevation (4m) - 25% flood risk',
      action: 'Use Detour'
    }
  ]);

  const [currentAlert, setCurrentAlert] = useState(0);
  const [showBanner, setShowBanner] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-alert-red';
      case 'moderate': return 'bg-alert-orange';
      case 'low': return 'bg-caution-yellow';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityIcon = (type: string) => {
    switch (type) {
      case 'flood': return 'fas fa-water';
      case 'weather': return 'fas fa-cloud-rain';
      case 'traffic': return 'fas fa-car';
      case 'terrain': return 'fas fa-mountain';
      default: return 'fas fa-exclamation-triangle';
    }
  };

  useEffect(() => {
    if (alerts.length > 1) {
      const interval = setInterval(() => {
        setCurrentAlert((prev) => (prev + 1) % alerts.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [alerts.length]);

  if (!showBanner || alerts.length === 0) {
    return null;
  }

  const alert = alerts[currentAlert];

  return (
    <>
      {/* Alert Banner */}
      <div className={`${getSeverityColor(alert.severity)} animate-slide-in relative z-40`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center space-x-3 flex-1">
              <i className={`${getSeverityIcon(alert.type)} text-white text-lg animate-pulse`}></i>
              <span className="text-white font-bold text-base">{alert.message}</span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowDetails(true)}
                className="text-white hover:text-gray-200 font-medium text-sm underline transition-colors duration-200"
              >
                {alert.action}
              </button>

              {alerts.length > 1 && (
                <div className="flex space-x-1">
                  {alerts.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                        index === currentAlert ? 'bg-white' : 'bg-white bg-opacity-50'
                      }`}
                    />
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowBanner(false)}
                className="text-white hover:text-gray-200 text-lg transition-colors duration-200"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in">
            <div className={`${getSeverityColor(alert.severity)} text-white p-4 rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center">
                  <i className={`${getSeverityIcon(alert.type)} mr-2`}></i>
                  Alert Details
                </h3>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-white hover:text-gray-200 transition-colors duration-200"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-gray-700 mb-4">{alert.message}</p>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <h4 className="font-semibold text-gray-800 mb-2">Recommended Actions:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Use alternative high-ground routes when possible</li>
                  <li>• Check terrain elevation before planning routes</li>
                  <li>• Allow extra travel time during weather alerts</li>
                  <li>• Avoid areas below 5m elevation during heavy rain</li>
                  <li>• Report flooding in low-lying areas to authorities</li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDetails(false)}
                  className="flex-1 bg-wmsu-blue text-white py-2 px-4 rounded-lg font-medium hover:bg-wmsu-blue-light transition-colors duration-200"
                >
                  Got it
                </button>
                <button
                  onClick={() => {
                    setShowDetails(false);
                    // Implement terrain-safe route planning
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
                >
                  Find Safe Route
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};