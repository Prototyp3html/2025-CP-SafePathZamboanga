import React from "react";
import { Link, useLocation } from "react-router-dom";

export const NavigationBar = () => {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <nav className="bg-gradient-to-r from-blue-400 to-blue-600 text-white h-12 flex items-center px-6 shadow-lg w-full rounded-b-3xl">
      {/* Logo */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center">
          <img
            src="/logo.png"
            alt="SafePathZC Logo"
            className="w-8 h-8 object-contain brightness-0 invert"
          />
        </div>
        <div className="text-white font-bold text-lg tracking-wide">
          SAFEPATH ZC
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 flex justify-center">
        <div className="flex space-x-6">
          <Link
            to="/map"
            className={`px-4 py-1 text-sm font-medium rounded transition-all duration-200 ${
              isActive("/map")
                ? "bg-blue-700 text-white shadow-sm"
                : "text-white hover:bg-blue-500 hover:bg-opacity-40"
            }`}
          >
            Map
          </Link>
          <Link
            to="/my-routes"
            className={`px-4 py-1 text-sm font-medium rounded transition-all duration-200 ${
              isActive("/my-routes")
                ? "bg-blue-700 text-white shadow-sm"
                : "text-white hover:bg-blue-500 hover:bg-opacity-40"
            }`}
          >
            My Routes
          </Link>
          <Link
            to="/alerts"
            className={`px-4 py-1 text-sm font-medium rounded transition-all duration-200 ${
              isActive("/alerts")
                ? "bg-blue-700 text-white shadow-sm"
                : "text-white hover:bg-blue-500 hover:bg-opacity-40"
            }`}
          >
            Alerts
          </Link>
          <Link
            to="/community"
            className={`px-4 py-1 text-sm font-medium rounded transition-all duration-200 ${
              isActive("/community")
                ? "bg-blue-700 text-white shadow-sm"
                : "text-white hover:bg-blue-500 hover:bg-opacity-40"
            }`}
          >
            Community
          </Link>
          <Link
            to="/settings"
            className={`px-4 py-1 text-sm font-medium rounded transition-all duration-200 ${
              isActive("/settings")
                ? "bg-blue-700 text-white shadow-sm"
                : "text-white hover:bg-blue-500 hover:bg-opacity-40"
            }`}
          >
            Settings
          </Link>
        </div>
      </div>

      {/* User Icon */}
      <div>
        <Link
          to="/profile"
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ${
            isActive("/profile")
              ? "bg-blue-700 bg-opacity-80"
              : "bg-white bg-opacity-20 hover:bg-opacity-30"
          }`}
        >
          <i className="fas fa-user text-white text-sm"></i>
        </Link>
      </div>
    </nav>
  );
};
