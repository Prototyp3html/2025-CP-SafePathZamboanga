import { useState } from "react";
import { notification } from "@/utils/notifications";

interface WhatIfSimulationProps {
  onClose: () => void;
  onRunSimulation: (scenario: SimulationScenario) => void;
}

export interface SimulationScenario {
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
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  description?: string;
}

export const WhatIfSimulation = ({
  onClose,
  onRunSimulation,
}: WhatIfSimulationProps) => {
  const [scenario, setScenario] = useState<SimulationScenario>({
    weatherCondition: "clear",
    customRainfall: 0,
    floodZones: [],
    incidents: [],
    timeOfDay: "morning",
    description: "",
  });

  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isAddingFloodZone, setIsAddingFloodZone] = useState(false);
  const [isAddingIncident, setIsAddingIncident] = useState(false);

  const weatherPresets = [
    {
      id: "clear",
      label: "Clear Weather",
      rainfall: 0,
      icon: "sun",
      color: "blue",
    },
    {
      id: "light_rain",
      label: "Light Rain",
      rainfall: 2.5,
      icon: "cloud-rain",
      color: "cyan",
    },
    {
      id: "moderate_rain",
      label: "Moderate Rain",
      rainfall: 10,
      icon: "cloud-showers-heavy",
      color: "yellow",
    },
    {
      id: "heavy_rain",
      label: "Heavy Rain",
      rainfall: 25,
      icon: "cloud-showers-heavy",
      color: "orange",
    },
    {
      id: "extreme_rain",
      label: "Extreme Rain",
      rainfall: 50,
      icon: "cloud-bolt",
      color: "red",
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
          radius: 500,
          severity: "moderate",
        },
      ],
    });

    notification.success("Flood zone added to simulation");
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
          type: "damage",
          severity: "moderate",
        },
      ],
    });

    notification.success("Incident added to simulation");
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

  const handleRunSimulation = () => {
    if (
      scenario.floodZones.length === 0 &&
      scenario.incidents.length === 0 &&
      scenario.customRainfall === 0
    ) {
      notification.warning("Please add at least one condition to simulate");
      return;
    }

    notification.info("Running What-If simulation...");
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
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center">
                <i className="fas fa-flask mr-3"></i>
                What-If Simulation
              </h2>
              <p className="text-purple-100 text-sm mt-1">
                Test different scenarios and analyze route impacts
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Weather Conditions */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-5 border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <i className="fas fa-cloud-sun-rain text-blue-600 mr-2"></i>
              Weather Conditions
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {weatherPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleWeatherChange(preset.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    scenario.weatherCondition === preset.id
                      ? `border-${preset.color}-500 bg-${preset.color}-50 shadow-lg scale-105`
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <i
                    className={`fas fa-${preset.icon} text-2xl text-${preset.color}-500 mb-2`}
                  ></i>
                  <p className="text-xs font-semibold text-gray-800">
                    {preset.label}
                  </p>
                  <p className="text-xs text-gray-500">
                    {preset.rainfall}mm/hr
                  </p>
                </button>
              ))}
            </div>

            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Rainfall (mm/hr)
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
              <div className="flex justify-between text-sm text-gray-600 mt-2">
                <span>0mm</span>
                <span className="font-bold text-blue-600">
                  {scenario.customRainfall?.toFixed(1)}mm/hr
                </span>
                <span>100mm</span>
              </div>
            </div>
          </div>

          {/* Flood Zones */}
          <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-5 border border-orange-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <i className="fas fa-water text-orange-600 mr-2"></i>
                Simulated Flood Zones ({scenario.floodZones.length})
              </h3>
              <button
                onClick={() => setIsAddingFloodZone(!isAddingFloodZone)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isAddingFloodZone
                    ? "bg-gray-600 text-white"
                    : "bg-orange-600 text-white hover:bg-orange-700"
                }`}
              >
                <i
                  className={`fas fa-${
                    isAddingFloodZone ? "times" : "plus"
                  } mr-2`}
                ></i>
                {isAddingFloodZone ? "Cancel" : "Add Zone"}
              </button>
            </div>

            {isAddingFloodZone && (
              <div className="bg-orange-100 border border-orange-300 rounded-lg p-4 mb-4">
                <p className="text-sm text-orange-800 mb-3">
                  <i className="fas fa-info-circle mr-2"></i>
                  Click on the map to place a flood zone, then configure its
                  properties below
                </p>
                {selectedLocation && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Radius (meters)
                      </label>
                      <input
                        type="number"
                        defaultValue={500}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Severity
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <option value="low">Low</option>
                        <option value="moderate">Moderate</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddFloodZone}
                      className="w-full bg-orange-600 text-white py-2 rounded-lg hover:bg-orange-700"
                    >
                      Confirm Flood Zone
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {scenario.floodZones.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No flood zones added yet
                </p>
              ) : (
                scenario.floodZones.map((zone, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-3 flex items-center justify-between border border-orange-200"
                  >
                    <div className="flex items-center space-x-3">
                      <i className="fas fa-map-marker-alt text-orange-600"></i>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Zone {index + 1}: {zone.lat.toFixed(4)},{" "}
                          {zone.lng.toFixed(4)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Radius: {zone.radius}m | Severity: {zone.severity}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveFloodZone(index)}
                      className="text-red-600 hover:bg-red-50 p-2 rounded-lg"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Incidents */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg p-5 border border-yellow-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <i className="fas fa-triangle-exclamation text-yellow-600 mr-2"></i>
                Simulated Incidents ({scenario.incidents.length})
              </h3>
              <button
                onClick={() => setIsAddingIncident(!isAddingIncident)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isAddingIncident
                    ? "bg-gray-600 text-white"
                    : "bg-yellow-600 text-white hover:bg-yellow-700"
                }`}
              >
                <i
                  className={`fas fa-${
                    isAddingIncident ? "times" : "plus"
                  } mr-2`}
                ></i>
                {isAddingIncident ? "Cancel" : "Add Incident"}
              </button>
            </div>

            {isAddingIncident && (
              <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-4">
                <p className="text-sm text-yellow-800 mb-3">
                  <i className="fas fa-info-circle mr-2"></i>
                  Click on the map to place an incident, then configure its
                  properties below
                </p>
                {selectedLocation && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Type
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <option value="damage">Road Damage</option>
                        <option value="roadblock">Road Blockage</option>
                        <option value="flood">Flooding</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Severity
                      </label>
                      <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <option value="low">Low</option>
                        <option value="moderate">Moderate</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddIncident}
                      className="w-full bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700"
                    >
                      Confirm Incident
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {scenario.incidents.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No incidents added yet
                </p>
              ) : (
                scenario.incidents.map((incident, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-3 flex items-center justify-between border border-yellow-200"
                  >
                    <div className="flex items-center space-x-3">
                      <i
                        className={`fas fa-${
                          incident.type === "damage"
                            ? "road-spikes"
                            : incident.type === "roadblock"
                            ? "road-barrier"
                            : "water"
                        } text-yellow-600`}
                      ></i>
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">
                          {incident.type} - {incident.severity} severity
                        </p>
                        <p className="text-xs text-gray-600">
                          Location: {incident.lat.toFixed(4)},{" "}
                          {incident.lng.toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveIncident(index)}
                      className="text-red-600 hover:bg-red-50 p-2 rounded-lg"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Impact Summary */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-5 border border-purple-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <i className="fas fa-chart-line text-purple-600 mr-2"></i>
              Estimated Impact
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 text-center border border-purple-200">
                <p className="text-sm text-gray-600 mb-2">Rainfall Impact</p>
                <p className="text-3xl font-bold text-blue-600">
                  {scenario.customRainfall
                    ? `${(scenario.customRainfall * 0.05).toFixed(1)}x`
                    : "1.0x"}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 text-center border border-purple-200">
                <p className="text-sm text-gray-600 mb-2">Flood Zone Impact</p>
                <p className="text-3xl font-bold text-orange-600">
                  {scenario.floodZones.length > 0
                    ? `${scenario.floodZones.length * 15}%`
                    : "0%"}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 text-center border border-purple-200">
                <p className="text-sm text-gray-600 mb-2">Traffic Impact</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {scenario.incidents.length > 0
                    ? `${scenario.incidents.length * 40}%`
                    : "0%"}
                </p>
              </div>
            </div>

            <div className="mt-4 bg-white rounded-lg p-4 border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
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
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${
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
                  ? "Low impact - Routes minimally affected"
                  : impactScore < 60
                  ? "Moderate impact - Some routes may be affected"
                  : "High impact - Significant route disruption expected"}
              </p>
            </div>
          </div>

          {/* Scenario Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scenario Description (Optional)
            </label>
            <textarea
              value={scenario.description}
              onChange={(e) =>
                setScenario({ ...scenario, description: e.target.value })
              }
              placeholder="Describe this simulation scenario..."
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            ></textarea>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            <i className="fas fa-lightbulb text-yellow-500 mr-2"></i>
            Configure conditions above and click simulate to see route impacts
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleRunSimulation}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 font-medium shadow-lg"
            >
              <i className="fas fa-play mr-2"></i>
              Run Simulation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
