import { useState, useEffect, useRef } from "react";
import { MapView } from "../components/MapView"; // Your new MapView component
import { NavigationBar } from "../components/NavigationBar";
import { ReportModal } from "../components/ReportModal";
import { EmergencyModal } from "../components/EmergencyModal";
import { WelcomeModal } from "../components/WelcomeModal";
import {
  WhatIfSimulation,
  SimulationScenario,
} from "../components/WhatIfSimulation";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [activeModal, setActiveModal] = useState<
    "route" | "report" | "emergency" | "whatif" | null
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

  const handleRunSimulation = async (scenario: SimulationScenario) => {
    console.log("Running simulation with scenario:", scenario);

    try {
      // Close the modal first
      setActiveModal(null);

      // Call the routing API with simulated conditions
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
      const floodRoutesUrl = `${BACKEND_URL}/api/routing/flood-routes`;

      // Build weather data with rainfall from simulation
      const weatherData = {
        rainfall: scenario.customRainfall || 0, // mm/hr
      };

      // Build request body with simulation scenario
      const requestBody = {
        start_lat: scenario.start_lat,
        start_lng: scenario.start_lng,
        end_lat: scenario.end_lat,
        end_lng: scenario.end_lng,
        weather_data: weatherData,
        // Optional: Include flood zones and incidents for future backend enhancement
        simulated_flood_zones: scenario.floodZones,
        simulated_incidents: scenario.incidents,
      };

      console.log("📡 Sending simulation request to backend:", requestBody);

      const response = await fetch(floodRoutesUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Simulation routing response:", data);

        // Store the simulation result to display on map
        setSimulationScenario({
          ...scenario,
          _simulationResult: data, // Store result for MapView to use
        } as any);
      } else {
        console.error("❌ Simulation routing failed:", response.statusText);
        alert("Simulation failed. Please check your route and try again.");
      }
    } catch (error) {
      console.error("❌ Error running simulation:", error);
      alert(
        "Error running simulation. Please check your connection and try again."
      );
    }
  };

  return (
    <div className="h-screen bg-gray-50 font-sans overflow-hidden">
      <NavigationBar />

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
      {activeModal === "whatif" && (
        <WhatIfSimulation
          onClose={() => setActiveModal(null)}
          onRunSimulation={handleRunSimulation}
          startLocation={currentStartLocation}
          endLocation={currentEndLocation}
        />
      )}
    </div>
  );
};

export default Index;
