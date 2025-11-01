import { useState, useEffect } from "react";

interface WeatherAlert {
  id: number;
  type: "flood" | "weather" | "traffic" | "terrain";
  severity: "high" | "moderate" | "low";
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
  const [weatherStatus, setWeatherStatus] = useState<"safe" | "risk">("safe");
  const [currentWeather, setCurrentWeather] = useState<string>("");

  // WeatherAPI.com configuration
  const WEATHER_API_KEY =
    import.meta.env.VITE_WEATHER_API_KEY || "11b60f9fe8df4418a12152441251310";
  const LOCATION = "Zamboanga City, Philippines";

  // Add CSS animations
  const alertStyles = `
    @keyframes slideInDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes scaleIn {
      from {
        transform: scale(0.9);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }
    
    @keyframes progress {
      from { width: 0%; }
      to { width: 100%; }
    }

    @keyframes dissolve {
      0% { 
        transform: scale(1) rotateZ(0deg);
        opacity: 1;
        filter: blur(0px);
      }
      50% { 
        transform: scale(1.2) rotateZ(90deg);
        opacity: 0.7;
        filter: blur(1px);
      }
      100% { 
        transform: scale(0.8) rotateZ(180deg);
        opacity: 0.3;
        filter: blur(2px);
      }
    }

    @keyframes liquidMelt {
      0% {
        border-radius: 0.5rem;
        transform: scaleY(1);
      }
      25% {
        border-radius: 0.5rem 0.5rem 50% 50%;
        transform: scaleY(0.8);
      }
      50% {
        border-radius: 50%;
        transform: scaleY(0.6) scaleX(1.1);
      }
      75% {
        border-radius: 50% 50% 30% 30%;
        transform: scaleY(0.3) scaleX(1.3);
      }
      100% {
        border-radius: 0;
        transform: scaleY(0.1) scaleX(2);
        opacity: 0;
      }
    }

    @keyframes particleBurst {
      0% {
        box-shadow: 
          0 0 0 0 rgba(255,255,255,0.8),
          0 0 0 0 rgba(255,255,255,0.6),
          0 0 0 0 rgba(255,255,255,0.4);
      }
      25% {
        box-shadow: 
          -8px -8px 0 2px rgba(255,255,255,0.6),
          8px -8px 0 2px rgba(255,255,255,0.4),
          0px 8px 0 2px rgba(255,255,255,0.3);
      }
      50% {
        box-shadow: 
          -15px -15px 0 4px rgba(255,255,255,0.3),
          15px -15px 0 4px rgba(255,255,255,0.2),
          0px 15px 0 4px rgba(255,255,255,0.1);
      }
      100% {
        box-shadow: 
          -25px -25px 0 6px rgba(255,255,255,0),
          25px -25px 0 6px rgba(255,255,255,0),
          0px 25px 0 6px rgba(255,255,255,0);
        transform: scale(0);
        opacity: 0;
      }
    }
    
    .animate-slide-in {
      animation: slideInDown 0.5s ease-out;
    }
    
    .animate-fade-in {
      animation: fadeIn 0.3s ease-out;
    }
    
    .animate-scale-in {
      animation: scaleIn 0.3s ease-out;
    }

    .close-btn-unique {
      position: relative;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.2);
    }

    .close-btn-unique:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.05);
    }

    .close-btn-unique:active {
      animation: dissolve 0.4s ease-out forwards;
    }

    .close-btn-liquid {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .close-btn-liquid:hover {
      background: rgba(255, 255, 255, 0.35);
      transform: scale(1.1);
    }

    .close-btn-liquid:active {
      animation: liquidMelt 0.6s ease-out forwards;
    }

    .close-btn-burst {
      transition: all 0.2s ease;
    }

    .close-btn-burst:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: scale(1.08);
    }

    .close-btn-burst:active {
      animation: particleBurst 0.5s ease-out forwards;
    }

    .close-icon-fade {
      transition: all 0.2s ease;
    }

    .close-btn-unique:hover .close-icon-fade {
      opacity: 0.8;
      transform: scale(0.9);
    }

    /* Responsive banner styles */
    .alert-banner-responsive {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      width: 100vw;
      min-width: 100vw;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .alert-banner-content {
      width: 100%;
      min-width: 100vw;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-sizing: border-box;
      margin: 0;
    }

    @media (max-width: 640px) {
      .alert-banner-responsive {
        min-height: auto;
      }
    }

    /* Ensure full coverage at all zoom levels */
    @media screen and (min-width: 1px) {
      .alert-banner-responsive {
        width: 100vw !important;
        min-width: 100vw !important;
        left: 0 !important;
        right: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }
      
      .alert-banner-content {
        width: 100% !important;
        min-width: 100vw !important;
        max-width: none !important;
      }
    }

    /* Force full width at extreme zoom levels */
    @media screen and (max-width: 5000px) {
      .alert-banner-responsive {
        transform: none !important;
        width: 100vw !important;
        position: fixed !important;
      }
    }
  `;

  // Inject styles
  if (typeof document !== "undefined") {
    const styleElement = document.createElement("style");
    styleElement.textContent = alertStyles;
    if (!document.head.querySelector("style[data-alert-styles]")) {
      styleElement.setAttribute("data-alert-styles", "");
      document.head.appendChild(styleElement);
    }
  }

  // Fetch live weather data and generate alerts
  const fetchWeatherAlerts = async () => {
    try {
      const response = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(
          LOCATION
        )}&days=1&aqi=no&alerts=yes`
      );

      if (!response.ok) {
        console.error("Weather API failed:", response.status);
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
        const severity =
          current.precip_mm > 50
            ? "high"
            : current.precip_mm > 25
            ? "moderate"
            : "low";
        generatedAlerts.push({
          id: 1,
          type: "weather",
          severity: severity,
          message: `Heavy Rain Alert: ${current.precip_mm.toFixed(
            1
          )}mm/hr rainfall detected - Exercise caution in low-lying areas`,
          action: "View Safe Routes",
        });
      }

      // Check for strong winds (>40 kph is strong, >60 kph is very strong)
      if (current.wind_kph > 40) {
        const severity = current.wind_kph > 60 ? "high" : "moderate";
        generatedAlerts.push({
          id: 2,
          type: "weather",
          severity: severity,
          message: `Strong Wind Warning: ${current.wind_kph.toFixed(
            0
          )} kph winds - Use caution on exposed roads`,
          action: "Check Wind Map",
        });
      }

      // Check weather condition codes for storms/severe weather
      // WeatherAPI condition codes: 1087=Thunderstorm, 1273-1282=Thunder conditions
      if (current.condition.code >= 1087 && current.condition.code <= 1282) {
        generatedAlerts.push({
          id: 3,
          type: "weather",
          severity: "high",
          message: `Storm Alert: ${current.condition.text} - Avoid travel if possible`,
          action: "View Shelters",
        });
      }

      // Check hourly forecast for incoming heavy rain
      if (forecast?.hour) {
        const nextHours = forecast.hour.slice(
          new Date().getHours(),
          new Date().getHours() + 3
        );
        const maxRainChance = Math.max(
          ...nextHours.map((h) => h.chance_of_rain)
        );
        const maxPrecip = Math.max(...nextHours.map((h) => h.precip_mm));

        if (maxRainChance > 70 && maxPrecip > 5) {
          generatedAlerts.push({
            id: 4,
            type: "weather",
            severity: "moderate",
            message: `Rain Expected: ${maxRainChance}% chance of ${maxPrecip.toFixed(
              1
            )}mm rain in next 3 hours`,
            action: "Plan Routes",
          });
        }
      }

      // Check for flood risk conditions (heavy recent rain)
      if (current.precip_mm > 5) {
        generatedAlerts.push({
          id: 5,
          type: "flood",
          severity: current.precip_mm > 20 ? "high" : "moderate",
          message:
            "Flood Risk: Recent heavy rainfall - Avoid Canelar Road and low-elevation areas (below 5m)",
          action: "View Terrain",
        });
      }

      // Update alerts state
      setAlerts(generatedAlerts);
      setShowBanner(generatedAlerts.length > 0);
      setWeatherStatus(generatedAlerts.length > 0 ? "risk" : "safe");
      setLoading(false);

      // Show initial popup on first load only
      if (loading) {
        setShowInitialPopup(true);
        // Auto-hide after 5 seconds
        setTimeout(() => {
          setShowInitialPopup(false);
        }, 5000);
      }

      console.log(
        `Weather Alert System: ${generatedAlerts.length} active alerts`
      );
    } catch (error) {
      console.error("Failed to fetch weather alerts:", error);
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
      case "high":
        return "bg-alert-red";
      case "moderate":
        return "bg-alert-orange";
      case "low":
        return "bg-caution-yellow";
      default:
        return "bg-gray-500";
    }
  };

  const getSeverityIcon = (type: string) => {
    switch (type) {
      case "flood":
        return "fas fa-water";
      case "weather":
        return "fas fa-cloud-rain";
      case "traffic":
        return "fas fa-car";
      case "terrain":
        return "fas fa-mountain";
      default:
        return "fas fa-exclamation-triangle";
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
        <div
          className={`${getSeverityColor(
            alert.severity
          )} alert-banner-responsive relative z-40 shadow-lg transition-all duration-500 ease-in-out animate-slide-in`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent"></div>
          <div className="alert-banner-content relative py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              `{/* Enhanced Icon with Background */}
              <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <i
                  className={`${getSeverityIcon(
                    alert.type
                  )} text-white text-lg`}
                ></i>
              </div>
              {/* Alert Content */}
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm md:text-base leading-tight truncate">
                  {alert.message}
                </div>
                <div className="text-white/80 text-xs mt-1 hidden md:block">
                  {alert.type === "weather" && "Live weather monitoring"}
                  {alert.type === "flood" && "Flood risk assessment"}
                  {alert.type === "traffic" && "Traffic conditions"}
                  {alert.type === "terrain" && "Terrain analysis"}
                </div>
              </div>
              <div className="flex items-center space-x-3 flex-shrink-0">
                `{/* Action Button */}
                <button
                  onClick={() => setShowDetails(true)}
                  className="hidden md:inline-flex items-center space-x-2 bg-white/20 hover:bg-white/30 text-white font-medium text-sm px-4 py-2 rounded-lg backdrop-blur-sm transition-all duration-200 hover:scale-105"
                >
                  <i className="fas fa-info-circle text-xs"></i>
                  <span>{alert.action}</span>
                </button>
                {/* Mobile Action Button */}
                <button
                  onClick={() => setShowDetails(true)}
                  className="md:hidden w-8 h-8 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center justify-center backdrop-blur-sm transition-all duration-200"
                >
                  <i className="fas fa-info text-sm"></i>
                </button>
                {/* Alert Indicators */}
                {alerts.length > 1 && (
                  <div className="flex space-x-1 items-center">
                    <span className="text-white/60 text-xs mr-2 hidden md:inline">
                      {currentAlert + 1}/{alerts.length}
                    </span>
                    <div className="flex space-x-1">
                      {alerts.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentAlert(index)}
                          className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            index === currentAlert
                              ? "bg-white scale-125"
                              : "bg-white/50 hover:bg-white/75"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* Unique Close Button with Dissolve Effect */}
                <button
                  onClick={() => setShowBanner(false)}
                  className="close-btn-unique w-8 h-8 text-white rounded-lg flex items-center justify-center backdrop-blur-sm"
                >
                  <i className="fas fa-times text-sm close-icon-fade"></i>
                </button>
              </div>
            </div>

            {/* Progress Bar for Auto-rotation */}
            {alerts.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                <div
                  className="h-full bg-white/60 transition-all duration-300 ease-linear"
                  style={{
                    width: `${((currentAlert + 1) / alerts.length) * 100}%`,
                  }}
                ></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Alert Details Modal */}
      {showDetails && alert && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div
              className={`${getSeverityColor(
                alert.severity
              )} text-white p-6 relative overflow-hidden`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent"></div>
              <div className="relative flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <i
                      className={`${getSeverityIcon(alert.type)} text-2xl`}
                    ></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Alert Details</h3>
                    <p className="text-white/80 text-sm capitalize">
                      {alert.severity} priority • {alert.type} alert
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="close-btn-liquid w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"
                >
                  <i className="fas fa-times text-lg close-icon-fade"></i>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Alert Message */}
              <div
                className="bg-gray-50 rounded-xl p-4 border-l-4"
                style={{
                  borderLeftColor:
                    alert.severity === "high"
                      ? "#ef4444"
                      : alert.severity === "moderate"
                      ? "#f59e0b"
                      : "#10b981",
                }}
              >
                <p className="text-gray-800 font-medium leading-relaxed">
                  {alert.message}
                </p>
              </div>

              {/* Recommendations */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-lightbulb text-blue-600 text-sm"></i>
                  </div>
                  <h4 className="font-semibold text-gray-800">
                    Recommended Actions
                  </h4>
                </div>

                <div className="bg-blue-50 rounded-xl p-4">
                  <ul className="space-y-3 text-sm text-gray-700">
                    {alert.type === "weather" && alert.severity === "high" && (
                      <>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-clock text-orange-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Delay non-essential travel until weather improves
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-road text-blue-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            If traveling, use main roads with better drainage
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-phone text-green-500 mt-0.5 flex-shrink-0"></i>
                          <span>Keep emergency contact numbers accessible</span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-sync text-purple-500 mt-0.5 flex-shrink-0"></i>
                          <span>Monitor weather updates regularly</span>
                        </li>
                      </>
                    )}
                    {alert.type === "weather" &&
                      alert.severity === "moderate" && (
                        <>
                          <li className="flex items-start space-x-3">
                            <i className="fas fa-clock text-orange-500 mt-0.5 flex-shrink-0"></i>
                            <span>
                              Allow extra travel time for your journey
                            </span>
                          </li>
                          <li className="flex items-start space-x-3">
                            <i className="fas fa-eye text-blue-500 mt-0.5 flex-shrink-0"></i>
                            <span>
                              Use caution in low-visibility conditions
                            </span>
                          </li>
                          <li className="flex items-start space-x-3">
                            <i className="fas fa-lightbulb text-yellow-500 mt-0.5 flex-shrink-0"></i>
                            <span>Keep headlights on even during daytime</span>
                          </li>
                          <li className="flex items-start space-x-3">
                            <i className="fas fa-car text-red-500 mt-0.5 flex-shrink-0"></i>
                            <span>Avoid overtaking in wet conditions</span>
                          </li>
                        </>
                      )}
                    {alert.type === "flood" && (
                      <>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-mountain text-green-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Avoid areas below 5m elevation during/after rain
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-water text-blue-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Never attempt to drive through flooded roads
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-map text-purple-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Use SafePath's terrain view for route planning
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-phone text-red-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Report flooding to local authorities (911)
                          </span>
                        </li>
                      </>
                    )}
                    {(alert.type === "terrain" || !alert.type) && (
                      <>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-route text-green-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Use alternative high-ground routes when possible
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-mountain text-blue-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Check terrain elevation before planning routes
                          </span>
                        </li>
                        <li className="flex items-start space-x-3">
                          <i className="fas fa-clock text-orange-500 mt-0.5 flex-shrink-0"></i>
                          <span>
                            Allow extra travel time during weather alerts
                          </span>
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setShowDetails(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 px-4 rounded-xl font-medium transition-all duration-200 hover:scale-105"
                >
                  Got it
                </button>
                <button
                  onClick={() => {
                    setShowDetails(false);
                    // Refresh page to show route planning with current alert context
                    window.location.reload();
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium text-white transition-all duration-200 hover:scale-105 ${getSeverityColor(
                    alert.severity
                  )} hover:opacity-90`}
                >
                  <i className="fas fa-map-marked-alt mr-2"></i>
                  {alert.type === "flood" ? "View Terrain" : "Plan Route"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Initial Weather Status Popup */}
      {showInitialPopup && (
        <div
          className={`${
            weatherStatus === "safe"
              ? "bg-gradient-to-r from-green-500 to-green-600"
              : "bg-gradient-to-r from-orange-500 to-red-500"
          } alert-banner-responsive relative z-40 shadow-lg transition-all duration-500 ease-in-out animate-slide-in`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-transparent"></div>
          <div className="alert-banner-content relative py-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-4 flex-1 min-w-0">
              `{/* Enhanced Status Icon */}
              <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <i
                  className={`${
                    weatherStatus === "safe"
                      ? "fas fa-check-circle"
                      : "fas fa-exclamation-triangle"
                  } text-white text-xl`}
                ></i>
              </div>
              {/* Status Content */}
              <div className="flex-1 min-w-0">
                <div className="text-white font-semibold text-sm md:text-base leading-tight">
                  {weatherStatus === "safe"
                    ? `Weather Status: Safe - ${currentWeather}`
                    : `Weather Alert: ${alerts.length} active ${
                        alerts.length === 1 ? "alert" : "alerts"
                      } detected`}
                </div>
                <div className="text-white/80 text-xs mt-1">
                  {weatherStatus === "safe"
                    ? "Good conditions for travel • Zamboanga City"
                    : "Live monitoring • Tap for details"}
                </div>
              </div>
              <div className="flex items-center space-x-3 flex-shrink-0">
                `
                {weatherStatus === "risk" && (
                  <>
                    {/* Desktop View Details Button */}
                    <button
                      onClick={() => {
                        setShowInitialPopup(false);
                        setShowDetails(true);
                      }}
                      className="hidden md:inline-flex items-center space-x-2 bg-white/20 hover:bg-white/30 text-white font-medium text-sm px-4 py-2 rounded-lg backdrop-blur-sm transition-all duration-200 hover:scale-105"
                    >
                      <i className="fas fa-info-circle text-xs"></i>
                      <span>View Details</span>
                    </button>

                    {/* Mobile View Details Button */}
                    <button
                      onClick={() => {
                        setShowInitialPopup(false);
                        setShowDetails(true);
                      }}
                      className="md:hidden w-10 h-10 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center justify-center backdrop-blur-sm transition-all duration-200"
                    >
                      <i className="fas fa-info text-sm"></i>
                    </button>
                  </>
                )}
                {/* Particle Burst Close Button */}
                <button
                  onClick={() => setShowInitialPopup(false)}
                  className="close-btn-burst w-10 h-10 bg-white/20 text-white rounded-lg flex items-center justify-center backdrop-blur-sm"
                >
                  <i className="fas fa-times text-sm close-icon-fade"></i>
                </button>
              </div>
            </div>

            {/* Auto-dismiss Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div
                className="h-full bg-white/60 transition-all duration-[5000ms] ease-linear"
                style={{
                  width: showInitialPopup ? "0%" : "100%",
                  animationName: showInitialPopup ? "progress" : "none",
                  animationDuration: "5s",
                  animationTimingFunction: "linear",
                  animationFillMode: "forwards",
                }}
              ></div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
