
import { useState, useEffect } from 'react';

export const WeatherDashboard = () => {
  const [currentWeather, setCurrentWeather] = useState({
    condition: 'Moderate Rain',
    intensity: '15 mm/hr',
    forecast: 'Increasing to 20 mm/hr by 10 AM',
    temperature: '26°C',
    humidity: '85%',
    windSpeed: '12 km/h'
  });

  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const refreshWeather = () => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLastUpdated(new Date());
      setLoading(false);
      console.log('Weather data refreshed');
    }, 1000);
  };

  useEffect(() => {
    // Auto-refresh every 5 minutes
    const interval = setInterval(refreshWeather, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getWeatherIcon = () => {
    if (currentWeather.condition.includes('Rain')) {
      return 'fas fa-cloud-rain';
    } else if (currentWeather.condition.includes('Cloud')) {
      return 'fas fa-cloud';
    } else {
      return 'fas fa-sun';
    }
  };

  const getRiskLevel = () => {
    const intensity = parseInt(currentWeather.intensity);
    if (intensity > 25) return { level: 'High', color: 'text-alert-red' };
    if (intensity > 15) return { level: 'Moderate', color: 'text-alert-orange' };
    return { level: 'Low', color: 'text-safe-green' };
  };

  const risk = getRiskLevel();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-wmsu-blue">
          <i className="fas fa-cloud-rain mr-2"></i>
          Weather Dashboard
        </h2>
        <button
          onClick={refreshWeather}
          disabled={loading}
          className="text-wmsu-blue hover:text-wmsu-blue-light transition-colors duration-200 disabled:opacity-50"
        >
          <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`}></i>
        </button>
      </div>

      {/* Current Weather */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-3">
            <i className={`${getWeatherIcon()} text-3xl text-wmsu-blue`}></i>
            <div>
              <h3 className="text-lg font-bold text-gray-800">{currentWeather.condition}</h3>
              <p className="text-2xl font-bold text-wmsu-blue">{currentWeather.intensity}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-800">{currentWeather.temperature}</p>
            <p className="text-sm text-gray-600">Temperature</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-blue-200">
          <div>
            <p className="text-sm text-gray-600">Humidity</p>
            <p className="font-semibold text-gray-800">{currentWeather.humidity}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Wind Speed</p>
            <p className="font-semibold text-gray-800">{currentWeather.windSpeed}</p>
          </div>
        </div>
      </div>

      {/* 3-Hour Forecast */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <h4 className="font-semibold text-gray-800 mb-2">3-Hour Forecast</h4>
        <p className="text-gray-700">{currentWeather.forecast}</p>
        <div className="mt-2">
          <span className="text-sm text-gray-600">Risk Level: </span>
          <span className={`font-bold ${risk.color}`}>{risk.level}</span>
        </div>
      </div>

      {/* Weather Alerts */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
        <div className="flex items-center">
          <i className="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
          <div>
            <h4 className="font-semibold text-yellow-800">Weather Advisory</h4>
            <p className="text-sm text-yellow-700">
              Moderate to heavy rainfall expected. Exercise caution on low-lying areas.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-4 text-center">
        Last updated: {lastUpdated.toLocaleTimeString()}
      </p>
    </div>
  );
};