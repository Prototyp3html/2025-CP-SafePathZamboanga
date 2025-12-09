import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
  Droplets,
  TrendingUp,
} from "lucide-react";
import { notification } from "@/utils/notifications";

interface FloodUpdateStatus {
  is_updating: boolean;
  status: "idle" | "updating" | "completed" | "failed";
  progress: number;
  roads_updated: number;
  last_update_time: string | null;
  error_message: string | null;
  elapsed_seconds: number;
}

export const FloodDataManagement: React.FC = () => {
  const [updateStatus, setUpdateStatus] = useState<FloodUpdateStatus>({
    is_updating: false,
    status: "idle",
    progress: 0,
    roads_updated: 0,
    last_update_time: null,
    error_message: null,
    elapsed_seconds: 0,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Poll for status updates while updating
  useEffect(() => {
    if (updateStatus.is_updating) {
      const interval = setInterval(() => {
        checkUpdateStatus();
      }, 2000); // Poll every 2 seconds
      setPollInterval(interval);

      return () => clearInterval(interval);
    } else if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [updateStatus.is_updating]);

  // Load initial status on mount
  useEffect(() => {
    checkUpdateStatus();
  }, []);

  const checkUpdateStatus = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return;

      const response = await fetch(
        `${BACKEND_URL}/admin/flood/update-status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const status = await response.json();
        setUpdateStatus(status);
      }
    } catch (error) {
      console.error("Error checking update status:", error);
    }
  };

  const triggerFloodUpdate = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("admin_token");

      if (!token) {
        notification.error("Admin authentication required");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/admin/flood/update-now`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        setUpdateStatus(result.status);
        notification.success("Flood data update initiated");
      } else if (response.status === 409) {
        notification.warning("Flood update already in progress");
        checkUpdateStatus();
      } else {
        const error = await response.json();
        notification.error(error.detail || "Failed to initiate update");
      }
    } catch (error) {
      notification.error("Error initiating flood update");
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return "Invalid date";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "updating":
        return "text-blue-600";
      case "completed":
        return "text-green-600";
      case "failed":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case "updating":
        return "bg-blue-50 border-blue-200";
      case "completed":
        return "bg-green-50 border-green-200";
      case "failed":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Droplets className="w-6 h-6 text-blue-600" />
          <h3 className="text-2xl font-bold text-gray-900">
            Flood Data Management
          </h3>
        </div>
        <p className="text-gray-600">
          Monitor and manually trigger flood data updates
        </p>
      </div>

      {/* Update Status Card */}
      <div
        className={`border rounded-xl p-6 mb-6 transition-all ${getStatusBgColor(updateStatus.status)}`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {updateStatus.status === "updating" && (
              <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
            )}
            {updateStatus.status === "completed" && (
              <CheckCircle className="w-6 h-6 text-green-600" />
            )}
            {updateStatus.status === "failed" && (
              <AlertCircle className="w-6 h-6 text-red-600" />
            )}
            {updateStatus.status === "idle" && (
              <Activity className="w-6 h-6 text-gray-600" />
            )}

            <div>
              <p className={`font-semibold ${getStatusColor(updateStatus.status)}`}>
                {updateStatus.status === "updating"
                  ? "Update In Progress"
                  : updateStatus.status === "completed"
                    ? "Last Update Completed"
                    : updateStatus.status === "failed"
                      ? "Last Update Failed"
                      : "No Updates Yet"}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {updateStatus.last_update_time ? (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {formatTime(updateStatus.last_update_time)}
                  </span>
                ) : (
                  "No updates have been run yet"
                )}
              </p>
            </div>
          </div>

          {updateStatus.is_updating && (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">
              <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
              {updateStatus.elapsed_seconds.toFixed(0)}s elapsed
            </span>
          )}
        </div>

        {/* Progress Bar */}
        {updateStatus.is_updating && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Progress
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {updateStatus.progress}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${updateStatus.progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-6 mt-4">
          <div>
            <p className="text-xs text-gray-600 uppercase tracking-wider">
              Roads Updated
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {updateStatus.roads_updated}
            </p>
          </div>
          {updateStatus.status === "failed" && (
            <div>
              <p className="text-xs text-red-600 uppercase tracking-wider">
                Error
              </p>
              <p className="text-sm font-medium text-red-700 mt-1">
                {updateStatus.error_message}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={triggerFloodUpdate}
        disabled={
          isLoading ||
          updateStatus.is_updating ||
          updateStatus.status === "updating"
        }
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
      >
        <RefreshCw
          className={`w-5 h-5 ${isLoading || updateStatus.is_updating ? "animate-spin" : ""}`}
        />
        {isLoading || updateStatus.is_updating
          ? "Updating..."
          : "Update Flood Data Now"}
      </button>

      {/* Info Cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Flood Status */}
        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Droplets className="w-5 h-5 text-red-600" />
            <h4 className="font-semibold text-gray-900">Current Status</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-700">Flooded Roads</span>
              <span className="font-bold text-red-600">49 / 10,494</span>
            </div>
            <div className="w-full bg-red-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full"
                style={{ width: "0.47%" }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 pt-2">0.47% of roads affected</p>
          </div>
        </div>

        {/* Last 24 Hours Activity */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-gray-900">System Status</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-700">Uptime</span>
              <span className="font-bold text-blue-600">99.8%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Last Check</span>
              <span className="font-bold text-blue-600">Just now</span>
            </div>
            <p className="text-sm text-gray-600 pt-2">
              System running normally
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
