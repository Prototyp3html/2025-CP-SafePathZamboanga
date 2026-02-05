import { useState, useEffect, useRef } from "react";
import { MapView } from "../components/MapView"; // Your new MapView component
import { NavigationBar } from "../components/NavigationBar";
import { AlertBanner } from "../components/AlertBanner";
import { ReportModal } from "../components/ReportModal";
import { EmergencyModal } from "../components/EmergencyModal";
import { WelcomeModal } from "../components/WelcomeModal";
import {
  WhatIfSimulation,
  SimulationScenario,
} from "../components/WhatIfSimulation";
import { useNavigate } from "react-router-dom";
import { notification } from "@/utils/notifications";

const Index = () => {
  const [activeModal, setActiveModal] = useState<
    "route" | "report" | "emergency" | "simulation" | null
  >(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [simulationScenario, setSimulationScenario] =
    useState<SimulationScenario | null>(null);
  const [currentStartLocation, setCurrentStartLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [currentEndLocation, setCurrentEndLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.body.style.overflow = "hidden";

    // Check login status
    const token = localStorage.getItem("user_token");
    setIsLoggedIn(!!token);

    // Check if welcome modal should be shown
    const welcomeSkipped = localStorage.getItem("safePathWelcomeSkipped");
    if (!welcomeSkipped) {
      setShowWelcome(true);
    }

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

  const handleLoginRequired = () => {
    // Navigate to login page or show login modal
    navigate("/login");
  };

  const handleRouteSelect = (route: string) => {
    setSelectedRoute(route);
    console.log("Route selected:", route);
  };

  const [isSimulating, setIsSimulating] = useState(false);

  const handleRunSimulation = async (scenario: SimulationScenario) => {
    console.log("🔬 [What-If] Running simulation:", scenario);
    notification.info("🔬 Running What-If simulation...");
    setIsSimulating(true);

    try {
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      const floodRoutesUrl = `${BACKEND_URL}/api/routing/flood-routes`;

      const weatherData = {
        rainfall: scenario.customRainfall || 0,
      };

      const requestBody = {
        start_lat: scenario.start_lat,
        start_lng: scenario.start_lng,
        end_lat: scenario.end_lat,
        end_lng: scenario.end_lng,
        weather_data: weatherData,
        simulated_flood_zones: scenario.floodZones,
        simulated_incidents: scenario.incidents,
      };

      console.log("📡 [What-If] Sending to:", floodRoutesUrl);
      console.log("📡 [What-If] Sending simulation request:");
      console.log("  Start:", scenario.start_lat, scenario.start_lng);
      console.log("  End:", scenario.end_lat, scenario.end_lng);
      console.log("  Rainfall:", scenario.customRainfall, "mm/hr");
      console.log(
        "  Flood Zones:",
        scenario.floodZones.length,
        scenario.floodZones
      );
      console.log(
        "  Incidents:",
        scenario.incidents.length,
        scenario.incidents
      );

      const response = await fetch(floodRoutesUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📡 [What-If] Status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("✅ [What-If] Routes count:", data.routes?.length);
        console.log("✅ [What-If] Response:", data);

        console.log("✅ [What-If] Setting simulationScenario state");
        setSimulationScenario({
          ...scenario,
          _simulationResult: data,
        } as any);

        setActiveModal(null);
        notification.success(
          "✅ Simulation complete! Check map.",
          "Simulation Results"
        );
      } else {
        const errorText = await response.text();
        console.error(
          "❌ [What-If] Status",
          response.statusText,
          ":",
          errorText
        );
        notification.error(
          "❌ Simulation failed: " + response.statusText,
          "Error"
        );
      }
    } catch (error) {
      console.error("❌ [What-If] Exception:", error);
      notification.error(
        "❌ Error: " + (error instanceof Error ? error.message : "Unknown"),
        "Error"
      );
    } finally {
      setIsSimulating(false);
    }
  };

  const handleClearSimulation = () => {
    setSimulationScenario(null);
    window.dispatchEvent(new CustomEvent("simulation-scenario-clear"));
    notification.info("🧹 Simulation cleared");
  };

  return (
    <div className="h-screen bg-gray-50 font-sans overflow-hidden">
      <NavigationBar />
      <AlertBanner />

      {/* Clear Simulation Button - positioned in top-right under side menu */}
      {simulationScenario && (
        <button
          onClick={handleClearSimulation}
          className="fixed top-12 right-4 z-40 px-3 py-2 text-xs sm:text-sm bg-red-600 text-white rounded-lg shadow-lg hover:bg-red-700 flex items-center gap-2 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Clear Simulation
        </button>
      )}

      <main className="pt-12 md:pt-14 lg:pt-16 h-[calc(100vh-48px)] md:h-[calc(100vh-56px)] lg:h-[calc(100vh-64px)]">
        {/* Main Content Grid */}
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
          <div className="grid grid-cols-1 gap-2 sm:gap-4 h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] lg:h-[calc(100vh-120px)]">
            {/* Main Map Area - Full width on mobile, adjusted on larger screens */}
            <div className="col-span-1">
              {/* Your MapView component */}
              <div className="h-full w-full rounded-lg overflow-hidden shadow-sm sm:shadow-md">
                <MapView
                  onModalOpen={setActiveModal}
                  simulationScenario={simulationScenario}
                  onLocationUpdate={(start, end) => {
                    setCurrentStartLocation(start);
                    setCurrentEndLocation(end);
                  }}
                  activeModal={activeModal}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <WelcomeModal
        isOpen={showWelcome}
        onClose={() => setShowWelcome(false)}
      />
      {activeModal === "report" && (
        <ReportModal
          onClose={() => setActiveModal(null)}
          isLoggedIn={isLoggedIn}
          onLoginRequired={handleLoginRequired}
        />
      )}
      {activeModal === "emergency" && (
        <EmergencyModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "simulation" && (
        <WhatIfSimulation
          onClose={() => setActiveModal(null)}
          onRunSimulation={handleRunSimulation}
          isSimulating={isSimulating}
          startLocation={currentStartLocation}
          endLocation={currentEndLocation}
        />
      )}
    </div>
  );
};

export default Index;
