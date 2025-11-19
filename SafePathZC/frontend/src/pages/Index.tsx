import { useState, useEffect, useRef } from "react";
import { MapView } from "../components/MapView"; // Your new MapView component
import { NavigationBar } from "../components/NavigationBar";
import { ReportModal } from "../components/ReportModal";
import { EmergencyModal } from "../components/EmergencyModal";
import { WelcomeModal } from "../components/WelcomeModal";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [activeModal, setActiveModal] = useState<
    "route" | "report" | "emergency" | null
  >(null);
  const [selectedRoute, setSelectedRoute] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
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

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <NavigationBar />

      <main className="pt-12 md:pt-14 lg:pt-16">
        {/* Main Content Grid */}
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
          <div className="grid grid-cols-1 gap-2 sm:gap-4 h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] lg:h-[calc(100vh-120px)]">
            {/* Main Map Area - Full width on mobile, adjusted on larger screens */}
            <div className="col-span-1">
              {/* Your MapView component */}
              <div className="h-full w-full rounded-lg overflow-hidden shadow-sm sm:shadow-md">
                <MapView onModalOpen={setActiveModal} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <WelcomeModal isOpen={showWelcome} onClose={() => setShowWelcome(false)} />
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
    </div>
  );
};

export default Index;
