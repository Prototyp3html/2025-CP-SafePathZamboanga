import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { Toaster } from "./components/ui/toaster";
import { ConfirmationProvider } from "./components/ui/confirmation-dialog";
import Index from "./pages/Index";
import MyRoutes from "./pages/MyRoutes";
import Alerts from "./pages/Alerts";
import Community from "./pages/CommunityForum";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import AdminSettings from "./pages/AdminSettings";
import OAuthCallback from "./components/OAuthCallback";

// Activity heartbeat component
function ActivityTracker() {
  useEffect(() => {
    const updateActivity = async () => {
      const token =
        localStorage.getItem("user_token") ||
        localStorage.getItem("admin_token");
      if (!token) return;

      try {
        const BACKEND_URL =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
        await fetch(`${BACKEND_URL}/auth/update-activity`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch (error) {
        // Silently fail - this is just for activity tracking
        console.debug("Activity update failed:", error);
      }
    };

    // Update activity immediately on mount
    updateActivity();

    // Update activity every 5 minutes (300000 ms)
    const interval = setInterval(updateActivity, 300000);

    return () => clearInterval(interval);
  }, []);

  return null;
}

function App() {
  return (
    <PreferencesProvider>
      <ConfirmationProvider>
        <Router>
          <ActivityTracker />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/map" element={<Index />} />
            <Route path="/my-routes" element={<MyRoutes />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/community" element={<Community />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminSettings />} />
            <Route
              path="/auth/google/callback"
              element={<OAuthCallback provider="google" />}
            />
            <Route
              path="/auth/facebook/callback"
              element={<OAuthCallback provider="facebook" />}
            />
          </Routes>
          <Toaster />
        </Router>
      </ConfirmationProvider>
    </PreferencesProvider>
  );
}

export default App;
