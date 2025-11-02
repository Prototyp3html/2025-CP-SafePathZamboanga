import { useState, useRef, useEffect } from "react";
import { notification } from "@/utils/notifications";
import { LocationAutocomplete } from "./LocationAutocomplete";

interface ReportModalProps {
  onClose: () => void;
  isLoggedIn?: boolean;
  onLoginRequired?: () => void;
}

export const ReportModal = ({
  onClose,
  isLoggedIn = false,
  onLoginRequired,
}: ReportModalProps) => {
  const [reportType, setReportType] = useState("");
  const [location, setLocation] = useState("");
  const [locationCoordinates, setLocationCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("moderate");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeWarnings, setActiveWarnings] = useState<string[]>([]);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // WeatherAPI.com configuration
  const WEATHER_API_KEY =
    import.meta.env.VITE_WEATHER_API_KEY || "11b60f9fe8df4418a12152441251310";
  const LOCATION = "Zamboanga City, Philippines";

  // Fetch weather data and determine active warnings
  const fetchActiveWarnings = async () => {
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
      setWeatherData(data);
      const warnings: string[] = [];

      const current = data.current;

      // Check for flooding conditions (heavy rain)
      if (current.precip_mm > 5) {
        warnings.push("flood");
      }

      // Check for weather hazards (storms, heavy rain, strong winds)
      if (current.condition.code >= 1087 && current.condition.code <= 1282) {
        warnings.push("weather");
      } else if (current.precip_mm > 10 || current.wind_kph > 40) {
        warnings.push("weather");
      }

      // Check for road damage risk (extreme conditions)
      if (current.precip_mm > 25 || current.wind_kph > 60) {
        warnings.push("damage");
      }

      // Road blockage is always available (can happen anytime)
      warnings.push("roadblock");

      // Other issue is always available
      warnings.push("other");

      setActiveWarnings(warnings);
      setLoading(false);

      console.log(`🚨 Active warnings detected: ${warnings.join(", ")}`);
    } catch (error) {
      console.error("Failed to fetch weather warnings:", error);
      // Fallback: enable all options if API fails
      setActiveWarnings(["flood", "roadblock", "damage", "weather", "other"]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveWarnings();
  }, []);

  const reportTypes = [
    {
      id: "flood",
      label: "Flooding",
      icon: "fas fa-water",
      getStatus: () => {
        if (!weatherData) return { enabled: true, reason: "Checking..." };
        const isActive = activeWarnings.includes("flood");
        return {
          enabled: isActive,
          reason: isActive
            ? `Active: ${weatherData.current.precip_mm.toFixed(
                1
              )}mm rainfall detected`
            : "No flooding risk detected currently",
        };
      },
    },
    {
      id: "roadblock",
      label: "Road Blockage",
      icon: "fas fa-road-barrier",
      getStatus: () => ({
        enabled: true,
        reason: "Always available for reporting",
      }),
    },
    {
      id: "damage",
      label: "Road Damage",
      icon: "fas fa-road-spikes",
      getStatus: () => ({
        enabled: true,
        reason:
          "Always available for reporting road damage, accidents, construction issues, etc.",
      }),
    },
    {
      id: "weather",
      label: "Weather Hazard",
      icon: "fas fa-cloud-bolt",
      getStatus: () => {
        if (!weatherData) return { enabled: true, reason: "Checking..." };
        const isActive = activeWarnings.includes("weather");
        const current = weatherData.current;
        return {
          enabled: isActive,
          reason: isActive
            ? current.precip_mm > 10
              ? `Active: Heavy rain ${current.precip_mm.toFixed(1)}mm`
              : `Active: Strong winds ${current.wind_kph.toFixed(0)}kph`
            : "No weather hazards detected",
        };
      },
    },
    {
      id: "other",
      label: "Other Issue",
      icon: "fas fa-exclamation-circle",
      getStatus: () => ({
        enabled: true,
        reason: "Always available for reporting",
      }),
    },
  ];

  // Handle location selection from autocomplete
  const handleLocationSelect = (selectedLocation: any) => {
    console.log("📍 Selected location for report:", selectedLocation);
    setLocationCoordinates({
      lat: parseFloat(selectedLocation.lat),
      lng: parseFloat(selectedLocation.lon),
    });
  };

  const handleSubmit = async () => {
    console.log("🔍 Form validation check:", {
      reportType: reportType || "MISSING",
      location: location || "MISSING",
      description: description || "MISSING",
      isLoggedIn,
      locationCoordinates,
    });

    if (!reportType || !location || !description) {
      console.log("❌ Form validation failed - missing required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      const token =
        localStorage.getItem("access_token") ||
        localStorage.getItem("admin_token") ||
        localStorage.getItem("user_token");

      if (!token) {
        notification.auth.loginRequired();
        setIsSubmitting(false);
        return;
      }

      // Map report type to readable labels
      const typeLabels = {
        flood: "Flooding",
        roadblock: "Road Blockage",
        damage: "Road Damage",
        weather: "Weather Hazard",
        other: "Other Issue",
      };

      // Get user info from stored user data instead of JWT token
      const storedUserData = localStorage.getItem("user_data");
      let userName = "Anonymous User";
      let userEmail = "anonymous@example.com";
      let userId = "anonymous";

      if (storedUserData) {
        try {
          const userData = JSON.parse(storedUserData);
          userName = userData.name || "Anonymous User";
          userEmail = userData.email || "anonymous@example.com";
          userId = userData.id?.toString() || "anonymous";
        } catch (error) {
          console.warn("Failed to parse stored user data:", error);
        }
      } else {
        // Fallback: try to get user ID from JWT token
        try {
          const userPayload = JSON.parse(atob(token.split(".")[1]));
          userId = userPayload.sub || "anonymous";
        } catch (error) {
          console.warn("Failed to decode JWT token:", error);
        }
      }

      // First, create a proper Report record for admin dashboard
      const reportData = {
        title: `${
          typeLabels[reportType as keyof typeof typeLabels]
        } Report - ${location}`,
        description: description,
        category: reportType,
        urgency: severity,
        location_lat: locationCoordinates?.lat || 0,
        location_lng: locationCoordinates?.lng || 0,
        location_address: location,
        reporter_name: userName,
        reporter_email: userEmail,
        reporter_id: userId,
      };

      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8001";
      const reportResponse = await fetch(`${apiUrl}/admin/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(reportData),
      });

      let reportId = null;
      if (reportResponse.ok) {
        const reportResult = await reportResponse.json();
        reportId = reportResult.id;
        console.log("Report record created:", reportResult);
      }

      // Then, create forum post for community visibility
      const postData = {
        title: `${
          typeLabels[reportType as keyof typeof typeLabels]
        } in ${location}${
          severity === "severe" ? " - " + new Date().toLocaleDateString() : ""
        }`,
        content: `${description}

${
  weatherData
    ? `Weather conditions at the time: ${weatherData.current.condition.text.toLowerCase()}, ${
        weatherData.current.temp_c
      }°C with ${weatherData.current.wind_kph}kph winds.`
    : ""
}

Location: ${location}${
          reportId
            ? `

Report ID: #${reportId}`
            : ""
        }

Please be cautious when traveling through this area and consider alternative routes if possible.`,
        category: "reports",
        tags: [reportType, ...(severity === "severe" ? ["urgent"] : [])],
        is_urgent: severity === "severe",
      };

      const response = await fetch("http://localhost:8001/api/forum/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(postData),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("Report posted to forum:", result);

        // Update user's reports count
        try {
          const userStatsResponse = await fetch(
            `http://localhost:8001/auth/stats`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ reports_submitted: 1 }),
            }
          );

          if (userStatsResponse.ok) {
            const statsResult = await userStatsResponse.json();
            console.log("✅ User stats updated successfully:", statsResult);
          } else {
            const errorText = await userStatsResponse.text();
            console.warn(
              "⚠️ Failed to update user stats:",
              userStatsResponse.status,
              errorText
            );
          }
        } catch (statsError) {
          console.warn("❌ Error updating user stats:", statsError);
        }

        notification.reports.submitted(reportId);
        onClose();
      } else {
        throw new Error(`Failed to submit report: ${response.status}`);
      }
    } catch (error) {
      console.error("Error submitting report:", error);
      notification.reports.failed();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="bg-wmsu-blue text-white p-4 rounded-t-lg sticky top-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center">
              <i className="fas fa-comment-alt mr-2"></i>
              Report an Issue
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
          {/* Login Required Warning */}
          {!isLoggedIn && (
            <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg animate-slide-in">
              <div className="flex items-start">
                <i className="fas fa-exclamation-triangle text-yellow-600 text-xl mr-3 mt-1"></i>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-yellow-800 mb-1">
                    Login Required
                  </h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    You must be logged in to report issues to the community.
                    This helps us maintain accountability and prevent spam.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onLoginRequired?.();
                    }}
                    className="bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700 transition-colors duration-200"
                  >
                    <i className="fas fa-sign-in-alt mr-2"></i>
                    Login Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center">
              <i className="fas fa-spinner fa-spin text-blue-500 mr-2"></i>
              <span className="text-sm text-blue-700">
                Checking current weather conditions...
              </span>
            </div>
          )}

          {/* Report Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What type of issue are you reporting?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {reportTypes.map((type) => {
                const status = type.getStatus();
                const isSelected = reportType === type.id;
                const isDisabled = !isLoggedIn || !status.enabled;

                return (
                  <button
                    key={type.id}
                    onClick={() => !isDisabled && setReportType(type.id)}
                    disabled={isDisabled}
                    title={status.reason}
                    className={`
                      relative p-4 rounded-lg border-2 transition-all duration-200
                      ${
                        isSelected
                          ? "border-wmsu-blue bg-blue-50"
                          : isDisabled
                          ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50"
                          : "border-gray-300 hover:border-wmsu-blue hover:bg-blue-50"
                      }
                    `}
                  >
                    <div className="flex flex-col items-center">
                      <i
                        className={`${type.icon} text-2xl mb-2 ${
                          isSelected
                            ? "text-wmsu-blue"
                            : isDisabled
                            ? "text-gray-400"
                            : "text-gray-600"
                        }`}
                      ></i>
                      <span
                        className={`text-sm font-medium ${
                          isSelected
                            ? "text-wmsu-blue"
                            : isDisabled
                            ? "text-gray-400"
                            : "text-gray-700"
                        }`}
                      >
                        {type.label}
                      </span>

                      {/* Active indicator */}
                      {status.enabled &&
                        type.id !== "other" &&
                        type.id !== "roadblock" && (
                          <span className="absolute top-2 right-2 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                        )}

                      {/* Disabled indicator */}
                      {!status.enabled && isLoggedIn && (
                        <span className="absolute top-2 right-2">
                          <i className="fas fa-lock text-gray-400 text-xs"></i>
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {reportType && !loading && (
              <p className="text-xs text-gray-500 mt-2 flex items-center">
                <i className="fas fa-info-circle mr-1"></i>
                {
                  reportTypes.find((t) => t.id === reportType)?.getStatus()
                    .reason
                }
              </p>
            )}
          </div>

          {/* Location Input with Autocomplete */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <i className="fas fa-map-marker-alt mr-1"></i>
              Location in Zamboanga City
            </label>
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              onLocationSelect={handleLocationSelect}
              placeholder="Search for areas like: Sinunuc, Tetuan, City Hall, RT Lim..."
              disabled={!isLoggedIn}
              required
              className="text-sm"
            />
            {locationCoordinates && (
              <div className="mt-2 text-xs text-green-600 bg-green-50 p-2 rounded-md">
                <i className="fas fa-check-circle mr-1"></i>
                Location confirmed: {location}
                <div className="text-gray-500 mt-1">
                  Coordinates: {locationCoordinates.lat.toFixed(6)},{" "}
                  {locationCoordinates.lng.toFixed(6)}
                </div>
              </div>
            )}
            {!isLoggedIn && (
              <p className="text-xs text-gray-500 mt-1">
                Please log in to select a location for your report
              </p>
            )}
          </div>

          {/* Severity Level */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severity Level
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none"
              disabled={!isLoggedIn}
            >
              <option value="low">Low - Minor inconvenience</option>
              <option value="moderate">Moderate - Significant delay</option>
              <option value="high">High - Route impassable</option>
            </select>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide details about the issue..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none resize-none"
              disabled={!isLoggedIn}
              required
            />
          </div>

          {/* Community Guidelines */}
          {isLoggedIn && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <h4 className="text-sm font-semibold text-blue-800 mb-1">
                <i className="fas fa-info-circle mr-1"></i>
                Reporting Guidelines
              </h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>
                  • <strong>Location:</strong> Use the search above to find
                  accurate Zamboanga locations
                </li>
                <li>
                  • <strong>Details:</strong> Include time-sensitive information
                  and clear descriptions
                </li>
                <li>
                  • <strong>Verification:</strong> Confirm your location shows
                  green checkmark before submitting
                </li>
                <li>
                  • <strong>Community:</strong> Be respectful and constructive
                  in your reports
                </li>
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {/* Form Validation Status */}
            {(!isLoggedIn || !reportType || !location || !description) && (
              <div className="w-full mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center text-yellow-800 mb-2">
                  <i className="fas fa-exclamation-triangle mr-2"></i>
                  <span className="font-medium">
                    Please complete the following:
                  </span>
                </div>
                <ul className="text-sm text-yellow-700 space-y-1">
                  {!isLoggedIn && <li>• Log in to your account</li>}
                  {!reportType && <li>• Select a report type</li>}
                  {!location && <li>• Enter and select a location</li>}
                  {!description && (
                    <li>• Provide a description of the issue</li>
                  )}
                </ul>
              </div>
            )}

            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                !isLoggedIn ||
                !reportType ||
                !location ||
                !description ||
                isSubmitting
              }
              className="flex-1 bg-wmsu-blue text-white py-2 px-4 rounded-lg font-medium hover:bg-wmsu-blue-light transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed relative"
              title={
                !isLoggedIn
                  ? "Please log in to submit reports"
                  : !reportType
                  ? "Please select a report type"
                  : !location
                  ? "Please enter and select a location"
                  : !description
                  ? "Please enter a description"
                  : !locationCoordinates && location
                  ? "Please select a location from the dropdown for accurate positioning"
                  : "Click to submit your report"
              }
            >
              {isSubmitting ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Submitting...
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane mr-2"></i>
                  Submit Report
                  {!locationCoordinates && location && (
                    <i
                      className="fas fa-exclamation-triangle ml-2 text-yellow-300"
                      title="Location not verified"
                    ></i>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
