import { useState } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { AddFavoriteModal } from "../components/AddFavoriteModal";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const MyRoutes = () => {
  const [activeTab, setActiveTab] = useState("history");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddFavoriteOpen, setIsAddFavoriteOpen] = useState(false);

  const [routeHistory, setRouteHistory] = useState([
    {
      id: 1,
      from: "WMSU Main Campus",
      to: "Ayala Mall Zamboanga",
      date: "2024-06-25",
      time: "08:30 AM",
      duration: "25 mins",
      distance: "8.5 km",
      status: "completed",
      weatherCondition: "Light Rain",
    },
    {
      id: 2,
      from: "Tetuan Junction",
      to: "Veterans Avenue",
      date: "2024-06-24",
      time: "02:15 PM",
      duration: "18 mins",
      distance: "6.2 km",
      status: "completed",
      weatherCondition: "Heavy Rain",
    },
    {
      id: 3,
      from: "Canelar Road",
      to: "Downtown Zamboanga",
      date: "2024-06-23",
      time: "07:45 AM",
      duration: "32 mins",
      distance: "12.1 km",
      status: "interrupted",
      weatherCondition: "Moderate Rain",
    },
  ]);

  const [favoriteRoutes, setFavoriteRoutes] = useState([
    {
      id: 1,
      name: "Home to Work",
      from: "Barangay Tetuan",
      to: "WMSU Campus",
      frequency: "Daily",
      avgDuration: "22 mins",
      lastUsed: "2024-06-25",
      riskLevel: "low",
    },
    {
      id: 2,
      name: "Shopping Trip",
      from: "Downtown",
      to: "Ayala Mall",
      frequency: "Weekly",
      avgDuration: "15 mins",
      lastUsed: "2024-06-24",
      riskLevel: "moderate",
    },
    {
      id: 3,
      name: "Airport Route",
      from: "City Center",
      to: "Zamboanga Airport",
      frequency: "Monthly",
      avgDuration: "45 mins",
      lastUsed: "2024-06-20",
      riskLevel: "high",
    },
  ]);

  const [recentSearches, setRecentSearches] = useState([
    {
      id: 1,
      query: "Canelar Road to Veterans Avenue",
      timestamp: "2 hours ago",
      results: 3,
    },
    {
      id: 2,
      query: "WMSU to Ayala Mall",
      timestamp: "5 hours ago",
      results: 2,
    },
    {
      id: 3,
      query: "Tetuan Junction alternatives",
      timestamp: "1 day ago",
      results: 4,
    },
    {
      id: 4,
      query: "Flood-safe routes downtown",
      timestamp: "2 days ago",
      results: 6,
    },
  ]);

  const handleRepeatRoute = (route: any) => {
    toast.success(`Repeating route: ${route.from} to ${route.to}`);
    console.log("Repeating route:", route);
  };

  const handleSaveRoute = (route: any) => {
    toast.success("Route saved to favorites!");
    console.log("Saving route:", route);
  };

  const handleDeleteFavorite = (routeId: number) => {
    setFavoriteRoutes((prev) => prev.filter((route) => route.id !== routeId));
    toast.success("Favorite route removed");
  };

  const handleClearSearches = () => {
    setRecentSearches([]);
    toast.success("Search history cleared");
  };

  const handleExportHistory = () => {
    toast.success("Route history exported successfully");
    console.log("Exporting route history");
  };

  const handleAddFavorite = (newFavorite: any) => {
    setFavoriteRoutes((prev) => [...prev, newFavorite]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-safe-green";
      case "interrupted":
        return "bg-alert-orange";
      default:
        return "bg-gray-500";
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-safe-green";
      case "moderate":
        return "bg-caution-yellow";
      case "high":
        return "bg-alert-red";
      default:
        return "bg-gray-500";
    }
  };

  const filteredHistory = routeHistory.filter(
    (route) =>
      route.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.to.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFavorites = favoriteRoutes.filter(
    (route) =>
      route.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.to.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      <main className="pt-20 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-wmsu-blue mb-2">My Routes</h1>
          <p className="text-gray-600">
            Manage your route history, favorites, and recent searches
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <Input
            placeholder="Search routes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="history" className="text-base">
              History ({filteredHistory.length})
            </TabsTrigger>
            <TabsTrigger value="favorites" className="text-base">
              Favorites ({filteredFavorites.length})
            </TabsTrigger>
            <TabsTrigger value="recent" className="text-base">
              Recent ({recentSearches.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">
                Route History
              </h2>
              <Button variant="outline" onClick={handleExportHistory}>
                <i className="fas fa-download mr-2"></i>
                Export History
              </Button>
            </div>

            <div className="grid gap-4">
              {filteredHistory.map((route) => (
                <Card
                  key={route.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">
                          {route.from} → {route.to}
                        </CardTitle>
                        <CardDescription className="flex items-center mt-1">
                          <i className="fas fa-calendar mr-2"></i>
                          {route.date} at {route.time}
                        </CardDescription>
                      </div>
                      <Badge
                        className={`${getStatusColor(route.status)} text-white`}
                      >
                        {route.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <p className="font-semibold">{route.duration}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Distance:</span>
                        <p className="font-semibold">{route.distance}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Weather:</span>
                        <p className="font-semibold">
                          {route.weatherCondition}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRepeatRoute(route)}
                        >
                          <i className="fas fa-redo mr-1"></i>
                          Repeat
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveRoute(route)}
                        >
                          <i className="fas fa-heart mr-1"></i>
                          Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="favorites" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">
                Favorite Routes
              </h2>
              <Button onClick={() => setIsAddFavoriteOpen(true)}>
                <i className="fas fa-plus mr-2"></i>
                Add Favorite
              </Button>
            </div>

            <div className="grid gap-4">
              {filteredFavorites.map((route) => (
                <Card
                  key={route.id}
                  className="hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center">
                          <i className="fas fa-heart text-red-500 mr-2"></i>
                          {route.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {route.from} → {route.to}
                        </CardDescription>
                      </div>
                      <Badge
                        className={`${getRiskColor(
                          route.riskLevel
                        )} text-white`}
                      >
                        {route.riskLevel} risk
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                      <div>
                        <span className="text-gray-500">Frequency:</span>
                        <p className="font-semibold">{route.frequency}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Avg Duration:</span>
                        <p className="font-semibold">{route.avgDuration}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Last Used:</span>
                        <p className="font-semibold">{route.lastUsed}</p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => toast.success("Navigation started!")}
                        >
                          <i className="fas fa-route mr-1"></i>
                          Navigate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteFavorite(route.id)}
                        >
                          <i className="fas fa-trash mr-1"></i>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="recent" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">
                Recent Searches
              </h2>
              <Button variant="outline" onClick={handleClearSearches}>
                <i className="fas fa-trash mr-2"></i>
                Clear All
              </Button>
            </div>

            <div className="grid gap-3">
              {recentSearches.map((search) => (
                <Card
                  key={search.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-800">
                          {search.query}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {search.timestamp} • {search.results} results found
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toast.info("Searching again...")}
                        >
                          <i className="fas fa-search mr-1"></i>
                          Search Again
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRecentSearches((prev) =>
                              prev.filter((s) => s.id !== search.id)
                            );
                            toast.success("Search removed");
                          }}
                        >
                          <i className="fas fa-times mr-1"></i>
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

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
