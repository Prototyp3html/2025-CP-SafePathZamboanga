import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

export const NavigationBar = () => {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Load user data and profile picture
  useEffect(() => {
    const loadUserProfile = () => {
      const userData = localStorage.getItem("user_data");
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log("NavigationBar: User data:", {
          role: parsedUser.role,
          userType: parsedUser.userType,
          isAdmin:
            parsedUser.role === "admin" || parsedUser.userType === "admin",
        });
        setUser(parsedUser);

        // Check for profile picture using email as consistent key
        const userKey = parsedUser.email; // Always use email for consistency
        const userProfilePicture = localStorage.getItem(
          `user_profile_picture_${userKey}`
        );

        if (userProfilePicture) {
          setProfilePicture(userProfilePicture);
        } else if (parsedUser.profilePicture) {
          // Migrate from user data to user-specific key
          setProfilePicture(parsedUser.profilePicture);
          localStorage.setItem(
            `user_profile_picture_${userKey}`,
            parsedUser.profilePicture
          );
        } else {
          setProfilePicture(null);
        }
      } else {
        setUser(null);
        setProfilePicture(null);
      }
    };

    // Load on mount
    loadUserProfile();

    // Listen for storage changes (for cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "user_data" || e.key?.startsWith("user_profile_picture_")) {
        loadUserProfile();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const navLinks = [
    { to: "/map", label: "Map", icon: "fa-map" },
    { to: "/my-routes", label: "Routes", icon: "fa-route" },
    { to: "/alerts", label: "Alerts", icon: "fa-bell" },
    { to: "/community", label: "Community", icon: "fa-users" },
    { to: "/settings", label: "Settings", icon: "fa-cog" },
  ];

  return (
    <>
      {/* Desktop & Tablet Navigation */}
      <nav className="bg-gradient-to-r from-blue-400 to-blue-600 text-white h-12 flex items-center px-4 md:px-6 shadow-lg w-full rounded-b-3xl">
        {/* Logo */}
        <div className="flex items-center space-x-2 md:space-x-3">
          <div className="flex items-center">
            <img
              src="/logo.png"
              alt="SafePathZC Logo"
              className="w-7 h-7 md:w-8 md:h-8 object-contain brightness-0 invert"
            />
          </div>
          <div className="text-white font-bold text-base md:text-lg tracking-wide hidden sm:block">
            SAFEPATH ZC
          </div>
          <div className="text-white font-bold text-sm tracking-wide sm:hidden">
            SAFEPATH
          </div>
        </div>

        {/* Desktop Navigation Links - Hidden on mobile */}
        <div className="hidden lg:flex flex-1 justify-center">
          <div className="flex space-x-4 xl:space-x-6">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 xl:px-4 py-1 text-sm font-medium rounded transition-all duration-200 ${
                  isActive(link.to)
                    ? "bg-blue-700 text-white shadow-sm"
                    : "text-white hover:bg-blue-500 hover:bg-opacity-40"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Tablet Navigation Links - Visible on tablets only */}
        <div className="hidden md:flex lg:hidden flex-1 justify-center">
          <div className="flex space-x-2">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-2 py-1 text-xs font-medium rounded transition-all duration-200 ${
                  isActive(link.to)
                    ? "bg-blue-700 text-white shadow-sm"
                    : "text-white hover:bg-blue-500 hover:bg-opacity-40"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Mobile: Hamburger Menu */}
        <div className="flex md:hidden flex-1 justify-end mr-2">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-white p-1.5 hover:bg-blue-500 hover:bg-opacity-40 rounded transition-all"
            aria-label="Toggle menu"
          >
            <i
              className={`fas ${
                mobileMenuOpen ? "fa-times" : "fa-bars"
              } text-lg`}
            ></i>
          </button>
        </div>

        {/* User Icon */}
        <div>
          <Link
            to={
              user?.role === "admin" || user?.userType === "admin"
                ? "/admin"
                : "/profile"
            }
            className={`flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full transition-all duration-200 overflow-hidden ${
              isActive(
                user?.role === "admin" || user?.userType === "admin"
                  ? "/admin"
                  : "/profile"
              )
                ? "bg-blue-700 bg-opacity-80"
                : "bg-white bg-opacity-20 hover:bg-opacity-30"
            }`}
          >
            {profilePicture ? (
              <img
                src={profilePicture}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            ) : (
              <i className="fas fa-user text-white text-xs md:text-sm"></i>
            )}
          </Link>
        </div>
      </nav>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed top-12 left-0 right-0 bg-gradient-to-r from-blue-500 to-blue-700 shadow-lg z-50 rounded-b-2xl animate-slide-down">
          <div className="flex flex-col space-y-1 p-3">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive(link.to)
                    ? "bg-blue-800 text-white shadow-sm"
                    : "text-white hover:bg-blue-600 hover:bg-opacity-60"
                }`}
              >
                <i className={`fas ${link.icon} w-5`}></i>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
