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

function App() {
  return (
    <PreferencesProvider>
      <ConfirmationProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/map" element={<Index />} />
            <Route path="/my-routes" element={<MyRoutes />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/community" element={<Community />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<AdminSettings />} />
          </Routes>
          <Toaster />
        </Router>
      </ConfirmationProvider>
    </PreferencesProvider>
  );
}

export default App;
