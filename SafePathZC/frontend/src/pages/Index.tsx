import { useState, useEffect, useRef } from 'react';
import { MapView } from "../components/MapView"; // Your new MapView component
import { NavigationBar } from "../components/NavigationBar";
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