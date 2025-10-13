import { useState, useEffect } from 'react';

interface WeatherAlert {
  id: number;
  type: 'flood' | 'weather' | 'traffic' | 'terrain';
  severity: 'high' | 'moderate' | 'low';
  message: string;
  action: string;
}

export const AlertBanner = () => {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [currentAlert, setCurrentAlert] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInitialPopup, setShowInitialPopup] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState<'safe' | 'risk'>('safe');
  const [currentWeather, setCurrentWeather] = useState<string>('');

  // WeatherAPI.com configuration
  const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY || "11b60f9fe8df4418a12152441251310";
  const LOCATION = "Zamboanga City, Philippines";

  // Fetch live weather data and generate alerts
  const fetchWeatherAlerts = async () => {
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(LOCATION)}&days=1&aqi=no&alerts=yes`
      );

      if (!response.ok) {
        console.error('Weather API failed:', response.status);
        setLoading(false);
        return;
      }

      const data = await response.json();
      const generatedAlerts: WeatherAlert[] = [];

      // Extract weather conditions
      const current = data.current;
      const forecast = data.forecast?.forecastday?.[0];
      
      // Store current weather for initial popup
      setCurrentWeather(`${current.condition.text}, ${current.temp_c}°C`);
      
      // Check for heavy rain (>10mm/hr is heavy, >50mm/hr is extreme)
      if (current.precip_mm > 10) {
        const severity = current.precip_mm > 50 ? 'high' : current.precip_mm > 25 ? 'moderate' : 'low';
        generatedAlerts.push({
          id: 1,
          type: 'weather',
          severity: severity,
          message: `Heavy Rain Alert: ${current.precip_mm.toFixed(1)}mm/hr rainfall detected - Exercise caution in low-lying areas`,
          action: 'View Safe Routes'
        });
      }

      // Check for strong winds (>40 kph is strong, >60 kph is very strong)
      if (current.wind_kph > 40) {
        const severity = current.wind_kph > 60 ? 'high' : 'moderate';
        generatedAlerts.push({
          id: 2,
          type: 'weather',
          severity: severity,
          message: `Strong Wind Warning: ${current.wind_kph.toFixed(0)} kph winds - Use caution on exposed roads`,
          action: 'Check Wind Map'
        });
      }

      // Check weather condition codes for storms/severe weather
      // WeatherAPI condition codes: 1087=Thunderstorm, 1273-1282=Thunder conditions
      if (current.condition.code >= 1087 && current.condition.code <= 1282) {
        generatedAlerts.push({
          id: 3,
          type: 'weather',
          severity: 'high',
          message: `Storm Alert: ${current.condition.text} - Avoid travel if possible`,
          action: 'View Shelters'
        });
      }

      // Check hourly forecast for incoming heavy rain
      if (forecast?.hour) {
        const nextHours = forecast.hour.slice(new Date().getHours(), new Date().getHours() + 3);
        const maxRainChance = Math.max(...nextHours.map(h => h.chance_of_rain));
        const maxPrecip = Math.max(...nextHours.map(h => h.precip_mm));

        if (maxRainChance > 70 && maxPrecip > 5) {
          generatedAlerts.push({
            id: 4,
            type: 'weather',
            severity: 'moderate',
            message: `Rain Expected: ${maxRainChance}% chance of ${maxPrecip.toFixed(1)}mm rain in next 3 hours`,
            action: 'Plan Routes'
          });
        }
      }

      // Check for flood risk conditions (heavy recent rain)
      if (current.precip_mm > 5) {
        generatedAlerts.push({
          id: 5,
          type: 'flood',
          severity: current.precip_mm > 20 ? 'high' : 'moderate',
          message: 'Flood Risk: Recent heavy rainfall - Avoid Canelar Road and low-elevation areas (below 5m)',
          action: 'View Terrain'
        });
      }

      // Update alerts state
      setAlerts(generatedAlerts);
      setShowBanner(generatedAlerts.length > 0);
      setWeatherStatus(generatedAlerts.length > 0 ? 'risk' : 'safe');
      setLoading(false);

      // Show initial popup on first load only
      if (loading) {
        setShowInitialPopup(true);
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowInitialPopup(false);
        }, 5000);
      }

      console.log(`Weather Alert System: ${generatedAlerts.length} active alerts`);
      
    } catch (error) {
      console.error('Failed to fetch weather alerts:', error);
      setLoading(false);
    }
  };

  // Fetch weather data on mount and every 10 minutes
  useEffect(() => {
    fetchWeatherAlerts();
    
    const interval = setInterval(() => {
      fetchWeatherAlerts();
    }, 10 * 60 * 1000); // Update every 10 minutes

    return () => clearInterval(interval);
  }, []);

  // Rotate through alerts every 5 seconds if multiple exist
  useEffect(() => {
    if (alerts.length > 1) {
      const interval = setInterval(() => {
        setCurrentAlert((prev) => (prev + 1) % alerts.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [alerts.length]);

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

  // Don't show banner if loading or no alerts
  if (loading) {
    return null;
  }

  const alert = alerts.length > 0 ? alerts[currentAlert] : null;

  return (
    <>
      {/* Alert Banner - Only show if there are alerts */}
      {showBanner && alert && (
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
      )}

      {/* Alert Details Modal */}
      {showDetails && alert && (
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
                  {alert.type === 'weather' && alert.severity === 'high' && (
                    <>
                      <li>• Delay non-essential travel until weather improves</li>
                      <li>• If traveling, use main roads with better drainage</li>
                      <li>• Keep emergency contact numbers accessible</li>
                      <li>• Monitor weather updates regularly</li>
                    </>
                  )}
                  {alert.type === 'weather' && alert.severity === 'moderate' && (
                    <>
                      <li>• Allow extra travel time for your journey</li>
                      <li>• Use caution in low-visibility conditions</li>
                      <li>• Keep headlights on even during daytime</li>
                      <li>• Avoid overtaking in wet conditions</li>
                    </>
                  )}
                  {alert.type === 'flood' && (
                    <>
                      <li>• Avoid areas below 5m elevation during/after rain</li>
                      <li>• Never attempt to drive through flooded roads</li>
                      <li>• Use SafePath's terrain view for route planning</li>
                      <li>• Report flooding to local authorities (911)</li>
                      <li>• Keep to higher elevation routes when possible</li>
                    </>
                  )}
                  {(alert.type === 'terrain' || (!alert.type)) && (
                    <>
                      <li>• Use alternative high-ground routes when possible</li>
                      <li>• Check terrain elevation before planning routes</li>
                      <li>• Allow extra travel time during weather alerts</li>
                      <li>• Avoid areas below 5m elevation during heavy rain</li>
                    </>
                  )}
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
                    // Refresh page to show route planning with current alert context
                    window.location.reload();
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
                >
                  {alert.type === 'flood' ? 'View Terrain Map' : 'Plan Safe Route'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Initial Weather Status Popup */}
      {showInitialPopup && (
        <div className={`${
          weatherStatus === 'safe' 
            ? 'bg-green-500' 
            : 'bg-alert-orange'
        } animate-slide-in relative z-40`}>
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center space-x-3 flex-1">
                <i className={`${
                  weatherStatus === 'safe' 
                    ? 'fas fa-check-circle' 
                    : 'fas fa-exclamation-triangle'
                } text-white text-lg animate-pulse`}></i>
                <span className="text-white font-bold text-base">
                  {weatherStatus === 'safe' 
                    ? `Weather Status: Safe - ${currentWeather} - Good conditions for travel` 
                    : `Weather Alert: ${alerts.length} active ${alerts.length === 1 ? 'alert' : 'alerts'} detected in Zamboanga City`}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                {weatherStatus === 'risk' && (
                  <button
                    onClick={() => {
                      setShowInitialPopup(false);
                      setShowDetails(true);
                    }}
                    className="text-white hover:text-gray-200 font-medium text-sm underline transition-colors duration-200"
                  >
                    View Details
                  </button>
                )}

                <button
                  onClick={() => setShowInitialPopup(false)}
                  className="text-white hover:text-gray-200 text-lg transition-colors duration-200"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};