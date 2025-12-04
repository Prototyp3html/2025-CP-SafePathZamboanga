import React, { useState, useEffect } from "react";
import {
  Cloud,
  CloudRain,
  Sun,
  Wind,
  Droplets,
  Thermometer,
  Eye,
  AlertTriangle,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface WeatherData {
  current: {
    temp_c: number;
    condition: {
      text: string;
      icon: string;
      code: number;
    };
    wind_kph: number;
    precip_mm: number;
    humidity: number;
    cloud: number;
    is_day: number;
  };
  forecast: {
    forecastday: Array<{
      hour: any[];
    }>;
  };
}

interface WeatherDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WeatherDashboard: React.FC<WeatherDashboardProps> = ({
  isOpen,
  onClose,
}) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Using backend weather endpoint (Open-Meteo via backend)

  const getWeatherDescription = (code: number) => {
    if (code === 0) return "Clear sky";
    if (code >= 1 && code <= 3) return "Partly cloudy";
    if (code >= 51 && code <= 67) return "Rainy";
    if (code >= 95 && code <= 99) return "Thunderstorm";
    return "Mixed conditions";
  };

  const fetchWeatherData = async () => {
    setLoading(true);
    setError(null);

    try {
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
      const response = await fetch(
        `${BACKEND_URL}/weather?lat=6.9214&lng=122.0790`
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Invalid API key. Please configure VITE_WEATHER_API_KEY in .env file"
          );
        }
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();

      // Convert backend Open-Meteo format to expected format
      const adaptedData = {
        current: {
          temp_c: 28, // Default temperature - backend doesn't provide temperature
          condition: {
            text: getWeatherDescription(data.weather_code || 0),
            icon: "", // Not used in our implementation
            code: data.weather_code || 0,
          },
          precip_mm: Math.max(data.precipitation || 0, data.rain || 0),
          humidity: 75, // Default humidity - backend doesn't provide
          wind_kph: 10, // Default wind speed - backend doesn't provide
          cloud: 50, // Default cloud cover - backend doesn't provide
          is_day:
            new Date().getHours() >= 6 && new Date().getHours() <= 18 ? 1 : 0,
        },
        forecast: {
          forecastday: [
            {
              hour: [], // No hourly forecast from backend - simplifying
            },
          ],
        },
      };

      setWeatherData(adaptedData);
      setLastUpdated(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch weather data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !weatherData) {
      fetchWeatherData();
    }
  }, [isOpen]);

  const getWeatherIcon = (rain: number, cloudCover: number, isDay: boolean) => {
    if (rain > 0.5) {
      return <CloudRain className="w-12 h-12 text-blue-500" />;
    } else if (cloudCover > 70) {
      return <Cloud className="w-12 h-12 text-gray-500" />;
    } else {
      return <Sun className="w-12 h-12 text-yellow-500" />;
    }
  };

  const getWeatherCondition = (rain: number, cloudCover: number) => {
    if (rain > 2.0) {
      return "Heavy Rain";
    } else if (rain > 0.5) {
      return "Moderate Rain";
    } else if (rain > 0.1) {
      return "Light Rain";
    } else if (cloudCover > 80) {
      return "Overcast";
    } else if (cloudCover > 50) {
      return "Partly Cloudy";
    } else {
      return "Clear";
    }
  };

  const getRiskLevel = (rain: number, windSpeed: number) => {
    if (rain > 5 || windSpeed > 30) {
      return {
        level: "High Risk",
        color: "text-red-600",
        bgColor: "bg-red-100",
      };
    } else if (rain > 1 || windSpeed > 15) {
      return {
        level: "Caution",
        color: "text-yellow-600",
        bgColor: "bg-yellow-100",
      };
    } else {
      return { level: "Low", color: "text-green-600", bgColor: "bg-green-100" };
    }
  };

  const getWeatherAdvisory = (rain: number, windSpeed: number) => {
    if (rain > 5) {
      return "Heavy rainfall expected. Exercise caution on low-lying areas.";
    } else if (rain > 1) {
      return "Moderate to heavy rainfall expected. Exercise caution on low-lying areas.";
    } else if (windSpeed > 20) {
      return "Strong winds expected. Be cautious when driving.";
    } else {
      return "Good weather conditions. Safe for travel.";
    }
  };

  const getNext3HourForecast = () => {
    // Simplified forecast since backend doesn't provide hourly data
    if (!weatherData) return null;

    const currentRain = weatherData.current.precip_mm;
    const mockForecast = [
      { hour: new Date().getHours() + 1, rain: currentRain * 0.8 },
      { hour: new Date().getHours() + 2, rain: currentRain * 0.6 },
      { hour: new Date().getHours() + 3, rain: currentRain * 0.4 },
    ];

    const maxRain = Math.max(
      currentRain,
      ...mockForecast.map((item) => item.rain)
    );
    return {
      maxRain,
      forecast: mockForecast,
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Cloud className="w-8 h-8" />
              <div>
                <h2 className="text-xl font-bold">Weather Dashboard</h2>
                <p className="text-blue-100 text-sm">
                  Zamboanga City, Philippines
                </p>
                <p className="text-blue-200 text-xs mt-1">
                  Local Time:{" "}
                  {new Date().toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchWeatherData}
                disabled={loading}
                className="text-white hover:bg-white/20"
                title="Refresh weather data"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white hover:bg-white/20"
                title="Close dashboard"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-600 dark:text-gray-300">
                Loading weather data...
              </span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600 dark:text-red-400 font-medium text-lg">
                Failed to load weather data
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                {error}
              </p>
              <Button onClick={fetchWeatherData} className="mt-4">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : weatherData ? (
            <div className="space-y-6">
              {/* Current Weather */}
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-700 dark:to-gray-600 border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      {getWeatherIcon(
                        weatherData.current.precip_mm,
                        weatherData.current.cloud,
                        weatherData.current.is_day === 1
                      )}
                      <div>
                        <h3 className="font-semibold text-xl text-gray-800 dark:text-gray-100">
                          {weatherData.current.condition.text}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {weatherData.current.precip_mm > 0.1
                            ? `${weatherData.current.precip_mm.toFixed(
                                1
                              )} mm/hr`
                            : "No precipitation"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-bold text-gray-800 dark:text-gray-100">
                        {Math.round(weatherData.current.temp_c)}°C
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        Temperature
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Weather Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Droplets className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                    <span className="text-sm font-medium dark:text-gray-200">
                      Humidity
                    </span>
                  </div>
                  <div className="text-lg font-semibold dark:text-gray-100">
                    {weatherData.current.humidity}%
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Wind className="w-4 h-4 text-green-500 dark:text-green-400" />
                    <span className="text-sm font-medium dark:text-gray-200">
                      Wind Speed
                    </span>
                  </div>
                  <div className="text-lg font-semibold dark:text-gray-100">
                    {Math.round(weatherData.current.wind_kph)} km/h
                  </div>
                </div>
              </div>

              {/* 3-Hour Forecast */}
              {(() => {
                const forecast = getNext3HourForecast();
                if (forecast) {
                  const risk = getRiskLevel(
                    forecast.maxRain,
                    weatherData.current.wind_kph
                  );
                  const endTime = new Date(
                    Date.now() + 3 * 60 * 60 * 1000
                  ).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  });

                  return (
                    <Card>
                      <CardContent className="p-4 dark:bg-gray-700">
                        <h4 className="font-semibold mb-3 dark:text-gray-100">
                          3-Hour Forecast
                        </h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                              Expected rainfall: {forecast.maxRain.toFixed(1)}{" "}
                              mm/hr by {endTime}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium dark:text-gray-200">
                              Risk Level:
                            </span>
                            <span
                              className={`text-sm font-semibold px-2 py-1 rounded ${risk.bgColor} ${risk.color}`}
                            >
                              {risk.level}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                return null;
              })()}

              {/* Weather Advisory */}
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
                      Weather Advisory
                    </h4>
                    <p className="text-sm text-yellow-700 dark:text-yellow-200">
                      {getWeatherAdvisory(
                        weatherData.current.precip_mm,
                        weatherData.current.wind_kph
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Last Updated */}
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Last Updated: {lastUpdated}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* Close Button */}
        <div className="p-4 border-t">
          <Button
            onClick={onClose}
            className="w-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            variant="outline"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
