import React from "react";
import { Car, Wind, User, Bus, Truck, Navigation } from "lucide-react";

export type TransportationMode =
  | "car"
  | "motorcycle"  // Backend uses this, but UI combines it with bicycle
  | "walking"
  | "public_transport"
  | "truck";

interface TransportationModeConfig {
  id: TransportationMode;
  name: string;
  icon: React.ComponentType<any>;
  description: string;
  // Vehicle characteristics for flood routing
  groundClearance: number; // in centimeters
  maxFloodDepth: number; // in centimeters - max safe flood depth
  canUseFootpaths: boolean;
  canUseMainRoads: boolean;
  canUseHighways: boolean;
  speedFactor: number; // relative speed compared to car
  osrmProfile: "driving" | "foot" | "cycling"; // OSRM routing profile to use
  color: string; // for route display
}

export const TRANSPORTATION_MODES: Record<
  TransportationMode,
  TransportationModeConfig
> = {
  car: {
    id: "car",
    name: "Car",
    icon: Car,
    description: "Private vehicle - avoid deep floods",
    groundClearance: 20,
    maxFloodDepth: 15,
    canUseFootpaths: false,
    canUseMainRoads: true,
    canUseHighways: true,
    speedFactor: 1.0,
    osrmProfile: "driving",
    color: "#3B82F6",
  },
  motorcycle: {
    id: "motorcycle",
    name: "Bicycle/Motorcycle",
    icon: Wind,
    description: "Two-wheeler - lower flood tolerance",
    groundClearance: 15,
    maxFloodDepth: 10,
    canUseFootpaths: false,
    canUseMainRoads: true,
    canUseHighways: true,
    speedFactor: 0.9,
    osrmProfile: "driving",
    color: "#EF4444",
  },
  walking: {
    id: "walking",
    name: "Walking",
    icon: User,
    description: "On foot - use sidewalks and paths",
    groundClearance: 0,
    maxFloodDepth: 30, // Humans can wade through deeper water
    canUseFootpaths: true,
    canUseMainRoads: false,
    canUseHighways: false,
    speedFactor: 0.1,
    osrmProfile: "foot",
    color: "#10B981",
  },
  public_transport: {
    id: "public_transport",
    name: "Public Transport",
    icon: Bus,
    description: "Bus/jeepney routes - higher clearance",
    groundClearance: 35,
    maxFloodDepth: 25,
    canUseFootpaths: false,
    canUseMainRoads: true,
    canUseHighways: true,
    speedFactor: 0.6,
    osrmProfile: "driving",
    color: "#8B5CF6",
  },
  truck: {
    id: "truck",
    name: "Truck",
    icon: Truck,
    description: "Heavy vehicle - highest flood clearance",
    groundClearance: 40,
    maxFloodDepth: 35,
    canUseFootpaths: false,
    canUseMainRoads: true,
    canUseHighways: true,
    speedFactor: 0.7,
    osrmProfile: "driving",
    color: "#6B7280",
  },
};

interface TransportationSelectorProps {
  selectedMode: TransportationMode;
  onModeChange: (mode: TransportationMode) => void;
  className?: string;
}

export const TransportationSelector: React.FC<TransportationSelectorProps> = ({
  selectedMode,
  onModeChange,
  className = "",
}) => {
  return (
    <div
      className={`bg-white rounded-lg shadow-lg border border-gray-200 p-4 ${className}`}
    >
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
        <Car className="w-4 h-4 mr-2" />
        Transportation Mode
      </h3>

      <div className="grid grid-cols-2 gap-2">
        {Object.values(TRANSPORTATION_MODES).map((mode) => {
          const IconComponent = mode.icon;
          const isSelected = selectedMode === mode.id;

          return (
            <button
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              className={`
                flex flex-col items-center p-3 rounded-lg border-2 transition-all duration-200
                hover:shadow-md group relative
                ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }
              `}
              title={mode.description}
            >
              <IconComponent
                className={`w-6 h-6 mb-1 ${
                  isSelected ? "text-blue-600" : "text-gray-600"
                }`}
                style={{ color: isSelected ? mode.color : undefined }}
              />
              <span
                className={`text-xs font-medium ${
                  isSelected ? "text-blue-900" : "text-gray-700"
                }`}
              >
                {mode.name}
              </span>

              {/* Flood tolerance indicator */}
              <div
                className={`text-xs mt-1 px-2 py-0.5 rounded-full ${
                  mode.maxFloodDepth > 20
                    ? "bg-green-100 text-green-700"
                    : mode.maxFloodDepth > 10
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {mode.maxFloodDepth}cm flood
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected mode details */}
      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
        <div className="text-xs text-gray-600">
          <strong>{TRANSPORTATION_MODES[selectedMode].name}:</strong>{" "}
          {TRANSPORTATION_MODES[selectedMode].description}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Max safe flood depth:{" "}
          <strong>{TRANSPORTATION_MODES[selectedMode].maxFloodDepth}cm</strong>
        </div>
      </div>
    </div>
  );
};

// Helper function to get flood safety for a transportation mode
export const getFloodSafety = (
  floodDepth: number,
  mode: TransportationMode
): "safe" | "risky" | "dangerous" => {
  const config = TRANSPORTATION_MODES[mode];

  if (floodDepth <= config.maxFloodDepth * 0.7) {
    return "safe";
  } else if (floodDepth <= config.maxFloodDepth) {
    return "risky";
  } else {
    return "dangerous";
  }
};

// Helper function to filter routes based on transportation mode
export const isRouteAccessibleForMode = (
  roadType: string,
  mode: TransportationMode
): boolean => {
  const config = TRANSPORTATION_MODES[mode];

  switch (roadType.toLowerCase()) {
    case "footpath":
    case "sidewalk":
    case "pedestrian":
      return config.canUseFootpaths;

    case "highway":
    case "expressway":
      return config.canUseHighways;

    case "main_road":
    case "primary":
    case "secondary":
    default:
      return config.canUseMainRoads;
  }
};
