import React, { createContext, useContext, useState, useEffect } from "react";

interface UserPreferences {
  // Route Preferences
  prioritizeSafety: boolean;
  avoidPoorlyLit: boolean;
  includePublicTransport: boolean;
  avoidFloods: boolean;
  fastestRoute: boolean;
  avoidTolls: boolean;
  mainRoads: boolean;

  // Notifications
  safetyAlerts: boolean;
  routeSuggestions: boolean;
  weeklyReports: boolean;
  floodAlerts: boolean;
  weatherUpdates: boolean;
  trafficUpdates: boolean;
  communityReports: boolean;
  emergencyAlerts: boolean;
  routeReminders: boolean;

  // Privacy
  shareAnonymousData: boolean;
  allowLocationTracking: boolean;

  // App Preferences
  language: string;
  units: string;
  theme: string;
  mapStyle: string;
}

interface PreferencesContextType {
  preferences: UserPreferences;
  updatePreference: (key: keyof UserPreferences, value: any) => void;
  savePreferences: () => Promise<void>;
  isLoading: boolean;
}

const defaultPreferences: UserPreferences = {
  // Route Preferences
  prioritizeSafety: true,
  avoidPoorlyLit: true,
  includePublicTransport: false,
  avoidFloods: true,
  fastestRoute: true,
  avoidTolls: false,
  mainRoads: false,

  // Notifications
  safetyAlerts: true,
  routeSuggestions: true,
  weeklyReports: false,
  floodAlerts: true,
  weatherUpdates: true,
  trafficUpdates: false,
  communityReports: true,
  emergencyAlerts: true,
  routeReminders: false,

  // Privacy
  shareAnonymousData: true,
  allowLocationTracking: false,

  // App Preferences
  language: "english",
  units: "metric",
  theme: "light",
  mapStyle: "standard",
};

const PreferencesContext = createContext<PreferencesContextType | undefined>(
  undefined
);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [preferences, setPreferences] =
    useState<UserPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(false);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem("user_preferences");
    if (savedPreferences) {
      try {
        const parsed = JSON.parse(savedPreferences);
        setPreferences({ ...defaultPreferences, ...parsed });
      } catch (error) {
        console.error("Error parsing saved preferences:", error);
      }
    }
  }, []);

  // Load preferences from backend if user is logged in
  useEffect(() => {
    const token = localStorage.getItem("user_token");
    if (token) {
      loadPreferencesFromBackend();
    }
  }, []);

  const loadPreferencesFromBackend = async () => {
    const token = localStorage.getItem("user_token");
    if (!token) return;

    try {
      setIsLoading(true);
      const response = await fetch(`${BACKEND_URL}/auth/preferences`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const backendPreferences = await response.json();
        setPreferences({ ...defaultPreferences, ...backendPreferences });
        localStorage.setItem(
          "user_preferences",
          JSON.stringify({ ...defaultPreferences, ...backendPreferences })
        );
      }
    } catch (error) {
      console.error("Error loading preferences from backend:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = (key: keyof UserPreferences, value: any) => {
    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    // Save to localStorage immediately
    localStorage.setItem("user_preferences", JSON.stringify(newPreferences));
  };

  const savePreferences = async (): Promise<void> => {
    const token = localStorage.getItem("user_token");

    if (token) {
      try {
        setIsLoading(true);
        const response = await fetch(`${BACKEND_URL}/auth/preferences`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(preferences),
        });

        if (!response.ok) {
          throw new Error("Failed to save preferences to backend");
        }
      } catch (error) {
        console.error("Error saving preferences to backend:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    }

    // Always save to localStorage
    localStorage.setItem("user_preferences", JSON.stringify(preferences));
  };

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        updatePreference,
        savePreferences,
        isLoading,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
};
