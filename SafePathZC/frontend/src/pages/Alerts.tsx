import { useState, useEffect } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { AlertSettingsModal } from "../components/AlertSettingsModal";
import { AlertDetailsModal } from "../components/AlertDetailsModal";

interface CommunityReport {
  id: number;
  type: "flood" | "weather" | "traffic" | "roadblock" | "damage";
  severity: "high" | "moderate" | "low";
  title: string;
  description: string;
  location: string;
  timeIssued: string;
  estimatedDuration: string;
  affectedRoutes: string[];
  status: "active" | "resolved";
  isBookmarked: boolean;
  reportedBy: string;
  verifiedBy?: string;
  weather_conditions?: any;
}

interface WeatherAlert {
  id: number;
  type: "flood" | "weather" | "storm" | "wind";
  severity: "high" | "moderate" | "low";
  title: string;
  description: string;
  location: string;
  timeIssued: string;
  estimatedDuration: string;
  affectedRoutes: string[];
  status: "active";
  isBookmarked: boolean;
  weather_data: any;
}

const Alerts = () => {
  useEffect(() => {
    document.body.style.overflow = "auto";
  }, []);

  const [activeTab, setActiveTab] = useState("warnings");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // WeatherAPI.com configuration
  const WEATHER_API_KEY =
    import.meta.env.VITE_WEATHER_API_KEY || "11b60f9fe8df4418a12152441251310";
  const LOCATION = "Zamboanga City, Philippines";

  const [activeWarnings, setActiveWarnings] = useState<
    (CommunityReport | WeatherAlert)[]
  >([]);
  const [weatherUpdates, setWeatherUpdates] = useState<any[]>([]);
  const [emergencyAlert, setEmergencyAlert] = useState<any>(null);

  // Fetch dynamic weather alerts and community reports
  const fetchAlertsData = async () => {
    setLoading(true);
    try {
      // Fetch weather data from WeatherAPI
      const weatherResponse = await fetch(
        `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(
          LOCATION
        )}&days=1&aqi=no&alerts=yes`
      );

      if (!weatherResponse.ok) {
        throw new Error("Weather API failed");
      }

      const weatherData = await weatherResponse.json();
      const generatedAlerts: (CommunityReport | WeatherAlert)[] = [];
      const updates: any[] = [];

      const current = weatherData.current;
      const forecast = weatherData.forecast?.forecastday?.[0];

      // Generate weather-based alerts
      let hasEmergency = false;

      // Check for severe flooding conditions (>20mm rain)
      if (current.precip_mm > 20) {
        hasEmergency = true;
        setEmergencyAlert({
          type: "flood",
          severity: "high",
          message: `Heavy flooding reported in multiple areas. ${current.precip_mm.toFixed(
            1
          )}mm rainfall detected. Avoid travel unless absolutely necessary.`,
          action: "View Emergency Contacts",
        });

        generatedAlerts.push({
          id: Date.now() + 1,
          type: "flood",
          severity: "high",
          title: `Severe Flooding Warning - ${current.precip_mm.toFixed(
            1
          )}mm Rainfall`,
          description: `Heavy flooding expected in low-lying areas. Current rainfall: ${current.precip_mm.toFixed(
            1
          )}mm/hr. Water levels may rise rapidly.`,
          location: "Zamboanga City - Multiple Areas",
          timeIssued: "Just now",
          estimatedDuration: "4-6 hours",
          affectedRoutes: ["Canelar Road", "Tetuan Area", "Tumaga Districts"],
          status: "active",
          isBookmarked: false,
          weather_data: current,
        } as WeatherAlert);
      } else if (current.precip_mm > 10) {
        generatedAlerts.push({
          id: Date.now() + 2,
          type: "flood",
          severity: "moderate",
          title: `Moderate Flooding Risk - ${current.precip_mm.toFixed(
            1
          )}mm Rainfall`,
          description: `Moderate rainfall detected. Exercise caution in flood-prone areas. Monitor weather updates regularly.`,
          location: "Zamboanga City - Low-lying Areas",
          timeIssued: "Just now",
          estimatedDuration: "2-3 hours",
          affectedRoutes: ["Canelar Road", "Sta. Maria Area"],
          status: "active",
          isBookmarked: false,
          weather_data: current,
        } as WeatherAlert);
      }

      // Check for strong winds
      if (current.wind_kph > 60) {
        hasEmergency = true;
        setEmergencyAlert({
          type: "wind",
          severity: "high",
          message: `Very strong winds detected (${current.wind_kph.toFixed(
            0
          )}kph). Secure loose objects and avoid exposed areas.`,
          action: "View Safety Guidelines",
        });

        generatedAlerts.push({
          id: Date.now() + 3,
          type: "weather",
          severity: "high",
          title: `Strong Wind Warning - ${current.wind_kph.toFixed(0)}kph`,
          description: `Very strong winds affecting the area. Secure loose objects, avoid exposed areas, and exercise extreme caution while traveling.`,
          location: "Zamboanga City",
          timeIssued: "Just now",
          estimatedDuration: "3-5 hours",
          affectedRoutes: ["Coastal Roads", "Elevated Areas"],
          status: "active",
          isBookmarked: false,
          weather_data: current,
        } as WeatherAlert);
      } else if (current.wind_kph > 40) {
        generatedAlerts.push({
          id: Date.now() + 4,
          type: "weather",
          severity: "moderate",
          title: `Moderate Wind Advisory - ${current.wind_kph.toFixed(0)}kph`,
          description: `Moderate winds observed. Drive carefully and watch for falling branches or debris.`,
          location: "Zamboanga City",
          timeIssued: "Just now",
          estimatedDuration: "2-4 hours",
          affectedRoutes: ["Coastal Roads"],
          status: "active",
          isBookmarked: false,
          weather_data: current,
        } as WeatherAlert);
      }

      // Check for storms
      if (current.condition.code >= 1087 && current.condition.code <= 1282) {
        hasEmergency = true;
        setEmergencyAlert({
          type: "storm",
          severity: "high",
          message: `Severe weather alert: ${current.condition.text}. Stay indoors and monitor updates.`,
          action: "View Emergency Contacts",
        });

        generatedAlerts.push({
          id: Date.now() + 5,
          type: "storm",
          severity: "high",
          title: `Storm Alert - ${current.condition.text}`,
          description: `Severe weather conditions detected. ${current.condition.text}. Avoid all non-essential travel.`,
          location: "Zamboanga City",
          timeIssued: "Just now",
          estimatedDuration: "4-8 hours",
          affectedRoutes: ["All Routes"],
          status: "active",
          isBookmarked: false,
          weather_data: current,
        } as WeatherAlert);
      }

      // If no emergency, clear it
      if (!hasEmergency) {
        setEmergencyAlert(null);
      }

      // Fetch community reports from backend (simulated for now)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8001";
        const reportsResponse = await fetch(`${apiUrl}/api/reports/approved`);
        if (reportsResponse.ok) {
          const communityReports = await reportsResponse.json();
          communityReports.forEach((report: any) => {
            generatedAlerts.push({
              id: report.id,
              type: report.type,
              severity: report.severity,
              title: `${
                report.type.charAt(0).toUpperCase() + report.type.slice(1)
              } - ${report.location}`,
              description: report.description,
              location: report.location,
              timeIssued: getTimeAgo(report.timestamp),
              estimatedDuration: "2-4 hours",
              affectedRoutes: report.affected_routes || ["Multiple routes"],
              status: report.status,
              isBookmarked: false,
              reportedBy: report.reported_by || "Community Member",
              verifiedBy: report.verified_by || "Admin",
              weather_conditions: report.weather_conditions,
            } as CommunityReport);
          });
        }
      } catch (error) {
        console.log("Community reports not available:", error);
      }

      // NEWS FEED STYLE: Fetch PAGASA bulletins FIRST (highest priority)
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8001";
        const pagasaResponse = await fetch(`${apiUrl}/api/pagasa/bulletins`);
        if (pagasaResponse.ok) {
          const pagasaData = await pagasaResponse.json();

          if (
            pagasaData.success &&
            pagasaData.bulletins &&
            pagasaData.bulletins.length > 0
          ) {
            // Add PAGASA bulletins as individual news posts (NEWEST FIRST)
            pagasaData.bulletins.forEach((bulletin: any, index: number) => {
              updates.push({
                id: `pagasa-${Date.now()}-${index}`,
                type: bulletin.type || "advisory",
                title: bulletin.title || "PAGASA Weather Advisory",
                description:
                  bulletin.content ||
                  bulletin.description ||
                  "No details available",
                timestamp: bulletin.timestamp || "Recently updated",
                postedAt: new Date().toISOString(), // For sorting
                source: "PAGASA Official",
                bulletinType:
                  bulletin.type === "typhoon"
                    ? "🌪️ Typhoon Bulletin"
                    : bulletin.type === "rainfall"
                    ? "🌧️ Rainfall Advisory"
                    : "⚠️ Weather Advisory",
                impact:
                  bulletin.type === "typhoon"
                    ? "Possible severe weather conditions"
                    : bulletin.type === "rainfall"
                    ? "Flooding possible in low-lying areas"
                    : "Monitor weather conditions closely",
                recommendations: [
                  "Follow official PAGASA updates",
                  "Prepare emergency supplies",
                  "Monitor local weather conditions",
                  "Stay informed through official channels",
                ],
                isBookmarked: false,
                isPagasa: true,
                regionSpecific: bulletin.region_specific || false,
              });
            });

            console.log(
              `✅ Loaded ${pagasaData.bulletins.length} PAGASA bulletins`
            );
          } else {
            console.log("ℹ️ No active PAGASA bulletins");
          }
        }
      } catch (pagasaError) {
        console.log("⚠️ PAGASA bulletins not available:", pagasaError);
        // Continue without PAGASA data - not critical
      }

      // Add current weather as a news post
      updates.push({
        id: `weather-${Date.now()}`,
        type: "current",
        title: "🌤️ Current Weather Conditions",
        description: `${current.condition.text} with temperature at ${
          current.temp_c
        }°C. ${
          current.precip_mm > 0 ? `Rainfall: ${current.precip_mm}mm/hr. ` : ""
        }Wind speed: ${current.wind_kph}kph. Humidity: ${current.humidity}%.`,
        timestamp: "Just now",
        postedAt: new Date().toISOString(),
        source: "WeatherAPI Live Data",
        impact:
          current.precip_mm > 10
            ? "High flood risk in low-lying areas"
            : current.precip_mm > 5
            ? "Moderate flood risk"
            : "Low flood risk",
        recommendations: generateRecommendations(current),
        isBookmarked: false,
        weather_data: current,
        isPagasa: false,
      });

      // Add forecast as a news post if significant weather expected
      if (forecast) {
        const hourlyData = forecast.hour;
        const nextHours = hourlyData.slice(
          new Date().getHours(),
          new Date().getHours() + 6
        );
        const maxRain = Math.max(...nextHours.map((h: any) => h.precip_mm));
        const avgWind =
          nextHours.reduce((sum: number, h: any) => sum + h.wind_kph, 0) /
          nextHours.length;

        if (maxRain > 5 || avgWind > 30) {
          updates.push({
            id: `forecast-${Date.now()}`,
            type: "forecast",
            title: "📊 Weather Forecast - Next 6 Hours",
            description: `Expected conditions: Maximum rainfall of ${maxRain.toFixed(
              1
            )}mm/hr, average wind speed ${avgWind.toFixed(0)}kph. ${
              maxRain > 15
                ? "Heavy rain expected."
                : maxRain > 8
                ? "Moderate rain expected."
                : "Light rain possible."
            }`,
            timestamp: "Updated now",
            postedAt: new Date().toISOString(),
            source: "WeatherAPI Forecast",
            impact:
              maxRain > 15
                ? "Possible flash flooding in vulnerable areas"
                : "Minor inconveniences expected",
            recommendations: [
              maxRain > 10
                ? "Delay non-essential travel"
                : "Allow extra travel time",
              "Monitor weather updates regularly",
              "Avoid flood-prone areas",
              "Keep emergency contacts ready",
            ],
            isBookmarked: false,
            isPagasa: false,
          });
        }
      }

      // Sort updates by timestamp (newest first - like a news feed)
      updates.sort((a, b) => {
        const dateA = new Date(a.postedAt || 0).getTime();
        const dateB = new Date(b.postedAt || 0).getTime();
        return dateB - dateA; // Descending order (newest first)
      });

      setActiveWarnings(generatedAlerts);
      setWeatherUpdates(updates);
      setLastRefreshTime(new Date());
      setLoading(false);

      console.log(
        `✅ Loaded ${generatedAlerts.length} active warnings and ${updates.length} weather updates`
      );
    } catch (error) {
      console.error("Failed to fetch alerts data:", error);
      setEmergencyAlert(null);
      setActiveWarnings([]);
      setWeatherUpdates([
        {
          id: 1,
          type: "update",
          title: "Weather Data Unavailable",
          description:
            "Unable to fetch current weather conditions. Please check your internet connection and try again.",
          timestamp: "Error",
          source: "System",
          impact: "Weather monitoring temporarily unavailable",
          recommendations: [
            "Refresh the page",
            "Check internet connection",
            "Try again later",
          ],
          isBookmarked: false,
        },
      ]);
      setLoading(false);
    }
  };

  const generateRecommendations = (weather: any): string[] => {
    const recommendations: string[] = [];

    if (weather.precip_mm > 20) {
      recommendations.push("Avoid all non-essential travel");
      recommendations.push("Stay in safe elevated areas");
      recommendations.push("Monitor emergency broadcasts");
      recommendations.push("Have evacuation plan ready");
    } else if (weather.precip_mm > 10) {
      recommendations.push("Exercise extreme caution when traveling");
      recommendations.push("Avoid flood-prone areas");
      recommendations.push("Drive slowly and maintain safe distance");
      recommendations.push("Keep emergency contacts accessible");
    } else if (weather.precip_mm > 5) {
      recommendations.push("Drive carefully in wet conditions");
      recommendations.push("Allow extra travel time");
      recommendations.push("Use headlights even during daytime");
    } else {
      recommendations.push("Normal travel conditions");
      recommendations.push("Stay informed of weather changes");
    }

    if (weather.wind_kph > 60) {
      recommendations.push("Secure all loose outdoor objects");
      recommendations.push("Avoid exposed areas and coastal roads");
    } else if (weather.wind_kph > 40) {
      recommendations.push("Watch for falling branches or debris");
      recommendations.push("Drive with extra caution on exposed roads");
    }

    return recommendations;
  };

  const getTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchAlertsData();

    const interval = setInterval(() => {
      console.log("Auto-refreshing alerts data...");
      fetchAlertsData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAlertsData();
    setIsRefreshing(false);

    toast({
      title: "Alerts Updated",
      description: `${activeWarnings.length} active warnings found. Latest weather data retrieved.`,
    });
  };

  const handleFindAlternativeRoute = (alert: any) => {
    console.log("Finding alternative route for alert:", alert.id);

    // Navigate to map with alert context
    navigate("/", { state: { avoidLocation: alert.location } });

    toast({
      title: "Route Planning",
      description: "Navigating to map with alternative routes...",
    });
  };

  const handleViewDetails = (alert: any) => {
    setSelectedAlert(alert);
    setShowDetailsModal(true);
    console.log("Viewing details for alert:", alert.id);
  };

  const handleShareAlert = (alert: any) => {
    const shareText = `⚠️ ${alert.title}\n\n${alert.description}\n\n📍 Location: ${alert.location}\n🕐 ${alert.timeIssued}\n\n#SafePathZC #WeatherAlert`;

    if (navigator.share) {
      navigator
        .share({
          title: alert.title,
          text: shareText,
          url: window.location.href,
        })
        .catch((error) => console.log("Error sharing", error));
    } else {
      navigator.clipboard.writeText(shareText);
      toast({
        title: "Alert Copied",
        description:
          "Alert details copied to clipboard. You can now paste and share it.",
      });
    }
    console.log("Sharing alert:", alert.id);
  };

  const handleBookmarkToggle = (id: number, type: "warning" | "weather") => {
    if (type === "warning") {
      setActiveWarnings((prev) =>
        prev.map((warning) =>
          warning.id === id
            ? { ...warning, isBookmarked: !warning.isBookmarked }
            : warning
        )
      );
      toast({
        title: "Warning Bookmarked",
        description: "Alert saved to your bookmarks.",
      });
    } else {
      setWeatherUpdates((prev) =>
        prev.map((update) =>
          update.id === id
            ? { ...update, isBookmarked: !update.isBookmarked }
            : update
        )
      );
      toast({
        title: "Update Bookmarked",
        description: "Weather update saved to your bookmarks.",
      });
    }
    console.log("Toggled bookmark for:", type, id);
  };

  const openPagasaWebsite = () => {
    window.open("https://www.pagasa.dost.gov.ph/", "_blank");
    console.log("Opening PAGASA website");
  };

  const handleEmergencyContact = () => {
    toast({
      title: "Emergency Contacts",
      description:
        "Emergency: 911 | Disaster Risk Reduction: (062) 991-2999 | Fire: 160 | Police: 117",
      duration: 10000,
    });
  };

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
      case "storm":
        return "fas fa-cloud-bolt";
      case "wind":
        return "fas fa-wind";
      case "traffic":
        return "fas fa-car";
      case "roadblock":
        return "fas fa-road-barrier";
      case "damage":
        return "fas fa-road-spikes";
      case "forecast":
        return "fas fa-cloud-sun-rain";
      case "advisory":
        return "fas fa-exclamation-triangle";
      case "update":
        return "fas fa-sync-alt";
      default:
        return "fas fa-bell";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      <main className="pt-20 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-wmsu-blue mb-2">
            Alerts & Warnings
          </h1>
          <p className="text-gray-600">
            Stay informed about current conditions and weather updates
          </p>
        </div>

        {/* Emergency Banner - Dynamic */}
        {emergencyAlert && (
          <Alert
            className={`mb-8 border-red-500 ${
              emergencyAlert.severity === "high" ? "bg-red-50" : "bg-orange-50"
            } animate-fade-in`}
          >
            <i
              className={`${getSeverityIcon(emergencyAlert.type)} text-red-600`}
            ></i>
            <AlertTitle className="text-red-800">
              Emergency Weather Alert
            </AlertTitle>
            <AlertDescription className="text-red-700">
              {emergencyAlert.message}
              <Button
                variant="link"
                className="p-0 ml-2 text-red-800 underline font-semibold"
                onClick={handleEmergencyContact}
              >
                {emergencyAlert.action}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* No Emergency - Safe Conditions */}
        {!emergencyAlert && !loading && activeWarnings.length === 0 && (
          <Alert className="mb-8 border-green-500 bg-green-50 animate-fade-in">
            <i className="fas fa-check-circle text-green-600"></i>
            <AlertTitle className="text-green-800">All Clear</AlertTitle>
            <AlertDescription className="text-green-700">
              No active weather warnings or emergencies at this time. Conditions
              are safe for travel.
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <i className="fas fa-spinner fa-spin text-4xl text-wmsu-blue mr-3"></i>
            <span className="text-lg text-gray-600">
              Loading alerts data...
            </span>
          </div>
        )}

        {!loading && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="warnings" className="text-base">
                Active Warnings ({activeWarnings.length})
              </TabsTrigger>
              <TabsTrigger value="weather" className="text-base">
                Weather Updates ({weatherUpdates.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="warnings" className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-800">
                  Active Warnings
                </h2>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowSettingsModal(true)}
                  >
                    <i className="fas fa-bell mr-2"></i>
                    Notification Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <i
                      className={`fas fa-sync-alt mr-2 ${
                        isRefreshing ? "animate-spin" : ""
                      }`}
                    ></i>
                    Refresh
                  </Button>
                </div>
              </div>

              {activeWarnings.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <i className="fas fa-check-circle text-6xl text-green-500 mb-4"></i>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      No Active Warnings
                    </h3>
                    <p className="text-gray-600">
                      There are currently no active weather warnings or
                      community reports. Safe travels!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6">
                  {activeWarnings.map((warning) => (
                    <Card
                      key={warning.id}
                      className={`border-l-4 hover:shadow-lg transition-shadow ${
                        warning.severity === "high"
                          ? "border-l-red-500"
                          : warning.severity === "moderate"
                          ? "border-l-orange-500"
                          : "border-l-yellow-500"
                      } animate-fade-in`}
                    >
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div className="flex items-start space-x-3">
                            <i
                              className={`${getSeverityIcon(
                                warning.type
                              )} text-2xl mt-1 ${
                                warning.severity === "high"
                                  ? "text-red-600"
                                  : warning.severity === "moderate"
                                  ? "text-orange-600"
                                  : "text-yellow-600"
                              }`}
                            ></i>
                            <div>
                              <CardTitle className="text-lg text-gray-800">
                                {warning.title}
                              </CardTitle>
                              <CardDescription className="mt-1 text-sm">
                                <i className="fas fa-map-marker-alt mr-1"></i>
                                {warning.location} • {warning.timeIssued}
                              </CardDescription>
                              {"reportedBy" in warning && (
                                <CardDescription className="mt-1 text-xs flex items-center">
                                  <i className="fas fa-user mr-1"></i>
                                  Reported by: {warning.reportedBy}
                                  {warning.verifiedBy && (
                                    <span className="ml-2 text-green-600">
                                      <i className="fas fa-check-circle mr-1"></i>
                                      Verified by {warning.verifiedBy}
                                    </span>
                                  )}
                                </CardDescription>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge
                              className={`${getSeverityColor(
                                warning.severity
                              )} text-white`}
                            >
                              {warning.severity} priority
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleBookmarkToggle(warning.id, "warning")
                              }
                              className={
                                warning.isBookmarked
                                  ? "text-yellow-500"
                                  : "text-gray-400"
                              }
                            >
                              <i className={`fas fa-bookmark`}></i>
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-gray-700 mb-4">
                          {warning.description}
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <span className="text-sm text-gray-500">
                              Estimated Duration:
                            </span>
                            <p className="font-semibold">
                              {warning.estimatedDuration}
                            </p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500">
                              Affected Routes:
                            </span>
                            <p className="font-semibold">
                              {warning.affectedRoutes.join(", ")}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleFindAlternativeRoute(warning)}
                            className="bg-wmsu-blue hover:bg-wmsu-blue-light"
                          >
                            <i className="fas fa-route mr-1"></i>
                            Find Alternative Route
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDetails(warning)}
                          >
                            <i className="fas fa-info-circle mr-1"></i>
                            More Details
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleShareAlert(warning)}
                          >
                            <i className="fas fa-share mr-1"></i>
                            Share Alert
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="weather" className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    Weather Updates
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    <i className="fas fa-rss mr-1"></i>
                    Latest bulletins and weather news • {
                      weatherUpdates.length
                    }{" "}
                    update{weatherUpdates.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openPagasaWebsite}
                  >
                    <i className="fas fa-external-link-alt mr-2"></i>
                    PAGASA Website
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                  >
                    <i
                      className={`fas fa-sync-alt mr-2 ${
                        isRefreshing ? "animate-spin" : ""
                      }`}
                    ></i>
                    Refresh
                  </Button>
                </div>
              </div>

              {/* NEWS FEED STYLE */}
              <div className="space-y-4">
                {weatherUpdates.length === 0 ? (
                  <Card className="bg-gray-50">
                    <CardContent className="p-6 text-center">
                      <i className="fas fa-inbox text-4xl text-gray-400 mb-3"></i>
                      <p className="text-gray-600">
                        No weather updates available at this time.
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Check back later for the latest bulletins.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  weatherUpdates.map((update, index) => (
                    <Card
                      key={update.id}
                      className={`hover:shadow-lg transition-all duration-300 animate-fade-in ${
                        update.isPagasa
                          ? "border-l-4 border-l-orange-500 bg-gradient-to-r from-orange-50 to-white"
                          : "border-l-4 border-l-wmsu-blue"
                      }`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3 flex-1">
                            {/* Source Avatar/Icon */}
                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${
                                update.isPagasa
                                  ? "bg-gradient-to-br from-orange-500 to-orange-600"
                                  : "bg-gradient-to-br from-wmsu-blue to-blue-600"
                              }`}
                            >
                              {update.isPagasa ? (
                                <i className="fas fa-cloud-sun"></i>
                              ) : update.type === "forecast" ? (
                                <i className="fas fa-chart-line"></i>
                              ) : (
                                <i className="fas fa-temperature-high"></i>
                              )}
                            </div>

                            <div className="flex-1">
                              {/* Source Name & Badge */}
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-bold text-gray-800">
                                  {update.isPagasa
                                    ? "PAGASA"
                                    : "SafePath Weather"}
                                </span>
                                {update.isPagasa && (
                                  <Badge className="bg-orange-500 text-white text-xs">
                                    <i className="fas fa-certificate mr-1"></i>
                                    Official
                                  </Badge>
                                )}
                                {update.regionSpecific && (
                                  <Badge className="bg-green-500 text-white text-xs">
                                    <i className="fas fa-map-marker-alt mr-1"></i>
                                    Zamboanga
                                  </Badge>
                                )}
                                {update.bulletinType && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs border-orange-400 text-orange-600"
                                  >
                                    {update.bulletinType}
                                  </Badge>
                                )}
                              </div>

                              {/* Timestamp */}
                              <CardDescription className="text-xs flex items-center gap-2">
                                <i className="fas fa-clock"></i>
                                {update.timestamp}
                                {update.source && (
                                  <>
                                    <span>•</span>
                                    <span className="text-gray-500">
                                      {update.source}
                                    </span>
                                  </>
                                )}
                              </CardDescription>
                            </div>
                          </div>

                          {/* Bookmark Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleBookmarkToggle(update.id, "weather")
                            }
                            className={
                              update.isBookmarked
                                ? "text-yellow-500 hover:text-yellow-600"
                                : "text-gray-400 hover:text-gray-600"
                            }
                          >
                            <i className={`fas fa-bookmark text-lg`}></i>
                          </Button>
                        </div>
                      </CardHeader>

                      <CardContent className="pt-0">
                        {/* Post Title */}
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">
                          {update.title}
                        </h3>

                        {/* Post Description */}
                        <p className="text-gray-700 mb-4 leading-relaxed whitespace-pre-line">
                          {update.description}
                        </p>

                        {/* Impact Section */}
                        {update.impact && (
                          <div className="bg-blue-50 border-l-4 border-blue-400 rounded-r-lg p-3 mb-4">
                            <div className="flex items-start">
                              <i className="fas fa-exclamation-triangle text-blue-600 mr-2 mt-0.5"></i>
                              <div>
                                <h4 className="font-semibold text-blue-900 text-sm">
                                  Expected Impact
                                </h4>
                                <p className="text-blue-800 text-sm mt-1">
                                  {update.impact}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        {update.recommendations &&
                          update.recommendations.length > 0 && (
                            <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-3 mb-4">
                              <h4 className="font-semibold text-amber-900 text-sm mb-2 flex items-center">
                                <i className="fas fa-lightbulb mr-2"></i>
                                Safety Recommendations
                              </h4>
                              <ul className="text-sm text-amber-800 space-y-1.5">
                                {update.recommendations.map(
                                  (rec: string, index: number) => (
                                    <li
                                      key={index}
                                      className="flex items-start"
                                    >
                                      <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5"></i>
                                      <span>{rec}</span>
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}

                        {/* Action Buttons (Social Media Style) */}
                        <div className="flex items-center gap-3 pt-3 border-t border-gray-200">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleShareAlert(update)}
                            className="text-gray-600 hover:text-wmsu-blue"
                          >
                            <i className="fas fa-share-alt mr-2"></i>
                            Share
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewDetails(update)}
                            className="text-gray-600 hover:text-wmsu-blue"
                          >
                            <i className="fas fa-info-circle mr-2"></i>
                            Details
                          </Button>
                          {update.isPagasa && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={openPagasaWebsite}
                              className="text-gray-600 hover:text-orange-600"
                            >
                              <i className="fas fa-external-link-alt mr-2"></i>
                              View Source
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Modals */}
      {showSettingsModal && (
        <AlertSettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {showDetailsModal && selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
};

export default Alerts;
