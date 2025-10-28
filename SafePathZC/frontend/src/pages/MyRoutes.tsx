import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock,
  MapPin,
  Star,
  Trash2,
  Repeat,
  Plus,
  Search,
  Calendar,
  BarChart3,
  Loader2,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { NavigationBar } from "@/components/NavigationBar";
import { AddFavoriteModal } from "@/components/AddFavoriteModal";
import { useToast } from "@/hooks/use-toast";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { notification } from "@/utils/notifications";

// API Types
interface RouteHistory {
  id: number;
  from_location: string;
  to_location: string;
  date: string;
  duration: string;
  distance: string;
  status: string;
  weather_condition?: string;
}

interface FavoriteRoute {
  id: number;
  name: string;
  from_location: string;
  to_location: string;
  frequency: string;
  avg_duration: string;
  last_used: string;
  risk_level: string;
}

interface SearchHistory {
  id: number;
  query: string;
  timestamp: string;
  results_count: number;
}

interface AnalyticsSummary {
  total_routes: number;
  completed_routes: number;
  completion_rate: number;
  favorite_routes: number;
  recent_searches: number;
}

const API_BASE_URL = "http://localhost:8001/api";

const MyRoutes = () => {
  useEffect(() => {
    document.body.style.overflow = "auto";
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddFavoriteOpen, setIsAddFavoriteOpen] = useState(false);
  const [routeHistory, setRouteHistory] = useState<RouteHistory[]>([]);
  const [favoriteRoutes, setFavoriteRoutes] = useState<FavoriteRoute[]>([]);
  const [recentSearches, setRecentSearches] = useState<SearchHistory[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirmation();

  // LocalStorage functions for route data
  const loadCurrentRouteData = () => {
    try {
      const saved = localStorage.getItem("safePathRouteData");
      if (saved) {
        const data = JSON.parse(saved);
        // Check if data is not too old (max 24 hours)
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data;
        } else {
          localStorage.removeItem("safePathRouteData");
        }
      }
    } catch (error) {
      console.error("Failed to load route data:", error);
    }
    return null;
  };

  const saveRouteToHistory = async (routeData: any) => {
    try {
      const historyData = {
        from_location: routeData.startLocationInput || "Unknown Start",
        to_location: routeData.endLocationInput || "Unknown End",
        from_lat: routeData.startPoint?.lat,
        from_lng: routeData.startPoint?.lng,
        to_lat: routeData.endPoint?.lat,
        to_lng: routeData.endPoint?.lng,
        duration: routeData.routeDetails?.safeRoute?.time || "Unknown",
        distance: routeData.routeDetails?.safeRoute?.distance || "Unknown",
        status: "completed",
        weather_condition: "Current",
        route_type: "safe",
        waypoints: JSON.stringify(
          routeData.routeDetails?.safeRoute?.waypoints || []
        ),
      };

      const response = await fetch(`${API_BASE_URL}/routes/history`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(historyData),
      });

      if (response.ok) {
        await fetchRouteHistory();
        console.log("Route saved to history");
      }
    } catch (error) {
      console.error("Failed to save route to history:", error);
    }
  };

  // Fetch data from API
  const fetchRouteHistory = async () => {
    try {
      console.log(
        "📡 Fetching route history from:",
        `${API_BASE_URL}/routes/history?limit=20`
      );
      const response = await fetch(`${API_BASE_URL}/routes/history?limit=20`);
      if (!response.ok) throw new Error("Failed to fetch route history");
      const data = await response.json();
      console.log("✅ Route history fetched:", data);
      setRouteHistory(data);
    } catch (err) {
      console.error("❌ Error fetching route history:", err);
      setError("Failed to load route history");
    }
  };

  const fetchFavoriteRoutes = async () => {
    try {
      console.log(
        "📡 Fetching favorite routes from:",
        `${API_BASE_URL}/routes/favorites`
      );
      const response = await fetch(`${API_BASE_URL}/routes/favorites`);
      if (!response.ok) throw new Error("Failed to fetch favorite routes");
      const data = await response.json();
      console.log("✅ Favorite routes fetched:", data);
      setFavoriteRoutes(data);
    } catch (err) {
      console.error("❌ Error fetching favorite routes:", err);
      setError("Failed to load favorite routes");
    }
  };

  const fetchSearchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/search/history?limit=10`);
      if (!response.ok) throw new Error("Failed to fetch search history");
      const data = await response.json();
      setRecentSearches(data);
    } catch (err) {
      console.error("Error fetching search history:", err);
      setError("Failed to load search history");
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/routes-summary`);
      if (!response.ok) throw new Error("Failed to fetch analytics");
      const data = await response.json();
      setAnalytics(data);
    } catch (err) {
      console.error("Error fetching analytics:", err);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchRouteHistory(),
        fetchFavoriteRoutes(),
        fetchSearchHistory(),
        fetchAnalytics(),
      ]);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
    toast({
      title: "Data refreshed",
      description: "All route data has been updated.",
    });
  };

  useEffect(() => {
    console.log("🔄 MyRoutes: Starting to load all data...");
    loadAllData();

    // Check for current localStorage route and save it to history if exists
    const currentRoute = loadCurrentRouteData();
    if (currentRoute && currentRoute.routeDetails) {
      console.log(
        "💾 MyRoutes: Found current route in localStorage, saving to history"
      );
      saveRouteToHistory(currentRoute);
    }
  }, []);
  // API Actions
  const deleteRouteHistory = async (routeId: number) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/routes/history/${routeId}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) throw new Error("Failed to delete route");

      setRouteHistory((prev) => prev.filter((route) => route.id !== routeId));
      toast({
        title: "Route deleted",
        description: "Route has been removed from your history.",
      });
    } catch (err) {
      console.error("Error deleting route:", err);
      toast({
        title: "Error",
        description: "Failed to delete route. Please try again.",
        variant: "destructive",
      });
    }
  };

  const deleteFavoriteRoute = async (routeId: number) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/routes/favorites/${routeId}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) throw new Error("Failed to delete favorite route");

      setFavoriteRoutes((prev) => prev.filter((route) => route.id !== routeId));
      toast({
        title: "Favorite removed",
        description: "Route has been removed from your favorites.",
      });
    } catch (err) {
      console.error("Error deleting favorite route:", err);
      toast({
        title: "Error",
        description: "Failed to remove favorite. Please try again.",
        variant: "destructive",
      });
    }
  };

  // 🆕 GPS Tracking and Manual Completion Functions
  const startGPSTracking = (routeId: number) => {
    const route = routeHistory.find((r) => r.id === routeId);
    if (!route) {
      toast({
        title: "Error",
        description: "Route not found.",
        variant: "destructive",
      });
      return;
    }

    notification.route.planningStarted();

    // Store route data for GPS tracking and navigate to map
    localStorage.setItem("pendingGPSRoute", JSON.stringify(route));
    window.location.href = "/";
  };

  const markRouteCompleted = async (routeId: number) => {
    const confirmed = await confirm({
      title: "Mark Route as Completed",
      description:
        "Are you sure you want to mark this route as completed? This will update your completion statistics.",
      confirmText: "Mark Completed",
      cancelText: "Cancel",
      variant: "success",
    });

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/routes/history/${routeId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "completed" }),
        }
      );

      if (!response.ok) throw new Error("Failed to mark route as completed");

      // Update local state
      setRouteHistory((prev) =>
        prev.map((route) =>
          route.id === routeId ? { ...route, status: "completed" } : route
        )
      );

      toast({
        title: "Route completed! 🎉",
        description: "Congratulations on reaching your destination safely!",
      });

      // Refresh analytics to update completion rate
      fetchAnalytics();
    } catch (err) {
      console.error("Error marking route as completed:", err);
      toast({
        title: "Error",
        description: "Failed to mark route as completed. Please try again.",
        variant: "destructive",
      });
    }
  };

  const repeatRoute = async (route: RouteHistory) => {
    try {
      // Navigate to the route instead of just saving to history
      navigateToRoute(route.from_location, route.to_location);
    } catch (err) {
      console.error("Error repeating route:", err);
      toast({
        title: "Error",
        description: "Failed to repeat route. Please try again.",
        variant: "destructive",
      });
    }
  };

  const saveAsFavorite = async (route: RouteHistory) => {
    try {
      const favoriteData = {
        name: `${route.from_location} to ${route.to_location}`,
        from_location: route.from_location,
        to_location: route.to_location,
        avg_duration: route.duration,
        frequency: "Weekly",
        risk_level: "low",
      };

      const response = await fetch(`${API_BASE_URL}/routes/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(favoriteData),
      });

      if (!response.ok) throw new Error("Failed to save as favorite");

      await fetchFavoriteRoutes(); // Refresh the list
      toast({
        title: "Added to favorites",
        description: `Route saved as "${favoriteData.name}"`,
      });
    } catch (err) {
      console.error("Error saving as favorite:", err);
      toast({
        title: "Error",
        description: "Failed to save as favorite. Please try again.",
        variant: "destructive",
      });
    }
  };

  const clearSearchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/search/history`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to clear search history");

      setRecentSearches([]);
      toast({
        title: "Search history cleared",
        description: "All search history has been removed.",
      });
    } catch (err) {
      console.error("Error clearing search history:", err);
      toast({
        title: "Error",
        description: "Failed to clear search history. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddFavorite = async (newFavorite: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/routes/favorites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newFavorite),
      });

      if (!response.ok) throw new Error("Failed to add favorite");

      await fetchFavoriteRoutes(); // Refresh the list
      toast({
        title: "Favorite added",
        description: `"${newFavorite.name}" has been added to your favorites.`,
      });
    } catch (err) {
      console.error("Error adding favorite:", err);
      toast({
        title: "Error",
        description: "Failed to add favorite. Please try again.",
        variant: "destructive",
      });
    }
  };

  const navigateToRoute = (fromLocation: string, toLocation: string) => {
    // Store route navigation request in localStorage for MapView to pick up
    const routeRequest = {
      startLocationInput: fromLocation,
      endLocationInput: toLocation,
      navigateFromMyRoutes: true,
      timestamp: Date.now(),
    };

    localStorage.setItem("safePathRouteRequest", JSON.stringify(routeRequest));

    // Navigate to home page (which has the map)
    window.location.href = "/";

    toast({
      title: "Navigating to route",
      description: `Calculating route from ${fromLocation} to ${toLocation}`,
    });
  };

  const performSearch = (query: string) => {
    // Save search to recent searches
    const saveSearch = async () => {
      try {
        const searchData = {
          query: query,
          results_count: 1,
        };

        await fetch(`${API_BASE_URL}/search/history`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(searchData),
        });

        await fetchSearchHistory();
      } catch (error) {
        console.error("Failed to save search:", error);
      }
    };

    saveSearch();

    // Navigate to home with search query
    window.location.href = `/?search=${encodeURIComponent(query)}`;
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString() +
      " " +
      date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  };

  const formatLastUsed = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Status and risk color functions
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "interrupted":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-green-500";
      case "moderate":
        return "bg-yellow-500";
      case "high":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // Filter functions
  const filteredHistory = routeHistory.filter(
    (route) =>
      route.from_location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.to_location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFavorites = favoriteRoutes.filter(
    (route) =>
      route.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.from_location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      route.to_location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavigationBar />
        <main className="pt-20 container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-lg text-gray-600">Loading your routes...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      <main className="pt-20 container mx-auto px-4 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">My Routes</h1>
            <p className="text-gray-600">
              Manage your route history, favorites, and recent searches
            </p>
          </div>
          <Button
            onClick={refreshData}
            disabled={refreshing}
            variant="outline"
            size="sm"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Analytics Summary */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Total Routes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.total_routes}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Completion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.completion_rate}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Favorites</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.favorite_routes}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Recent Searches
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics.recent_searches}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search routes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <Tabs defaultValue="history" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="history">Route History</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
            <TabsTrigger value="searches">Recent Searches</TabsTrigger>
          </TabsList>

          {/* Route History Tab */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Route History</h2>
            </div>

            <div className="grid gap-4">
              {filteredHistory.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg text-gray-600 mb-2">
                      No routes found
                    </p>
                    <p className="text-gray-500">
                      {searchQuery
                        ? "Try adjusting your search"
                        : "Your route history will appear here"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredHistory.map((route) => (
                  <Card
                    key={route.id}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-4 w-4 text-blue-600" />
                            <span className="font-medium">
                              {route.from_location}
                            </span>
                            <span className="text-gray-500">→</span>
                            <span className="font-medium">
                              {route.to_location}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(route.date)}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {route.duration}
                            </div>
                            <span>{route.distance}</span>
                            {route.weather_condition && (
                              <Badge variant="outline">
                                {route.weather_condition}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge className={getStatusColor(route.status)}>
                          {route.status}
                        </Badge>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => repeatRoute(route)}
                        >
                          <Repeat className="h-3 w-3 mr-1" />
                          Repeat
                        </Button>

                        {/* 🆕 GPS Tracking and Manual Completion Options */}
                        {route.status === "planned" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startGPSTracking(route.id)}
                              className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                            >
                              <MapPin className="h-3 w-3 mr-1" />
                              Start GPS
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markRouteCompleted(route.id)}
                              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Mark Done
                            </Button>
                          </>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveAsFavorite(route)}
                        >
                          <Star className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteRouteHistory(route.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Favorites Tab */}
          <TabsContent value="favorites" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Favorite Routes</h2>
              <Button onClick={() => setIsAddFavoriteOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Favorite
              </Button>
            </div>

            <div className="grid gap-4">
              {filteredFavorites.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Star className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg text-gray-600 mb-2">
                      No favorite routes
                    </p>
                    <p className="text-gray-500">
                      {searchQuery
                        ? "Try adjusting your search"
                        : "Add your frequently used routes as favorites"}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredFavorites.map((route) => (
                  <Card
                    key={route.id}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="font-medium text-lg mb-2">
                            {route.name}
                          </h3>
                          <div className="flex items-center gap-2 mb-2">
                            <MapPin className="h-4 w-4 text-blue-600" />
                            <span>{route.from_location}</span>
                            <span className="text-gray-500">→</span>
                            <span>{route.to_location}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>Used {route.frequency}</span>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Avg: {route.avg_duration}
                            </div>
                            <span>Last: {formatLastUsed(route.last_used)}</span>
                          </div>
                        </div>
                        <Badge className={getRiskColor(route.risk_level)}>
                          {route.risk_level} risk
                        </Badge>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            // Convert favorite to history format for repeat
                            const historyRoute = {
                              id: route.id,
                              from_location: route.from_location,
                              to_location: route.to_location,
                              duration: route.avg_duration,
                              distance: "N/A",
                              date: new Date().toISOString(),
                              status: "completed",
                            };
                            repeatRoute(historyRoute);
                          }}
                        >
                          <Repeat className="h-3 w-3 mr-1" />
                          Use Route
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteFavoriteRoute(route.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Recent Searches Tab */}
          <TabsContent value="searches" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Recent Searches</h2>
              <Button
                variant="outline"
                onClick={clearSearchHistory}
                disabled={recentSearches.length === 0}
              >
                Clear All
              </Button>
            </div>

            <div className="grid gap-4">
              {recentSearches.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-lg text-gray-600 mb-2">
                      No recent searches
                    </p>
                    <p className="text-gray-500">
                      Your search history will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                recentSearches.map((search) => (
                  <Card
                    key={search.id}
                    className="hover:shadow-md transition-shadow"
                  >
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <p className="font-medium mb-1">{search.query}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>{formatDate(search.timestamp)}</span>
                            <Badge variant="outline">
                              {search.results_count} results
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => performSearch(search.query)}
                        >
                          Search Again
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Favorite Modal */}
        <AddFavoriteModal
          isOpen={isAddFavoriteOpen}
          onClose={() => setIsAddFavoriteOpen(false)}
          onAddFavorite={handleAddFavorite}
        />
      </main>
    </div>
  );
};

export default MyRoutes;
