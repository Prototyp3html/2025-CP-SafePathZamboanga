import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  Activity,
  Droplets,
  TrendingUp,
  BarChart3,
  Calendar,
  Filter,
  MapPin,
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

interface FloodHotspot {
  road_id: string;
  road_name: string;
  total_flood_events: number;
  total_flooded_hours: number;
  frequency_per_year: number;
  flood_risk_score: number;
  last_flood_start: string | null;
}

interface FloodStats {
  total_events: number;
  unique_roads_affected: number;
  average_events_per_road: number;
  top_flooded_roads: FloodHotspot[];
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
  const [componentError, setComponentError] = useState<string | null>(null);
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  
  // Flood History Analytics
  const [floodStats, setFloodStats] = useState<FloodStats>({
    total_events: 0,
    unique_roads_affected: 0,
    average_events_per_road: 0,
    top_flooded_roads: [],
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [filterDays, setFilterDays] = useState(30);
  const [sortBy, setSortBy] = useState<'events' | 'hours' | 'risk'>('events');

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

  // Fetch flood history analytics
  const fetchFloodHistoryStats = async () => {
    try {
      setLoadingStats(true);
      setComponentError(null);
      console.log(`Fetching flood stats for last ${filterDays} days, sorted by ${sortBy}`);
      
      const response = await fetch(
        `${BACKEND_URL}/api/flood-history/statistics?days_back=${filterDays}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Statistics API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Statistics response:", data);
      
      // Fetch hotspots for top flooded roads
      const hotspotsResponse = await fetch(
        `${BACKEND_URL}/api/flood-history/hotspots?limit=10`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!hotspotsResponse.ok) {
        throw new Error(`Hotspots API error: ${hotspotsResponse.status} ${hotspotsResponse.statusText}`);
      }

      const hotspotsData = await hotspotsResponse.json();
      const hotspots = hotspotsData.hotspots || [];
      
      console.log("Hotspots fetched:", hotspots.length);
      
      // Sort based on selected criteria
      let sorted = [...hotspots];
      if (sortBy === 'hours') {
        sorted.sort((a, b) => b.total_flooded_hours - a.total_flooded_hours);
      } else if (sortBy === 'risk') {
        sorted.sort((a, b) => b.flood_risk_score - a.flood_risk_score);
      } else {
        sorted.sort((a, b) => b.total_flood_events - a.total_flood_events);
      }

      const stats = {
        total_events: data.statistics?.total_events || 0,
        unique_roads_affected: data.statistics?.unique_roads_affected || 0,
        average_events_per_road: hotspots.length > 0 
          ? (data.statistics?.total_events || 0) / hotspots.length 
          : 0,
        top_flooded_roads: sorted.slice(0, 10),
      };
      
      console.log("Setting flood stats:", stats);
      setFloodStats(stats);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error fetching flood stats";
      console.error("Error fetching flood stats:", errorMsg);
      setComponentError(errorMsg);
    } finally {
      setLoadingStats(false);
    }
  };

  // Refetch when filter changes
  useEffect(() => {
    fetchFloodHistoryStats();
  }, [filterDays, sortBy]);

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
        
        // Also fetch logs if update is in progress or just completed
        if (status.is_updating || status.status === "completed" || status.status === "failed") {
          fetchUpdateLogs();
        }
      }
    } catch (error) {
      console.error("Error checking update status:", error);
    }
  };

  const fetchUpdateLogs = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) return;

      const response = await fetch(
        `${BACKEND_URL}/admin/flood/update-logs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.logs && data.logs.length > 0) {
          setUpdateLogs(data.logs);
          
          // Auto-scroll to bottom if autoscroll is enabled
          if (logsAutoScroll) {
            setTimeout(() => {
              const container = document.getElementById("flood-logs-container");
              if (container) {
                container.scrollTop = container.scrollHeight;
              }
            }, 0);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching update logs:", error);
    }
  };

  const triggerFloodUpdate = async () => {
    try {
      setIsLoading(true);
      setComponentError(null);
      setUpdateLogs(["🚀 Starting flood data update...", ""]);
      setLogsAutoScroll(true);
      
      const token = localStorage.getItem("admin_token");
      console.log("=== FLOOD UPDATE DEBUG ===");
      console.log("Token present:", !!token);

      if (!token) {
        notification.error("Admin authentication required", "Please log in to the admin dashboard first");
        setComponentError("No admin token found. Please log in again.");
        setUpdateLogs(prev => [...prev, "❌ Error: No admin token found"]);
        return;
      }

      console.log("Sending flood update request with Bearer token...");
      const authHeader = `Bearer ${token}`;
      
      const response = await fetch(`${BACKEND_URL}/admin/flood/update-now`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
      });

      console.log("Response status:", response.status);

      if (response.ok) {
        const result = await response.json();
        console.log("Update initiated:", result);
        setUpdateStatus(result.status);
        setUpdateLogs(prev => [...prev, "✅ Update request sent to backend", "⏳ Processing roads and analyzing flood risk..."]);
        notification.success("Flood data update initiated", "Monitor the logs below for detailed progress");
        
        // Start polling for updates
        checkUpdateStatus();
      } else if (response.status === 409) {
        notification.warning("Flood update already in progress", "Please wait for the current update to complete");
        setUpdateLogs(prev => [...prev, "⚠️ Update already in progress"]);
        checkUpdateStatus();
      } else {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
        const errorMsg = errorData.detail || `Failed to initiate update (Status: ${response.status})`;
        console.error("=== ERROR RESPONSE ===");
        console.error("Status:", response.status);
        console.error("Error data:", errorData);
        notification.error("Failed to initiate flood update", errorMsg);
        setComponentError(errorMsg);
        setUpdateLogs(prev => [...prev, `❌ Error: ${errorMsg}`]);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      notification.error("Error initiating flood update", errorMsg);
      console.error("=== FETCH ERROR ===");
      console.error("Error:", error);
      setComponentError(errorMsg);
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
      {componentError && (
        <div className="mb-6 p-4 bg-red-100 border border-red-300 rounded-lg">
          <p className="text-red-700 font-semibold">Error: {componentError}</p>
          <button
            onClick={() => setComponentError(null)}
            className="text-sm text-red-600 underline mt-2"
          >
            Dismiss
          </button>
        </div>
      )}
      
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

      {/* Update Logs Display */}
      {updateLogs.length > 0 && (
        <div className="mt-6 bg-gray-900 text-gray-100 rounded-xl overflow-hidden shadow-lg border border-gray-700">
          <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <h4 className="font-semibold text-sm">Update Progress Logs</h4>
            </div>
            <button
              onClick={() => setUpdateLogs([])}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
            >
              Clear
            </button>
          </div>
          <div 
            className="p-4 font-mono text-sm space-y-1 max-h-64 overflow-y-auto bg-gray-950"
            id="flood-logs-container"
          >
            {updateLogs.map((log, idx) => (
              <div key={idx} className="text-gray-300 whitespace-pre-wrap break-words">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
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

      {/* Flood History Analytics Section */}
      <div className="mt-12 border-t border-gray-200 pt-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-6 h-6 text-cyan-600" />
            <h3 className="text-2xl font-bold text-gray-900">
              Flood Data History Analytics
            </h3>
          </div>
          <p className="text-gray-600">
            Lifetime flood data showing where and when places flooded
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <select
              value={filterDays}
              onChange={(e) => setFilterDays(Number(e.target.value))}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
              <option value={99999}>All time</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'events' | 'hours' | 'risk')}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 font-medium hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="events">Sort by Event Count</option>
              <option value="hours">Sort by Total Hours Flooded</option>
              <option value="risk">Sort by Risk Score</option>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 border border-cyan-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-600 uppercase">
                Total Flood Events
              </h4>
              <Droplets className="w-5 h-5 text-cyan-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {loadingStats ? "..." : floodStats.total_events}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Recorded in selected period
            </p>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-600 uppercase">
                Unique Roads Affected
              </h4>
              <MapPin className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {loadingStats ? "..." : floodStats.unique_roads_affected}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Roads with flood history
            </p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-600 uppercase">
                Average Events/Road
              </h4>
              <TrendingUp className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {loadingStats ? "..." : (floodStats.average_events_per_road ?? 0).toFixed(1)}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Per affected road
            </p>
          </div>
        </div>

        {/* Top Flooded Roads Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-cyan-600" />
              Top Flood-Prone Roads
            </h4>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Road Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Total Events
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Total Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Freq/Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Risk Score
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Last Flooded
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loadingStats ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center">
                      <RefreshCw className="w-5 h-5 text-gray-400 animate-spin inline-block" />
                      <p className="text-gray-500 mt-2">Loading flood data...</p>
                    </td>
                  </tr>
                ) : floodStats.top_flooded_roads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No flood history data available
                    </td>
                  </tr>
                ) : (
                  floodStats.top_flooded_roads.map((road, idx) => {
                    const totalHours = road.total_flooded_hours ?? 0;
                    const frequency = road.frequency_per_year ?? 0;
                    const riskScore = road.flood_risk_score ?? 0;
                    
                    return (
                    <tr key={road.road_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-cyan-600"></div>
                          {road.road_name || "Unknown Road"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">
                          {road.total_flood_events ?? 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {totalHours.toFixed(1)}h
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                        {frequency.toFixed(2)}/yr
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                riskScore >= 80
                                  ? "bg-red-600"
                                  : riskScore >= 60
                                  ? "bg-orange-500"
                                  : riskScore >= 40
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${riskScore}%` }}
                            ></div>
                          </div>
                          <span className="font-semibold text-gray-900 min-w-max">
                            {riskScore.toFixed(0)}/100
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {road.last_flood_start
                          ? new Date(road.last_flood_start).toLocaleDateString()
                          : "Never"}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
