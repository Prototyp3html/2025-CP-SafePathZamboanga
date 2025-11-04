import { useState } from "react";
import {
  TransportationSelector,
  TransportationMode,
} from "./TransportationSelector";

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id: string;
  type?: string;
  isLocal?: boolean;
}

interface Waypoint {
  id: string;
  input: string;
  location: LocationSuggestion | null;
  suggestions: LocationSuggestion[];
  showSuggestions: boolean;
}

interface RouteOptions {
  avoidFloods: boolean;
  highGround: boolean;
  fastest: boolean;
  safest: boolean;
}

interface RouteModalProps {
  onClose: () => void;
  startLocationInput: string;
  endLocationInput: string;
  setStartLocationInput: (value: string) => void;
  setEndLocationInput: (value: string) => void;
  startSuggestions: LocationSuggestion[];
  endSuggestions: LocationSuggestion[];
  showStartSuggestions: boolean;
  showEndSuggestions: boolean;
  setShowStartSuggestions: (value: boolean) => void;
  setShowEndSuggestions: (value: boolean) => void;
  handleSelectStartLocation: (location: LocationSuggestion) => void;
  handleSelectEndLocation: (location: LocationSuggestion) => void;
  useCurrentLocationAsStart: () => void;
  selectedStartLocation: LocationSuggestion | null;
  selectedEndLocation: LocationSuggestion | null;
  handleFindRoute: () => void;
  routeOptions: RouteOptions;
  setRouteOptions: (
    options: RouteOptions | ((prev: RouteOptions) => RouteOptions)
  ) => void;
  clearDestinations?: () => void;
  searchLocations?: (query: string) => Promise<LocationSuggestion[]>;
  waypoints?: Waypoint[];
  setWaypoints?: React.Dispatch<React.SetStateAction<Waypoint[]>>;
  selectedTransportationMode: TransportationMode;
  onTransportationModeChange: (mode: TransportationMode) => void;
}

export const RouteModal = ({
  onClose,
  startLocationInput,
  endLocationInput,
  setStartLocationInput,
  setEndLocationInput,
  startSuggestions,
  endSuggestions,
  showStartSuggestions,
  showEndSuggestions,
  setShowStartSuggestions,
  setShowEndSuggestions,
  handleSelectStartLocation,
  handleSelectEndLocation,
  useCurrentLocationAsStart,
  selectedStartLocation,
  selectedEndLocation,
  handleFindRoute,
  routeOptions,
  setRouteOptions,
  clearDestinations,
  searchLocations,
  waypoints: propsWaypoints,
  setWaypoints: propsSetWaypoints,
  selectedTransportationMode,
  onTransportationModeChange,
}: RouteModalProps) => {
  // Use waypoints from props if available, otherwise fallback to local state
  const [localWaypoints, setLocalWaypoints] = useState<Waypoint[]>([]);
  const waypoints =
    propsWaypoints !== undefined ? propsWaypoints : localWaypoints;
  const setWaypoints =
    propsSetWaypoints !== undefined ? propsSetWaypoints : setLocalWaypoints;

  // Add a new waypoint
  const addWaypoint = () => {
    const newWaypoint: Waypoint = {
      id: `waypoint-${Date.now()}`,
      input: "",
      location: null,
      suggestions: [],
      showSuggestions: false,
    };
    setWaypoints([...waypoints, newWaypoint]);
    console.log("➕ Added new waypoint:", newWaypoint);
  };

  // Remove a waypoint
  const removeWaypoint = (id: string) => {
    setWaypoints(waypoints.filter((wp) => wp.id !== id));
    console.log("🗑️ Removed waypoint:", id);
  };

  // Update waypoint input and search for suggestions
  const updateWaypointInput = async (id: string, value: string) => {
    setWaypoints(
      waypoints.map((wp) => (wp.id === id ? { ...wp, input: value } : wp))
    );

    // Search for location suggestions if searchLocations function is provided
    if (searchLocations && value.length >= 2) {
      try {
        const suggestions = await searchLocations(value);
        setWaypoints((prev) =>
          prev.map((wp) =>
            wp.id === id
              ? { ...wp, suggestions, showSuggestions: suggestions.length > 0 }
              : wp
          )
        );
        console.log(
          `🔍 Found ${suggestions.length} suggestions for waypoint ${id}`
        );
      } catch (error) {
        console.error("Error searching waypoint locations:", error);
      }
    } else {
      // Clear suggestions if query is too short
      setWaypoints((prev) =>
        prev.map((wp) =>
          wp.id === id ? { ...wp, suggestions: [], showSuggestions: false } : wp
        )
      );
    }
  };

  // Update waypoint location
  const selectWaypointLocation = (id: string, location: LocationSuggestion) => {
    setWaypoints(
      waypoints.map((wp) =>
        wp.id === id
          ? {
              ...wp,
              location,
              input: location.display_name,
              showSuggestions: false,
            }
          : wp
      )
    );
    console.log("📍 Selected waypoint location:", id, location);
  };

  // Get letter for waypoint (C, D, E, etc.)
  const getWaypointLetter = (index: number) => {
    return String.fromCharCode(67 + index); // C is 67 in ASCII
  };

  // Check if dark mode is active
  const isDarkMode = document.documentElement.classList.contains('dark');
  const bgColor = isDarkMode ? '#1f2937' : 'white'; // gray-800 or white
  const textColor = isDarkMode ? '#f3f4f6' : '#333'; // gray-100 or dark gray
  const borderColor = isDarkMode ? '#374151' : '#e5e7eb'; // gray-700 or gray-200
  const labelColor = isDarkMode ? '#d1d5db' : '#333'; // gray-300 or dark

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.3)",
        zIndex: 10000,
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "400px",
          background: bgColor,
          boxShadow: "2px 0 20px rgba(0,0,0,0.15)",
          overflow: "hidden",
          animation: "slideInLeft 0.3s ease-out",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            padding: "20px",
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: "24px" }}>🗺️</div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>
            Route Planner
          </h2>
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "15px",
              right: "15px",
              background: "none",
              border: "none",
              color: "white",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0",
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              opacity: 0.8,
              transition: "background 0.2s ease",
            }}
            onMouseOver={(e) =>
              (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
            }
            onMouseOut={(e) => (e.currentTarget.style.background = "none")}
          >
            ×
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
          }}
        >
          {/* From Input */}
          <div style={{ marginBottom: "20px", position: "relative" }}>
              <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
                color: labelColor,
                fontSize: "14px",
              }}
            >
              From
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "12px",
                  height: "12px",
                  background: "#22c55e",
                  borderRadius: "50%",
                  zIndex: 1,
                }}
              ></div>
              <input
                type="text"
                value={startLocationInput}
                onChange={(e) => setStartLocationInput(e.target.value)}
                placeholder="Choose starting point"
                data-location-input="start"
                style={{
                  width: "100%",
                  padding: "12px 12px 12px 32px",
                  border: `2px solid ${borderColor}`,
                  borderRadius: "8px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                  background: bgColor,
                  color: textColor,
                }}
                onFocus={() =>
                  setShowStartSuggestions(startSuggestions.length > 0)
                }
              />
              <button
                onClick={useCurrentLocationAsStart}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "#667eea",
                  border: "none",
                  color: "white",
                  padding: "6px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                📍 Current
              </button>
            </div>

            {/* Start Location Suggestions */}
            {showStartSuggestions && startSuggestions.length > 0 && (
              <div
                data-suggestions-dropdown="start"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  maxHeight: "200px",
                  overflowY: "auto",
                  zIndex: 1000,
                }}
              >
                {startSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onClick={(e) => {
                      console.log("🖱️ START dropdown clicked!", suggestion);
                      console.log("📋 Event details:", {
                        type: e.type,
                        target: e.target,
                        currentTarget: e.currentTarget,
                      });
                      e.preventDefault();
                      e.stopPropagation();
                      console.log(
                        "🚀 About to call handleSelectStartLocation..."
                      );
                      handleSelectStartLocation(suggestion);
                      console.log(
                        "✅ handleSelectStartLocation call completed"
                      );
                    }}
                    style={{
                      padding: "12px",
                      borderBottom:
                        index < startSuggestions.length - 1
                          ? "1px solid #f3f4f6"
                          : "none",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "#374151",
                      transition: "background 0.2s ease",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        {suggestion.isLocal && suggestion.type && (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#059669",
                              backgroundColor: "#d1fae5",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginRight: "8px",
                              fontWeight: "600",
                            }}
                          >
                            {suggestion.type}
                          </span>
                        )}
                        📍 {suggestion.display_name}
                      </div>
                      {suggestion.isLocal && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#059669",
                            fontWeight: "600",
                          }}
                        >
                          LOCAL
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* To Input */}
          <div style={{ marginBottom: "24px", position: "relative" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "bold",
                color: "#333",
                fontSize: "14px",
              }}
            >
              To
            </label>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "12px",
                  height: "12px",
                  background: "#ef4444",
                  borderRadius: "50%",
                  zIndex: 1,
                }}
              ></div>
              <input
                type="text"
                value={endLocationInput}
                onChange={(e) => setEndLocationInput(e.target.value)}
                placeholder="Choose destination"
                data-location-input="end"
                style={{
                  width: "100%",
                  padding: "12px 12px 12px 32px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={() => setShowEndSuggestions(endSuggestions.length > 0)}
              />
            </div>

            {/* End Location Suggestions */}
            {showEndSuggestions && endSuggestions.length > 0 && (
              <div
                data-suggestions-dropdown="end"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  maxHeight: "200px",
                  overflowY: "auto",
                  zIndex: 1000,
                }}
              >
                {endSuggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onClick={(e) => {
                      console.log("🖱️ END dropdown clicked!", suggestion);
                      console.log("📋 Event details:", {
                        type: e.type,
                        target: e.target,
                        currentTarget: e.currentTarget,
                      });
                      e.preventDefault();
                      e.stopPropagation();
                      console.log(
                        "🚀 About to call handleSelectEndLocation..."
                      );
                      handleSelectEndLocation(suggestion);
                      console.log("✅ handleSelectEndLocation call completed");
                    }}
                    style={{
                      padding: "12px",
                      borderBottom:
                        index < endSuggestions.length - 1
                          ? "1px solid #f3f4f6"
                          : "none",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "#374151",
                      transition: "background 0.2s ease",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "white")
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        {suggestion.isLocal && suggestion.type && (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#059669",
                              backgroundColor: "#d1fae5",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginRight: "8px",
                              fontWeight: "600",
                            }}
                          >
                            {suggestion.type}
                          </span>
                        )}
                        📍 {suggestion.display_name}
                      </div>
                      {suggestion.isLocal && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#059669",
                            fontWeight: "600",
                          }}
                        >
                          LOCAL
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waypoint Inputs */}
          {waypoints.map((waypoint, index) => (
            <div
              key={waypoint.id}
              style={{ marginBottom: "20px", position: "relative" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "8px",
                }}
              >
                <label
                  style={{
                    flex: 1,
                    fontWeight: "bold",
                    color: "#333",
                    fontSize: "14px",
                  }}
                >
                  Point {getWaypointLetter(index)}
                </label>
                <button
                  onClick={() => removeWaypoint(waypoint.id)}
                  style={{
                    background: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#dc2626";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#ef4444";
                  }}
                >
                  <span>✕</span> Remove
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "12px",
                    height: "12px",
                    background: "#f59e0b",
                    borderRadius: "50%",
                    zIndex: 1,
                  }}
                ></div>
                <input
                  type="text"
                  value={waypoint.input}
                  onChange={(e) =>
                    updateWaypointInput(waypoint.id, e.target.value)
                  }
                  placeholder={`Enter waypoint ${getWaypointLetter(index)}`}
                  style={{
                    width: "100%",
                    padding: "12px 12px 12px 32px",
                    border: "2px solid #e5e7eb",
                    borderRadius: "8px",
                    fontSize: "14px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={() => {
                    if (waypoint.suggestions.length > 0) {
                      setWaypoints((prev) =>
                        prev.map((wp) =>
                          wp.id === waypoint.id
                            ? { ...wp, showSuggestions: true }
                            : wp
                        )
                      );
                    }
                  }}
                />
              </div>

              {/* Waypoint Suggestions Dropdown */}
              {waypoint.showSuggestions && waypoint.suggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    maxHeight: "200px",
                    overflowY: "auto",
                    zIndex: 1000,
                    marginTop: "4px",
                  }}
                >
                  {waypoint.suggestions.map((suggestion, suggestionIndex) => (
                    <div
                      key={suggestionIndex}
                      onClick={(e) => {
                        console.log(
                          "🖱️ Waypoint dropdown clicked!",
                          suggestion
                        );
                        e.preventDefault();
                        e.stopPropagation();
                        selectWaypointLocation(waypoint.id, suggestion);
                      }}
                      style={{
                        padding: "12px",
                        borderBottom:
                          suggestionIndex < waypoint.suggestions.length - 1
                            ? "1px solid #f3f4f6"
                            : "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "#374151",
                        transition: "background 0.2s ease",
                      }}
                      onMouseOver={(e) =>
                        (e.currentTarget.style.background = "#f9fafb")
                      }
                      onMouseOut={(e) =>
                        (e.currentTarget.style.background = "white")
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div>
                          {suggestion.isLocal && suggestion.type && (
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#059669",
                                backgroundColor: "#d1fae5",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                marginRight: "8px",
                                fontWeight: "600",
                              }}
                            >
                              {suggestion.type}
                            </span>
                          )}
                          📍 {suggestion.display_name}
                        </div>
                        {suggestion.isLocal && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#059669",
                              fontWeight: "600",
                            }}
                          >
                            LOCAL
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Transportation Mode Selector */}
          <div style={{ marginBottom: "16px" }}>
            <TransportationSelector
              selectedMode={selectedTransportationMode}
              onModeChange={onTransportationModeChange}
              className="w-full"
            />
          </div>

          {/* Find Route Button */}
          <button
            onClick={handleFindRoute}
            disabled={!selectedStartLocation || !selectedEndLocation}
            style={{
              width: "100%",
              padding: "12px",
              background:
                !selectedStartLocation || !selectedEndLocation
                  ? "#d1d5db"
                  : "#667eea",
              color: "white",
              border: "none",
              borderRadius: "8px",
              fontSize: "16px",
              fontWeight: "bold",
              cursor:
                !selectedStartLocation || !selectedEndLocation
                  ? "not-allowed"
                  : "pointer",
              marginBottom: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "background 0.2s ease",
            }}
          >
            <span>⚡</span> Find Route
          </button>

          {/* Clear Destinations Button */}
          {clearDestinations &&
            (selectedStartLocation || selectedEndLocation) && (
              <button
                onClick={() => {
                  clearDestinations();
                  console.log("🧹 Destinations cleared by user");
                }}
                style={{
                  width: "100%",
                  padding: "8px",
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "14px",
                  fontWeight: "500",
                  cursor: "pointer",
                  marginBottom: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "background 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#ef4444";
                }}
              >
                <span>🗑️</span> Clear Destinations
              </button>
            )}

          {/* Add Destination Button */}
          <div>
            <button
              onClick={addWaypoint}
              style={{
                width: "100%",
                padding: "12px",
                background: "#10b981",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "background 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#059669";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#10b981";
              }}
            >
              <span style={{ fontSize: "16px" }}>➕</span> Add Destination
            </button>
            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "8px",
                textAlign: "center",
              }}
            >
              Add waypoints for multi-stop routes (Point C, D, E...)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
