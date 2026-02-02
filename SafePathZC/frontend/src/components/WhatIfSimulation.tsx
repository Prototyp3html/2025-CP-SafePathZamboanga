import { useState, useEffect } from "react";
import { notification } from "@/utils/notifications";
import { searchZamboCityLocations } from "@/utils/zamboCityLocations";

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id?: string;
  type?: string;
  isLocal?: boolean;
}

// Add animation styles
const slideInLeftAnimation = `
  @keyframes slideInLeft {
    from {
      transform: translateX(-100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  .animate-slide-in-left {
    animation: slideInLeft 0.3s ease-out;
  }
`;

interface WhatIfSimulationProps {
  onClose: () => void;
  onRunSimulation: (scenario: SimulationScenario) => void;
  isSimulating?: boolean;
  startLocation?: { lat: number; lng: number; address: string } | null;
  endLocation?: { lat: number; lng: number; address: string } | null;
}

export interface SimulationScenario {
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  weatherCondition:
    | "clear"
    | "light_rain"
    | "moderate_rain"
    | "heavy_rain"
    | "extreme_rain";
  customRainfall?: number; // mm/hr
  floodZones: Array<{
    lat: number;
    lng: number;
    radius: number; // meters
    severity: "low" | "moderate" | "high";
  }>;
  incidents: Array<{
    lat: number;
    lng: number;
    type: "damage" | "roadblock" | "flood";
    severity: "low" | "moderate" | "high";
  }>;
  description?: string;
}

export const WhatIfSimulation = ({
  onClose,
  onRunSimulation,
  isSimulating = false,
  startLocation,
  endLocation,
}: WhatIfSimulationProps) => {
  const [scenario, setScenario] = useState<SimulationScenario>({
    start_lat: startLocation?.lat || 0,
    start_lng: startLocation?.lng || 0,
    end_lat: endLocation?.lat || 0,
    end_lng: endLocation?.lng || 0,
    weatherCondition: "clear",
    customRainfall: 0,
    floodZones: [],
    incidents: [],
    description: "",
  });

  // Location selection states
  const [startLocationInput, setStartLocationInput] = useState<string>(
    startLocation?.address || ""
  );
  const [endLocationInput, setEndLocationInput] = useState<string>(
    endLocation?.address || ""
  );
  const [selectedStartLocation, setSelectedStartLocation] =
    useState<LocationSuggestion | null>(
      startLocation
        ? {
            display_name: startLocation.address,
            lat: startLocation.lat.toString(),
            lon: startLocation.lng.toString(),
          }
        : null
    );
  const [selectedEndLocation, setSelectedEndLocation] =
    useState<LocationSuggestion | null>(
      endLocation
        ? {
            display_name: endLocation.address,
            lat: endLocation.lat.toString(),
            lon: endLocation.lng.toString(),
          }
        : null
    );
  const [startSuggestions, setStartSuggestions] = useState<LocationSuggestion[]>(
    []
  );
  const [endSuggestions, setEndSuggestions] = useState<LocationSuggestion[]>([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isAddingFloodZone, setIsAddingFloodZone] = useState(false);
  const [isAddingIncident, setIsAddingIncident] = useState(false);
  const [floodZoneRadius, setFloodZoneRadius] = useState(500);
  const [floodZoneSeverity, setFloodZoneSeverity] = useState("moderate");
  const [incidentType, setIncidentType] = useState("damage");
  const [incidentSeverity, setIncidentSeverity] = useState("moderate");

  // Search locations function
  const searchLocations = async (
    query: string
  ): Promise<LocationSuggestion[]> => {
    if (query.length < 2) return [];
    try {
      const results = await searchZamboCityLocations(query, 8);
      return results.map((location: any, index: number) => ({
        display_name: location.displayName,
        lat: location.lat.toString(),
        lon: location.lng.toString(),
        place_id: `zambo_${location.name
          .toLowerCase()
          .replace(/\s+/g, "_")}_${index}`,
        type: location.type,
        isLocal: true,
      }));
    } catch (error) {
      console.error("Error searching locations:", error);
      return [];
    }
  };

  // Handle start location input change
  const handleStartLocationInputChange = async (value: string) => {
    setStartLocationInput(value);
    if (selectedStartLocation && value !== selectedStartLocation.display_name) {
      setSelectedStartLocation(null);
    }

    if (value.length >= 3) {
      const suggestions = await searchLocations(value);
      setStartSuggestions(suggestions);
      setShowStartSuggestions(true);
    } else {
      setStartSuggestions([]);
      setShowStartSuggestions(false);
    }
  };

  // Handle end location input change
  const handleEndLocationInputChange = async (value: string) => {
    setEndLocationInput(value);
    if (selectedEndLocation && value !== selectedEndLocation.display_name) {
      setSelectedEndLocation(null);
    }

    if (value.length >= 3) {
      const suggestions = await searchLocations(value);
      setEndSuggestions(suggestions);
      setShowEndSuggestions(true);
    } else {
      setEndSuggestions([]);
      setShowEndSuggestions(false);
    }
  };

  // Handle selecting start location
  const handleSelectStartLocation = (location: LocationSuggestion) => {
    setSelectedStartLocation(location);
    setStartLocationInput(location.display_name);
    setStartSuggestions([]);
    setShowStartSuggestions(false);
    setScenario((prev) => ({
      ...prev,
      start_lat: parseFloat(location.lat),
      start_lng: parseFloat(location.lon),
    }));
    notification.success(
      `Start location set to ${location.display_name.split(",")[0]}`
    );
  };

  // Handle selecting end location
  const handleSelectEndLocation = (location: LocationSuggestion) => {
    setSelectedEndLocation(location);
    setEndLocationInput(location.display_name);
    setEndSuggestions([]);
    setShowEndSuggestions(false);
    setScenario((prev) => ({
      ...prev,
      end_lat: parseFloat(location.lat),
      end_lng: parseFloat(location.lon),
    }));
    notification.success(
      `End location set to ${location.display_name.split(",")[0]}`
    );
  };

  // Listen for map clicks when Simulation panel is open to pick a location for zones/incidents
  useEffect(() => {
    const handleMapClickEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{ lat: number; lng: number }>;
      const { lat, lng } = customEvent.detail || {};
      if (typeof lat !== "number" || typeof lng !== "number") return;

      setSelectedLocation({ lat, lng });
      notification.info(
        `Location selected at ${lat.toFixed(5)}, ${lng.toFixed(
          5
        )}. Configure below.`
      );
    };

    window.addEventListener("simulation-map-click", handleMapClickEvent);
    return () =>
      window.removeEventListener("simulation-map-click", handleMapClickEvent);
  }, []);

  // Preview: notify MapView about current zones/incidents to draw overlays
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("simulation-scenario-changed", {
        detail: {
          floodZones: scenario.floodZones,
          incidents: scenario.incidents,
        },
      })
    );
  }, [scenario.floodZones, scenario.incidents]);

  // Clear overlays when panel closes/unmounts
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("simulation-scenario-clear"));
    };
  }, []);

  useEffect(() => {
    // Update scenario when start/end locations change from props
    if (startLocation && endLocation) {
      setScenario((prev) => ({
        ...prev,
        start_lat: startLocation.lat,
        start_lng: startLocation.lng,
        end_lat: endLocation.lat,
        end_lng: endLocation.lng,
      }));
    }
  }, [startLocation, endLocation]);

  const weatherPresets = [
    {
      id: "clear",
      label: "Clear",
      rainfall: 0,
      icon: "sun",
    },
    {
      id: "light_rain",
      label: "Light",
      rainfall: 2.5,
      icon: "cloud-rain",
    },
    {
      id: "moderate_rain",
      label: "Moderate",
      rainfall: 10,
      icon: "cloud-showers-heavy",
    },
    {
      id: "heavy_rain",
      label: "Heavy",
      rainfall: 25,
      icon: "cloud-showers-heavy",
    },
    {
      id: "extreme_rain",
      label: "Extreme",
      rainfall: 50,
      icon: "cloud-bolt",
    },
  ];

  const handleWeatherChange = (weatherId: string) => {
    const preset = weatherPresets.find((p) => p.id === weatherId);
    setScenario({
      ...scenario,
      weatherCondition: weatherId as any,
      customRainfall: preset?.rainfall || 0,
    });
  };

  const handleAddFloodZone = () => {
    if (!selectedLocation) {
      notification.error("Please select a location on the map first");
      return;
    }

    setScenario({
      ...scenario,
      floodZones: [
        ...scenario.floodZones,
        {
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          radius: floodZoneRadius,
          severity: floodZoneSeverity as any,
        },
      ],
    });

    notification.success("Flood zone added!");
    setSelectedLocation(null);
    setIsAddingFloodZone(false);
  };

  const handleAddIncident = () => {
    if (!selectedLocation) {
      notification.error("Please select a location on the map first");
      return;
    }

    setScenario({
      ...scenario,
      incidents: [
        ...scenario.incidents,
        {
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          type: incidentType as any,
          severity: incidentSeverity as any,
        },
      ],
    });

    notification.success("Incident added!");
    setSelectedLocation(null);
    setIsAddingIncident(false);
  };

  const handleRemoveFloodZone = (index: number) => {
    setScenario({
      ...scenario,
      floodZones: scenario.floodZones.filter((_, i) => i !== index),
    });
  };

  const handleRemoveIncident = (index: number) => {
    setScenario({
      ...scenario,
      incidents: scenario.incidents.filter((_, i) => i !== index),
    });
  };

  const hasValidRoute =
    scenario.start_lat &&
    scenario.start_lng &&
    scenario.end_lat &&
    scenario.end_lng;

  const handleRunSimulation = () => {
    if (!hasValidRoute) {
      notification.error(
        "❌ Please set both start and end locations on the map first"
      );
      return;
    }

    if (
      scenario.floodZones.length === 0 &&
      scenario.incidents.length === 0 &&
      scenario.customRainfall === 0
    ) {
      notification.warning(
        "⚠️ Please add at least one weather/condition to simulate"
      );
      return;
    }

    notification.info("🔬 Running What-If simulation...");
    onRunSimulation(scenario);
  };

  const calculateImpact = () => {
    let impactScore = 0;

    // Weather impact
    impactScore += (scenario.customRainfall || 0) * 2;

    // Flood zones impact
    scenario.floodZones.forEach((zone) => {
      if (zone.severity === "high") impactScore += 30;
      else if (zone.severity === "moderate") impactScore += 20;
      else impactScore += 10;
    });

    // Incidents impact
    scenario.incidents.forEach((incident) => {
      if (incident.severity === "high") impactScore += 25;
      else if (incident.severity === "moderate") impactScore += 15;
      else impactScore += 8;
    });

    return Math.min(100, impactScore);
  };

  const impactScore = calculateImpact();

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-30 pointer-events-none"></div>

      {/* Side Panel */}
      <div className="absolute left-0 top-0 bottom-0 w-full sm:w-[90%] md:w-[500px] lg:max-w-md bg-white shadow-2xl overflow-hidden flex flex-col pointer-events-auto animate-slide-in-left">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-3 sm:p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center">
                <i className="fas fa-flask mr-2 text-sm sm:text-base"></i>
                Route Simulation
              </h2>
              <p className="text-blue-100 text-xs mt-1">
                🧪 Test your route with different weather & conditions
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-1.5 sm:p-2 rounded-lg transition-colors"
            >
              <i className="fas fa-times text-lg sm:text-xl"></i>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4"
          style={{ maxHeight: "calc(100vh - 180px)" }}
        >
          {/* Route Destination Selection */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <i className="fas fa-map-marker-alt text-indigo-600 mr-2 text-sm"></i>
              Select Route
            </h3>

            {/* Start Location Input */}
            <div className="mb-3" data-location-input>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                📍 Start Location
              </label>
              <input
                type="text"
                value={startLocationInput}
                onChange={(e) => handleStartLocationInputChange(e.target.value)}
                placeholder="Search start location..."
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                autoComplete="off"
              />
              {showStartSuggestions && startSuggestions.length > 0 && (
                <div
                  className="absolute bg-white border border-gray-300 rounded-lg mt-1 w-80 shadow-lg z-50 max-h-48 overflow-y-auto"
                  data-suggestions-dropdown
                >
                  {startSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.place_id}
                      onClick={() => handleSelectStartLocation(suggestion)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-100 border-b border-gray-200 last:border-b-0 transition-colors"
                    >
                      <p className="font-medium text-gray-900">
                        {suggestion.display_name.split(",")[0]}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {suggestion.display_name.split(",").slice(1).join(",")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {selectedStartLocation && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ {selectedStartLocation.display_name.split(",")[0]}
                </p>
              )}
            </div>

            {/* End Location Input */}
            <div className="mb-3" data-location-input>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                🎯 End Location
              </label>
              <input
                type="text"
                value={endLocationInput}
                onChange={(e) => handleEndLocationInputChange(e.target.value)}
                placeholder="Search end location..."
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                autoComplete="off"
              />
              {showEndSuggestions && endSuggestions.length > 0 && (
                <div
                  className="absolute bg-white border border-gray-300 rounded-lg mt-1 w-80 shadow-lg z-50 max-h-48 overflow-y-auto"
                  data-suggestions-dropdown
                >
                  {endSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.place_id}
                      onClick={() => handleSelectEndLocation(suggestion)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-100 border-b border-gray-200 last:border-b-0 transition-colors"
                    >
                      <p className="font-medium text-gray-900">
                        {suggestion.display_name.split(",")[0]}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {suggestion.display_name.split(",").slice(1).join(",")}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {selectedEndLocation && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ {selectedEndLocation.display_name.split(",")[0]}
                </p>
              )}
            </div>

            {selectedStartLocation && selectedEndLocation && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-green-800 text-xs">
                <i className="fas fa-check-circle mr-1"></i>
                Both locations selected
              </div>
            )}
          </div>

          {/* Route Information */}
          <div
            className={`rounded-lg p-3 border ${
              hasValidRoute
                ? "bg-green-50 border-green-200"
                : "bg-yellow-50 border-yellow-200"
            }`}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <i
                className={`fas fa-route mr-2 text-sm ${
                  hasValidRoute ? "text-green-600" : "text-yellow-600"
                }`}
              ></i>
              Route Summary
            </h3>
            <div className="space-y-2 text-xs">
              <div>
                <p className="text-gray-600 font-medium">📍 Start:</p>
                <p className="text-gray-900 font-semibold">
                  {selectedStartLocation?.display_name.split(",")[0] ||
                    "Not selected"}
                </p>
              </div>
              <div>
                <p className="text-gray-600 font-medium">🎯 End:</p>
                <p className="text-gray-900 font-semibold">
                  {selectedEndLocation?.display_name.split(",")[0] ||
                    "Not selected"}
                </p>
              </div>
              {!hasValidRoute && (
                <div className="bg-yellow-100 border border-yellow-300 rounded p-2 text-yellow-800 text-xs font-medium">
                  <i className="fas fa-exclamation-circle mr-1"></i>
                  Select both start & end locations
                </div>
              )}
            </div>
          </div>

          {/* Weather Conditions */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-3 border border-blue-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <i className="fas fa-cloud-sun-rain text-blue-600 mr-2 text-sm"></i>
              Weather Forecast
            </h3>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {weatherPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleWeatherChange(preset.id)}
                  className={`p-2 rounded-lg border-2 transition-all text-center text-xs ${
                    scenario.weatherCondition === preset.id
                      ? `border-blue-500 bg-blue-50 shadow-lg`
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <i
                    className={`fas fa-${preset.icon} text-base text-blue-500 mb-1`}
                  ></i>
                  <p className="font-semibold text-gray-800 text-xs">
                    {preset.label}
                  </p>
                  <p className="text-gray-500">{preset.rainfall}mm</p>
                </button>
              ))}
            </div>

            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Custom Rainfall:{" "}
                <span className="text-blue-600 font-bold">
                  {scenario.customRainfall?.toFixed(1)}mm/hr
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={scenario.customRainfall || 0}
                onChange={(e) =>
                  setScenario({
                    ...scenario,
                    customRainfall: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>

          {/* Flood Zones */}
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-3 border border-orange-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                <i className="fas fa-water text-orange-600 mr-2 text-sm"></i>
                Flood Risk Zones ({scenario.floodZones.length})
              </h3>
              <button
                onClick={() => setIsAddingFloodZone(!isAddingFloodZone)}
                className={`px-2 py-1 text-xs rounded-lg font-medium transition-all ${
                  isAddingFloodZone
                    ? "bg-gray-600 text-white"
                    : "bg-orange-600 text-white hover:bg-orange-700"
                }`}
              >
                <i
                  className={`fas fa-${
                    isAddingFloodZone ? "times" : "plus"
                  } mr-1`}
                ></i>
                {isAddingFloodZone ? "Cancel" : "Add"}
              </button>
            </div>

            {isAddingFloodZone && (
              <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 mb-3">
                <p className="text-xs text-orange-800 mb-2 font-medium lg:hidden">
                  <i className="fas fa-map-marked-alt mr-1"></i>
                  Click on the mini-map below to select location
                </p>
                <p className="text-xs text-blue-800 mb-2 font-medium hidden lg:block">
                  <i className="fas fa-map-marked-alt mr-1"></i>
                  Click on the main map to select location
                </p>
                
                {/* Mini Map Preview - Mobile/Tablet Only */}
                <div 
                  className="w-full h-48 lg:h-24 bg-gray-200 rounded-lg mb-3 border-2 border-orange-400 overflow-hidden relative cursor-crosshair lg:cursor-default"
                  onClick={(e) => {
                    // Only allow clicking on mobile/tablet
                    if (window.innerWidth >= 1024) return;
                    
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    // Zamboanga bounds: lat 6.8-7.2, lng 122.0-122.3
                    const lat = 7.2 - (y / rect.height) * 0.4;
                    const lng = 122.0 + (x / rect.width) * 0.3;
                    
                    setSelectedLocation({ lat, lng });
                    notification.info(`Location selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                  }}
                >
                  {/* Iframe showing the actual map */}
                  <iframe
                    src={
                      selectedLocation
                        ? `https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocation.lng - 0.01},${selectedLocation.lat - 0.008},${selectedLocation.lng + 0.01},${selectedLocation.lat + 0.008}&layer=mapnik&marker=${selectedLocation.lat},${selectedLocation.lng}`
                        : `https://www.openstreetmap.org/export/embed.html?bbox=122.0,6.8,122.3,7.2&layer=mapnik&marker=6.9,122.07`
                    }
                    style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                    title="Mini Map"
                  />
                  {/* Mobile/Tablet Instructions */}
                  <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded shadow text-xs font-medium lg:hidden">
                    📍 Tap to select
                  </div>
                  {/* Desktop Instructions */}
                  <div className="hidden lg:flex absolute inset-0 bg-blue-900 bg-opacity-60 items-center justify-center">
                    <div className="bg-white px-4 py-2 rounded-lg shadow-lg text-center">
                      <p className="text-sm font-semibold text-gray-900">🖱️ Click on the main map</p>
                      <p className="text-xs text-gray-600 mt-1">to select flood zone location</p>
                    </div>
                  </div>
                  {selectedLocation && (
                    <div className="absolute bottom-2 left-2 bg-green-500 text-white px-2 py-1 rounded shadow text-xs font-medium lg:hidden">
                      ✓ Location selected
                    </div>
                  )}
                </div>

                {selectedLocation && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Radius:{" "}
                        <span className="text-orange-600 font-bold">
                          {floodZoneRadius}m
                        </span>
                      </label>
                      <input
                        type="range"
                        min="100"
                        max="2000"
                        step="50"
                        value={floodZoneRadius}
                        onChange={(e) =>
                          setFloodZoneRadius(parseInt(e.target.value))
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Severity
                      </label>
                      <select
                        value={floodZoneSeverity}
                        onChange={(e) => setFloodZoneSeverity(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg"
                      >
                        <option value="low">Low - Minor flooding</option>
                        <option value="moderate">
                          Moderate - Area flooded
                        </option>
                        <option value="high">High - Route impassable</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddFloodZone}
                      className="w-full bg-orange-600 text-white text-xs py-2 rounded-lg hover:bg-orange-700 font-medium"
                    >
                      ✓ Add Flood Zone
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {scenario.floodZones.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">
                  No flood zones added yet
                </p>
              ) : (
                scenario.floodZones.map((zone, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-2 flex items-center justify-between border border-orange-200 text-xs"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        💧 Zone {index + 1}: {zone.radius}m • {zone.severity}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveFloodZone(index)}
                      className="text-red-600 hover:bg-red-50 p-1 rounded"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incidents */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg p-3 border border-yellow-200">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                <i className="fas fa-triangle-exclamation text-yellow-600 mr-2 text-sm"></i>
                Traffic Incidents ({scenario.incidents.length})
              </h3>
              <button
                onClick={() => setIsAddingIncident(!isAddingIncident)}
                className={`px-2 py-1 text-xs rounded-lg font-medium transition-all ${
                  isAddingIncident
                    ? "bg-gray-600 text-white"
                    : "bg-yellow-600 text-white hover:bg-yellow-700"
                }`}
              >
                <i
                  className={`fas fa-${
                    isAddingIncident ? "times" : "plus"
                  } mr-1`}
                ></i>
                {isAddingIncident ? "Cancel" : "Add"}
              </button>
            </div>

            {isAddingIncident && (
              <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 mb-3">
                <p className="text-xs text-yellow-800 mb-2 font-medium lg:hidden">
                  <i className="fas fa-map-marked-alt mr-1"></i>
                  Click on the mini-map below to select location
                </p>
                <p className="text-xs text-blue-800 mb-2 font-medium hidden lg:block">
                  <i className="fas fa-map-marked-alt mr-1"></i>
                  Click on the main map to select location
                </p>
                
                {/* Mini Map Preview - Mobile/Tablet Only */}
                <div 
                  className="w-full h-48 lg:h-24 bg-gray-200 rounded-lg mb-3 border-2 border-yellow-400 overflow-hidden relative cursor-crosshair lg:cursor-default"
                  onClick={(e) => {
                    // Only allow clicking on mobile/tablet
                    if (window.innerWidth >= 1024) return;
                    
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    // Zamboanga bounds: lat 6.8-7.2, lng 122.0-122.3
                    const lat = 7.2 - (y / rect.height) * 0.4;
                    const lng = 122.0 + (x / rect.width) * 0.3;
                    
                    setSelectedLocation({ lat, lng });
                    notification.info(`Location selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                  }}
                >
                  {/* Iframe showing the actual map */}
                  <iframe
                    src={
                      selectedLocation
                        ? `https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocation.lng - 0.01},${selectedLocation.lat - 0.008},${selectedLocation.lng + 0.01},${selectedLocation.lat + 0.008}&layer=mapnik&marker=${selectedLocation.lat},${selectedLocation.lng}`
                        : `https://www.openstreetmap.org/export/embed.html?bbox=122.0,6.8,122.3,7.2&layer=mapnik&marker=6.9,122.07`
                    }
                    style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                    title="Mini Map"
                  />
                  {/* Mobile/Tablet Instructions */}
                  <div className="absolute top-2 left-2 bg-white px-2 py-1 rounded shadow text-xs font-medium lg:hidden">
                    📍 Tap to select
                  </div>
                  {/* Desktop Instructions */}
                  <div className="hidden lg:flex absolute inset-0 bg-blue-900 bg-opacity-60 items-center justify-center">
                    <div className="bg-white px-4 py-2 rounded-lg shadow-lg text-center">
                      <p className="text-sm font-semibold text-gray-900">🖱️ Click on the main map</p>
                      <p className="text-xs text-gray-600 mt-1">to select incident location</p>
                    </div>
                  </div>
                  {selectedLocation && (
                    <div className="absolute bottom-2 left-2 bg-green-500 text-white px-2 py-1 rounded shadow text-xs font-medium lg:hidden">
                      ✓ Location selected
                    </div>
                  )}
                </div>

                {selectedLocation && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Type
                      </label>
                      <select
                        value={incidentType}
                        onChange={(e) => setIncidentType(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg"
                      >
                        <option value="damage">🚗 Road Damage</option>
                        <option value="roadblock">🚧 Road Blockage</option>
                        <option value="flood">💧 Flooding</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Severity
                      </label>
                      <select
                        value={incidentSeverity}
                        onChange={(e) => setIncidentSeverity(e.target.value)}
                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded-lg"
                      >
                        <option value="low">Low - Slight delay</option>
                        <option value="moderate">
                          Moderate - Delays expected
                        </option>
                        <option value="high">High - Major disruption</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddIncident}
                      className="w-full bg-yellow-600 text-white text-xs py-2 rounded-lg hover:bg-yellow-700 font-medium"
                    >
                      ✓ Add Incident
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {scenario.incidents.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">
                  No incidents added yet
                </p>
              ) : (
                scenario.incidents.map((incident, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-2 flex items-center justify-between border border-yellow-200 text-xs"
                  >
                    <div>
                      <p className="font-medium text-gray-900 capitalize">
                        {incident.type === "damage"
                          ? "🚗"
                          : incident.type === "roadblock"
                          ? "🚧"
                          : "💧"}{" "}
                        {incident.type} • {incident.severity}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveIncident(index)}
                      className="text-red-600 hover:bg-red-50 p-1 rounded"
                    >
                      <i className="fas fa-trash-alt text-xs"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Impact Summary */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-3 border border-purple-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <i className="fas fa-chart-line text-purple-600 mr-2 text-sm"></i>
              Predicted Impact
            </h3>

            <div className="bg-white rounded-lg p-3 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700">
                  Overall Impact Score
                </span>
                <span
                  className={`text-lg font-bold ${
                    impactScore < 30
                      ? "text-green-600"
                      : impactScore < 60
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {impactScore}/100
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    impactScore < 30
                      ? "bg-green-500"
                      : impactScore < 60
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${impactScore}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {impactScore < 30
                  ? "✓ Low impact - Routes minimally affected"
                  : impactScore < 60
                  ? "⚠️ Moderate impact - Route changes expected"
                  : "❌ High impact - Significant route disruption expected"}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
            >
              Close
            </button>
            <button
              onClick={handleRunSimulation}
              disabled={!hasValidRoute || isSimulating}
              className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all ${
                hasValidRoute && !isSimulating
                  ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {isSimulating ? (
                <span className="flex items-center justify-center">
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Simulating...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <i className="fas fa-play mr-1 sm:mr-2"></i>
                  Simulate Route
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inject animation styles */}
      <style>{slideInLeftAnimation}</style>
    </div>
  );
};
