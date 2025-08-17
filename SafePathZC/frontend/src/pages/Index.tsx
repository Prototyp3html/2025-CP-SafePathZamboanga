import { useState, useEffect, useRef } from 'react';
import { MapView } from "../components/MapView"; // Your new MapView component
import { NavigationBar } from "../components/NavigationBar";
// Remove the InteractiveMap import since we're replacing it
// import { InteractiveMap } from "../components/InteractiveMap"; 
import { RouteSearchTool } from "../components/RouteSearchTool";
import { WeatherDashboard } from "../components/WeatherDashboard";
import { AlertBanner } from "../components/AlertBanner";
import { FooterActions } from "../components/FooterActions";
import { RouteModal } from "../components/RouteModal";
import { ReportModal } from "../components/ReportModal";
import { EmergencyModal } from "../components/EmergencyModal";

const Index = () => {
  const [activeModal, setActiveModal] = useState<
    "route" | "report" | "emergency" | null
  >(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");

  const handleRouteSelect = (route: string) => {
    setSelectedRoute(route);
    console.log("Route selected:", route);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <NavigationBar />

      {/* Alert Banner */}
      <AlertBanner />

      <main className="pt-16">
        {/* Main Content Grid */}
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-[calc(100vh-120px)]">
            {/* Left Sidebar - Search and Controls */}
            <div className="lg:col-span-1 space-y-4 overflow-y-auto">
              <RouteSearchTool onRouteSelect={handleRouteSelect} />

              {/* Risk Levels Legend */}
              <div className="bg-white rounded-lg shadow-lg p-4">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">
                  Risk Levels
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-safe-green"></div>
                    <span className="text-xs text-gray-700">Safe</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-caution-yellow"></div>
                    <span className="text-xs text-gray-700">Caution</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-alert-red"></div>
                    <span className="text-xs text-gray-700">High Risk</span>
                  </div>
                </div>
              </div>

              <WeatherDashboard />
            </div>

            {/* Main Map Area - REPLACED InteractiveMap with MapView */}
            <div className="lg:col-span-4">
              {/* Your MapView component instead of InteractiveMap */}
              <div className="h-full w-full">
                <MapView />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Actions */}
      <FooterActions onModalOpen={setActiveModal} />

      {/* Modals */}
      {activeModal === "route" && (
        <RouteModal onClose={() => setActiveModal(null)} />
      )}
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