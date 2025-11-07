import React, { useState, useEffect } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { UserAuth } from "../components/UserAuth";
import { AdminDashboard } from "../components/AdminDashboard";
import { usePreferences } from "../contexts/PreferencesContext";

const Profile = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const { preferences, updatePreference, savePreferences } = usePreferences();

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem("user_token");
    const userData = localStorage.getItem("user_data");
    const adminToken = localStorage.getItem("admin_token");
    const adminData = localStorage.getItem("admin_data");

    // Check for admin authentication first
    if (adminToken && adminData) {
      setIsLoggedIn(true);
      const parsedAdmin = JSON.parse(adminData);
      setUser(parsedAdmin);
      // Don't fetch fresh data for admins - they use different auth system
      console.log("👑 Admin logged in, using stored admin data");
    } else if (token && userData) {
      setIsLoggedIn(true);
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);

      // Load profile picture using email as consistent key
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
      }

      // Only fetch fresh data for regular users, not admins
      if (parsedUser.userType !== "admin" && parsedUser.role !== "admin") {
        fetchFreshUserData(token);
      }
    }
  }, []);

  const fetchFreshUserData = async (token: string) => {
    try {
      console.log("🔄 Fetching fresh user data for Profile page...");
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
      const response = await fetch(`${BACKEND_URL}/auth/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const freshUserData = await response.json();
        console.log("✅ Fresh user data for Profile:", freshUserData);
        setUser(freshUserData);
        localStorage.setItem("user_data", JSON.stringify(freshUserData));
      }
    } catch (error) {
      console.error("Error fetching fresh user data:", error);
    }
  };

  const handleLoginSuccess = (userData: any) => {
    setIsLoggedIn(true);
    setUser(userData);
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    // Remove user-specific profile picture before clearing user data
    if (user?.email) {
      localStorage.removeItem(`user_profile_picture_${user.email}`);
    }

    localStorage.removeItem("user_token");
    localStorage.removeItem("user_data");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_data");
    // Don't remove user_preferences as they can be reused

    setIsLoggedIn(false);
    setUser(null);
    setProfilePicture(null);
  };

  const handleLoginClick = () => {
    setShowAuthModal(true);
  };

  // Check if user is admin
  const isAdmin = user?.userType === "admin" || user?.role === "admin";

  // If user is admin, show admin panel instead of profile
  if (isLoggedIn && isAdmin) {
    return (
      <>
        <NavigationBar />
        <div className="min-h-screen bg-gray-50 pt-20">
          <div className="max-w-6xl mx-auto px-4 py-8">
            {/* Admin Header */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Admin Dashboard
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Welcome, {user?.name || "Administrator"}
              </p>
              <div className="mt-4">
                <button
                  onClick={handleLogout}
                  className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Admin Dashboard Component */}
            <AdminDashboard />
          </div>
        </div>
      </>
    );
  }

  // If not logged in, show login prompt
  if (!isLoggedIn) {
    return (
      <>
        <NavigationBar />
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20">
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  className="w-12 h-12 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                My Profile
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-8">
                Please log in to view your profile and manage your account
              </p>
              <button
                onClick={handleLoginClick}
                className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Login / Register
              </button>
            </div>
          </div>
        </div>

        {/* Authentication Modal */}
        <UserAuth
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={handleLoginSuccess}
        />
      </>
    );
  }

  // If logged in, show the original profile design
  return (
    <>
      <NavigationBar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              My Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your account settings and view your activity
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex justify-center mb-8">
            <div className="flex space-x-8 border-b border-gray-200">
              <button
                onClick={() => setActiveTab("personal")}
                className={`pb-4 px-1 border-b-2 font-medium transition-colors ${
                  activeTab === "personal"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Personal Info
              </button>
              <button
                onClick={() => setActiveTab("activity")}
                className={`pb-4 px-1 border-b-2 font-medium transition-colors ${
                  activeTab === "activity"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Activity
              </button>
              <button
                onClick={() => setActiveTab("preferences")}
                className={`pb-4 px-1 border-b-2 font-medium transition-colors ${
                  activeTab === "preferences"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Preferences
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Profile Card */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 text-center">
                {/* Profile Picture */}
                <div className="w-32 h-32 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden">
                  {profilePicture ? (
                    <img
                      src={profilePicture}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg
                      className="w-16 h-16 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  )}
                </div>

                {/* User Info */}
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {user?.name || "User"}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {user?.location || "Location not set"}
                </p>

                {/* Member Since Badge */}
                <div className="bg-gray-900 dark:bg-blue-600 text-white px-4 py-2 rounded-full text-sm mb-6 inline-block">
                  Member since{" "}
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })
                    : "October 2025"}
                </div>

                {/* Community Points */}
                <div className="mb-6">
                  <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-1">
                    {user?.communityPoints || user?.community_points || 0}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400 text-sm">
                    Community Points
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {user?.routesUsed || user?.routes_used || 0}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-sm">
                      Routes Used
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {user?.reportsSubmitted || user?.reports_submitted || 0}
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-sm">
                      Reports
                    </div>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  className="mt-6 w-full bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>

            {/* Right Content */}
            <div className="lg:col-span-2">
              {activeTab === "personal" && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    Personal Information
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Update your personal details
                  </p>

                  <div className="space-y-6">
                    {/* Full Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={user?.name || "Maria Santos"}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        readOnly
                      />
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email
                      </label>
                      <input
                        type="email"
                        value={user?.email || "maria.santos@email.com"}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        readOnly
                      />
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={user?.phone || "+63 912 345 6789"}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        readOnly
                      />
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Location
                      </label>
                      <input
                        type="text"
                        value={user?.location || ""}
                        placeholder="Location not set"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "activity" && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    Recent Activity
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Your recent routes and interactions
                  </p>

                  <div className="space-y-4">
                    {/* Check if user has any activity */}
                    {!user?.recentActivity ||
                    user.recentActivity.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <svg
                            className="w-8 h-8 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                            />
                          </svg>
                        </div>
                        <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                          No Activity Yet
                        </h4>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                          Start using SafePath to see your recent routes and
                          activities here.
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Use the map to plan routes, submit reports, or engage
                          with the community.
                        </p>
                      </div>
                    ) : (
                      user.recentActivity.map(
                        (activity: any, index: number) => (
                          <div
                            key={index}
                            className={`border-l-4 ${
                              activity.color || "border-blue-500"
                            } pl-4`}
                          >
                            <h4 className="font-semibold text-gray-900">
                              {activity.title}
                            </h4>
                            <p className="text-gray-600 text-sm">
                              {activity.description}
                            </p>
                            <p className="text-gray-500 text-xs">
                              {activity.timestamp}
                            </p>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              )}

              {activeTab === "preferences" && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                    Preferences
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Customize your SafePath experience
                  </p>

                  <div className="space-y-6">
                    {/* Route Preferences */}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Route Preferences
                      </h4>
                      <div className="space-y-3">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.prioritizeSafety}
                            onChange={(e) =>
                              updatePreference(
                                "prioritizeSafety",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Prioritize safety over speed
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.avoidPoorlyLit}
                            onChange={(e) =>
                              updatePreference(
                                "avoidPoorlyLit",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Avoid poorly lit areas at night
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.includePublicTransport}
                            onChange={(e) =>
                              updatePreference(
                                "includePublicTransport",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Include public transport options
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Notifications */}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Notifications
                      </h4>
                      <div className="space-y-3">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.safetyAlerts}
                            onChange={(e) =>
                              updatePreference("safetyAlerts", e.target.checked)
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Safety alerts in my area
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.routeSuggestions}
                            onChange={(e) =>
                              updatePreference(
                                "routeSuggestions",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            New route suggestions
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.weeklyReports}
                            onChange={(e) =>
                              updatePreference(
                                "weeklyReports",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Weekly safety reports
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Privacy */}
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Privacy
                      </h4>
                      <div className="space-y-3">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.shareAnonymousData}
                            onChange={(e) =>
                              updatePreference(
                                "shareAnonymousData",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Share anonymous route data for community safety
                          </span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={preferences.allowLocationTracking}
                            onChange={(e) =>
                              updatePreference(
                                "allowLocationTracking",
                                e.target.checked
                              )
                            }
                            className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-gray-700">
                            Allow location tracking for better routes
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          savePreferences()
                            .then(() => {
                              alert("Preferences saved successfully!");
                            })
                            .catch(() => {
                              alert(
                                "Error saving preferences. Changes saved locally."
                              );
                            });
                        }}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Save Preferences
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
