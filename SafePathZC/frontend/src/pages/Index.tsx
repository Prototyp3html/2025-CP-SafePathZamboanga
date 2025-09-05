import { useState, useEffect, useRef } from "react";
import { MapView } from "../components/MapView"; // Your new MapView component
import { NavigationBar } from "../components/NavigationBar";
import { ReportModal } from "../components/ReportModal";
import { EmergencyModal } from "../components/EmergencyModal";

const Index = () => {
  const [activeModal, setActiveModal] = useState<
    "route" | "report" | "emergency" | null
  >(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");

  useEffect(() => {
    document.body.style.overflow = "hidden";

    // Check for search parameters
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get("search");

    if (searchQuery) {
      // Store search request for MapView to handle
      const searchRequest = {
        query: searchQuery,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        "safePathSearchRequest",
        JSON.stringify(searchRequest)
      );

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  const handleRouteSelect = (route: string) => {
    setSelectedRoute(route);
    console.log("Route selected:", route);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <NavigationBar />

      <main className="pt-16">
        {/* Main Content Grid */}
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[calc(100vh-120px)]">
            {/* Left Sidebar - Search and Controls */}

            {/* Main Map Area - REPLACED InteractiveMap with MapView */}
            <div className="lg:col-span-4">
              {/* Your MapView component instead of InteractiveMap */}
              <div className="h-full w-full">
                <MapView onModalOpen={setActiveModal} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {activeModal === "report" && (
        <ReportModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "emergency" && (
        <EmergencyModal onClose={() => setActiveModal(null)} />
      )}
    </div>
  );
};

export default Index;
