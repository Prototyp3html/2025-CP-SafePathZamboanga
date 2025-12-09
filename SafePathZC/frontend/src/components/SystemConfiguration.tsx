import React, { useState, useEffect } from "react";
import {
  Settings,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Sliders,
  TrendingUp,
  Zap,
  Clock,
  Shield,
} from "lucide-react";
import { notification } from "@/utils/notifications";

interface ConfigurationValues {
  elevation_weight: number;
  rainfall_weight: number;
  proximity_weight: number;
  safe_route_penalty: number;
  manageable_route_penalty: number;
  flood_prone_route_penalty: number;
  api_update_frequency: number; // in minutes
}

interface SystemConfig {
  values: ConfigurationValues;
  last_updated: string;
}

export const SystemConfiguration: React.FC = () => {
  const [config, setConfig] = useState<ConfigurationValues>({
    elevation_weight: 0.35,
    rainfall_weight: 0.35,
    proximity_weight: 0.3,
    safe_route_penalty: 1.0,
    manageable_route_penalty: 1.5,
    flood_prone_route_penalty: 2.5,
    api_update_frequency: 60,
  });

  const [originalConfig, setOriginalConfig] = useState<ConfigurationValues>(
    config
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(config) !== JSON.stringify(originalConfig);
    setHasChanges(changed);
  }, [config, originalConfig]);

  const loadConfiguration = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("admin_token");
      if (!token) {
        notification.error("Admin authentication required");
        return;
      }

      const response = await fetch(
        `${BACKEND_URL}/admin/system-config?t=${Date.now()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log("Config loaded from API:", data.values);
        setConfig(data.values);
        setOriginalConfig(data.values);
        setLastUpdated(data.last_updated);
      } else if (response.status === 404) {
        // Default values if endpoint doesn't exist yet
        console.warn("Config endpoint returned 404, using defaults");
        notification.info("Using default configuration values");
      } else {
        console.error("Failed to load config:", response.status, response.statusText);
        notification.warning("Using default configuration values");
      }
    } catch (error) {
      console.error("Error loading configuration:", error);
      notification.warning("Using default configuration values");
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      setIsSaving(true);
      const token = localStorage.getItem("admin_token");

      if (!token) {
        notification.error("Admin authentication required");
        return;
      }

      // Validate weights sum to 1.0
      const weightSum =
        config.elevation_weight +
        config.rainfall_weight +
        config.proximity_weight;
      if (Math.abs(weightSum - 1.0) > 0.01) {
        notification.error(
          `Risk weights must sum to 1.0 (currently ${weightSum.toFixed(2)})`
        );
        return;
      }

      const response = await fetch(`${BACKEND_URL}/admin/system-config`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        const data = await response.json();
        setOriginalConfig(config);
        setLastUpdated(data.last_updated);
        notification.success("Configuration saved successfully");
        
        // Reload fresh data to confirm save
        setTimeout(() => loadConfiguration(), 500);
      } else {
        const error = await response.json();
        notification.error(error.detail || "Failed to save configuration");
      }
    } catch (error) {
      notification.error("Error saving configuration");
      console.error("Error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const resetConfiguration = () => {
    setConfig(originalConfig);
    notification.info("Changes discarded");
  };

  const handleRiskWeightChange = (
    field: "elevation_weight" | "rainfall_weight" | "proximity_weight",
    value: number
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handlePenaltyChange = (
    field:
      | "safe_route_penalty"
      | "manageable_route_penalty"
      | "flood_prone_route_penalty",
    value: number
  ) => {
    setConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const weightSum =
    config.elevation_weight + config.rainfall_weight + config.proximity_weight;
  const isWeightValid = Math.abs(weightSum - 1.0) < 0.01;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-blue-600" />
            <h2 className="text-3xl font-bold text-gray-900">
              System Configuration
            </h2>
          </div>
          {lastUpdated && (
            <span className="text-sm text-gray-600">
              Last updated:{" "}
              {new Date(lastUpdated).toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-gray-600">
          Adjust system parameters that affect route calculation and flood risk
          assessment
        </p>
      </div>

      {/* Risk Calculation Weights */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Sliders className="w-6 h-6 text-purple-600" />
          <h3 className="text-2xl font-bold text-gray-900">
            Risk Calculation Weights
          </h3>
        </div>
        <p className="text-gray-600 mb-6">
          Adjust the weights for different risk factors. All weights must sum to
          1.0 (100%)
        </p>

        <div className="space-y-6">
          {/* Elevation Weight */}
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">
                  Elevation Factor Weight
                </label>
                <p className="text-sm text-gray-600">
                  How much elevation terrain affects flood risk (lower elevation
                  = higher risk)
                </p>
              </div>
              <span className="text-3xl font-bold text-orange-600">
                {(config.elevation_weight * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={config.elevation_weight}
              onChange={(e) =>
                handleRiskWeightChange(
                  "elevation_weight",
                  parseFloat(e.target.value)
                )
              }
              className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
            />
            <div className="mt-3 flex justify-between text-xs text-gray-600">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Rainfall Weight */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">
                  Rainfall Factor Weight
                </label>
                <p className="text-sm text-gray-600">
                  How much recent rainfall affects flood risk assessment
                </p>
              </div>
              <span className="text-3xl font-bold text-blue-600">
                {(config.rainfall_weight * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={config.rainfall_weight}
              onChange={(e) =>
                handleRiskWeightChange(
                  "rainfall_weight",
                  parseFloat(e.target.value)
                )
              }
              className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="mt-3 flex justify-between text-xs text-gray-600">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Proximity Weight */}
          <div className="bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-1">
                  Proximity to Water Sources Weight
                </label>
                <p className="text-sm text-gray-600">
                  How much proximity to rivers/lakes affects flood risk
                </p>
              </div>
              <span className="text-3xl font-bold text-red-600">
                {(config.proximity_weight * 100).toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={config.proximity_weight}
              onChange={(e) =>
                handleRiskWeightChange(
                  "proximity_weight",
                  parseFloat(e.target.value)
                )
              }
              className="w-full h-2 bg-red-200 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
            <div className="mt-3 flex justify-between text-xs text-gray-600">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Weight Sum Validator */}
          <div
            className={`rounded-xl p-4 flex items-center gap-3 ${
              isWeightValid
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {isWeightValid ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <div>
              <p
                className={`font-semibold ${
                  isWeightValid ? "text-green-900" : "text-red-900"
                }`}
              >
                {isWeightValid ? "Weight sum is valid" : "Weight sum is invalid"}
              </p>
              <p
                className={`text-sm ${
                  isWeightValid ? "text-green-700" : "text-red-700"
                }`}
              >
                Total: {weightSum.toFixed(2)} (must equal 1.0)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Route Penalty Multipliers */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-green-600" />
          <h3 className="text-2xl font-bold text-gray-900">
            Route Penalty Multipliers
          </h3>
        </div>
        <p className="text-gray-600 mb-6">
          Adjust how much risk affects route alternatives. Higher values mean
          heavier penalties for risky routes
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Safe Route */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Safe Route Penalty
            </label>
            <p className="text-xs text-gray-600 mb-4">
              Route through safest areas
            </p>
            <div className="mb-4">
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={config.safe_route_penalty}
                onChange={(e) =>
                  handlePenaltyChange(
                    "safe_route_penalty",
                    parseFloat(e.target.value)
                  )
                }
                className="w-full px-4 py-3 border border-green-300 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-green-600">
                {config.safe_route_penalty.toFixed(2)}x
              </span>
              <p className="text-xs text-gray-600 mt-1">Multiplier</p>
            </div>
          </div>

          {/* Manageable Route */}
          <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Manageable Route Penalty
            </label>
            <p className="text-xs text-gray-600 mb-4">
              Route with moderate flood risk
            </p>
            <div className="mb-4">
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={config.manageable_route_penalty}
                onChange={(e) =>
                  handlePenaltyChange(
                    "manageable_route_penalty",
                    parseFloat(e.target.value)
                  )
                }
                className="w-full px-4 py-3 border border-yellow-300 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-yellow-600">
                {config.manageable_route_penalty.toFixed(2)}x
              </span>
              <p className="text-xs text-gray-600 mt-1">Multiplier</p>
            </div>
          </div>

          {/* Flood-Prone Route */}
          <div className="bg-gradient-to-br from-red-50 to-pink-50 border border-red-200 rounded-xl p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Flood-Prone Route Penalty
            </label>
            <p className="text-xs text-gray-600 mb-4">
              Route through high-risk flood areas
            </p>
            <div className="mb-4">
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={config.flood_prone_route_penalty}
                onChange={(e) =>
                  handlePenaltyChange(
                    "flood_prone_route_penalty",
                    parseFloat(e.target.value)
                  )
                }
                className="w-full px-4 py-3 border border-red-300 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-red-600">
                {config.flood_prone_route_penalty.toFixed(2)}x
              </span>
              <p className="text-xs text-gray-600 mt-1">Multiplier</p>
            </div>
          </div>
        </div>
      </div>

      {/* API Update Frequency */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Clock className="w-6 h-6 text-indigo-600" />
          <h3 className="text-2xl font-bold text-gray-900">
            API Update Frequency
          </h3>
        </div>
        <p className="text-gray-600 mb-6">
          How often the system automatically fetches new flood data
        </p>

        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Update Interval
              </label>
              <p className="text-sm text-gray-600">
                Automatic update frequency in minutes
              </p>
            </div>
            <span className="text-3xl font-bold text-indigo-600">
              {config.api_update_frequency}
            </span>
          </div>
          <input
            type="range"
            min="15"
            max="180"
            step="15"
            value={config.api_update_frequency}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                api_update_frequency: parseInt(e.target.value),
              }))
            }
            className="w-full h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="mt-4 flex justify-between text-sm text-gray-600">
            <span>15 min</span>
            <span>90 min</span>
            <span>180 min (3 hours)</span>
          </div>
          <p className="mt-4 text-xs text-gray-600 flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-500" />
            Updates will run automatically every {config.api_update_frequency}{" "}
            minutes via background scheduler
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 justify-end sticky bottom-6">
        <button
          onClick={resetConfiguration}
          disabled={!hasChanges || isLoading || isSaving}
          className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
        >
          <RotateCcw className="w-5 h-5" />
          Discard Changes
        </button>
        <button
          onClick={saveConfiguration}
          disabled={!hasChanges || !isWeightValid || isLoading || isSaving}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
        >
          <Save className="w-5 h-5" />
          {isSaving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
};
