import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import MyRoutes from "./pages/MyRoutes";
import Alerts from "./pages/Alerts";
import Community from "./pages/CommunityForum";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/map" element={<Index />} />
        <Route path="/my-routes" element={<MyRoutes />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/community" element={<Community />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </Router>
  );
}

export default App;
