import React, { useState, useEffect } from "react";
import {
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  Filter,
  Search,
  Users,
  MapPin,
  Clock,
  Flag,
  Trash2,
  UserX,
  Shield,
  BarChart3,
  TrendingUp,
  Activity,
  Calendar,
  ChevronRight,
  Settings,
  Bell,
  Star,
  Award,
  Globe,
  Zap,
  Target,
} from "lucide-react";
import { notification } from "@/utils/notifications";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { AuthDebugger } from "./AuthDebugger";

interface Report {
  id: string;
  title: string;
  description: string;
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  reporter: {
    id: string;
    name: string;
    email: string;
  };
  category:
    | "flood"
    | "road_closure"
    | "accident"
    | "emergency"
    | "infrastructure"
    | "other";
  urgency: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected" | "under_review";
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
  images?: string[];
  adminNotes?: string;
  verificationScore?: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin" | "moderator";
  isActive: boolean;
  reportCount: number;
  joinedAt: string;
  lastActivity: string;
}

export const AdminDashboard: React.FC = () => {
  const { confirm } = useConfirmation();

  const [activeTab, setActiveTab] = useState<"reports" | "users" | "analytics">(
    "reports"
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<{
    users: number;
    admins: number;
    total_reports: number;
    pending_reports: number;
    approved_reports: number;
    total_posts: number;
  }>({
    users: 0,
    admins: 0,
    total_reports: 0,
    pending_reports: 0,
    approved_reports: 0,
    total_posts: 0,
  });
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    userId: number | null;
    userName: string;
  }>({
    isOpen: false,
    userId: null,
    userName: "",
  });

  const [deleteReportConfirm, setDeleteReportConfirm] = useState<{
    isOpen: boolean;
    reportId: number | null;
    reportTitle: string;
  }>({
    isOpen: false,
    reportId: null,
    reportTitle: "",
  });

  const [showAuthDebugger, setShowAuthDebugger] = useState(false);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Load data on component mount
  useEffect(() => {
    loadReports();
    loadUsers();
    loadStats();
  }, []);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        setReports([]);
        return;
      }

      console.log(
        "Loading reports with token:",
        token.substring(0, 20) + "..."
      );

      const response = await fetch(`${BACKEND_URL}/admin/reports`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Reports response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Reports data received:", data);

        // Backend returns {reports: [...]} so we need to extract the reports array
        const reportsArray = data.reports || data;
        if (Array.isArray(reportsArray)) {
          setReports(reportsArray);
          console.log(
            "Reports loaded successfully:",
            reportsArray.length,
            "reports"
          );
        } else {
          console.warn("Reports data is not an array:", data);
          setReports([]);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to load reports:", response.status, errorData);
        setReports([]);
      }
    } catch (error) {
      console.error("Error loading reports:", error);
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        setUsers([]);
        return;
      }

      console.log("Loading users with token:", token.substring(0, 20) + "...");

      const response = await fetch(`${BACKEND_URL}/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("Users response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Users data received:", data);

        // Backend returns {users: [...]} so we need to extract the users array
        const usersArray = data.users || data;
        if (Array.isArray(usersArray)) {
          setUsers(usersArray);
          console.log("Users loaded successfully:", usersArray.length, "users");
        } else {
          console.warn("Users data is not an array:", data);
          setUsers([]);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to load users:", response.status, errorData);
        setUsers([]);
      }
    } catch (error) {
      console.error("Error loading users:", error);
      setUsers([]);
    }
  };

  const loadStats = async () => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/admin/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
        console.log("Stats loaded successfully:", data);
      } else {
        const errorData = await response.json();
        console.error("Failed to load stats:", response.status, errorData);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const deleteUser = async (userId: number) => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        console.log("User deleted successfully");
        // Reload users to refresh the list
        loadUsers();
        // Close the confirmation dialog
        setDeleteConfirm({ isOpen: false, userId: null, userName: "" });
      } else {
        const errorData = await response.json();
        console.error("Failed to delete user:", response.status, errorData);
        notification.error(
          "Delete Failed",
          "Failed to delete user. Please try again."
        );
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      notification.error(
        "Delete Error",
        "Error deleting user. Please try again."
      );
    }
  };

  const toggleUserStatus = async (userId: number, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        return;
      }

      const response = await fetch(
        `${BACKEND_URL}/admin/users/${userId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_active: !currentStatus,
          }),
        }
      );

      if (response.ok) {
        console.log("User status updated successfully");
        // Reload users to refresh the list
        loadUsers();
      } else {
        const errorData = await response.json();
        console.error(
          "Failed to update user status:",
          response.status,
          errorData
        );
        notification.error(
          "Update Failed",
          "Failed to update user status. Please try again."
        );
      }
    } catch (error) {
      console.error("Error updating user status:", error);
      notification.error(
        "Update Error",
        "Error updating user status. Please try again."
      );
    }
  };

  const openDeleteConfirm = (userId: number, userName: string) => {
    setDeleteConfirm({
      isOpen: true,
      userId: userId,
      userName: userName,
    });
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirm({
      isOpen: false,
      userId: null,
      userName: "",
    });
  };

  const syncForumPosts = async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      notification.auth.unauthorized();
      return;
    }

    try {
      const response = await fetch(
        `${BACKEND_URL}/admin/reports/sync-forum-posts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        notification.success(
          "Forum Posts Synced Successfully!",
          `Successfully synced ${result.synced_count} forum posts with approved reports. Check the community forum to see the updates!`
        );
      } else {
        throw new Error(`Failed to sync: ${response.status}`);
      }
    } catch (error) {
      console.error("Sync error:", error);
      notification.error(
        "Sync Failed",
        "Failed to sync forum posts. Please try again."
      );
    }
  };

  const updateReportStatus = async (
    reportId: string,
    status: "approved" | "rejected",
    notes?: string
  ) => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        return;
      }

      const response = await fetch(
        `${BACKEND_URL}/admin/reports/${reportId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status, admin_notes: notes }),
        }
      );

      if (response.ok) {
        await loadReports();
        setSelectedReport(null);
      } else {
        const errorData = await response.json();
        console.error(
          "Failed to update report status:",
          response.status,
          errorData
        );
      }
    } catch (error) {
      console.error("Error updating report status:", error);
    }
  };

  const toggleReportVisibility = async (
    reportId: string,
    isVisible: boolean
  ) => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        return;
      }

      const response = await fetch(
        `${BACKEND_URL}/admin/reports/${reportId}/visibility`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ isVisible }),
        }
      );

      if (response.ok) {
        await loadReports();
      } else {
        const errorData = await response.json();
        console.error(
          "Failed to update report visibility:",
          response.status,
          errorData
        );
      }
    } catch (error) {
      console.error("Error updating report visibility:", error);
    }
  };

  const deleteReport = async (reportId: number) => {
    try {
      const token = localStorage.getItem("admin_token");
      if (!token) {
        console.error("No admin token found");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/admin/reports/${reportId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        console.log("Report deleted successfully");
        await loadReports(); // Refresh the reports list
        setDeleteReportConfirm({
          isOpen: false,
          reportId: null,
          reportTitle: "",
        });

        // Show success notification with enhanced UI
        notification.success(
          "Report Deleted",
          "The report and associated forum post have been permanently deleted."
        );
      } else {
        const errorData = await response.json();
        console.error("Failed to delete report:", response.status, errorData);
        notification.error(
          "Delete Failed",
          "Failed to delete the report. Please try again or contact support if the problem persists."
        );
      }
    } catch (error) {
      console.error("Error deleting report:", error);
      notification.error(
        "Delete Error",
        "An unexpected error occurred while deleting the report. Please check your connection and try again."
      );
    }
  };

  const openDeleteReportConfirm = (reportId: number, reportTitle: string) => {
    setDeleteReportConfirm({
      isOpen: true,
      reportId,
      reportTitle,
    });
  };

  const closeDeleteReportConfirm = () => {
    setDeleteReportConfirm({
      isOpen: false,
      reportId: null,
      reportTitle: "",
    });
  };

  const filteredReports = Array.isArray(reports)
    ? reports.filter((report) => {
        const matchesFilter = filter === "all" || report.status === filter;
        const matchesSearch =
          searchTerm === "" ||
          report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.location.address
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        return matchesFilter && matchesSearch;
      })
    : [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "under_review":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "low":
        return "bg-gray-100 text-gray-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "critical":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Admin Dashboard
                </h1>
                <p className="text-gray-600 text-sm">
                  Manage your SafePath system
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-8 bg-white p-1 rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => setActiveTab("reports")}
            className={`flex items-center px-4 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === "reports"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Flag className="w-4 h-4 mr-2" />
            Reports
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                activeTab === "reports"
                  ? "bg-white/20 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {Array.isArray(reports) ? reports.length : 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center px-4 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === "users"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            Users
            <span
              className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                activeTab === "users"
                  ? "bg-white/20 text-white"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {Array.isArray(users) ? users.length : 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center px-4 py-2 rounded-md font-medium transition-all duration-200 ${
              activeTab === "analytics"
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </button>
        </div>
      </div>

      {/* Reports Tab */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Total Reports
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.total_reports}
                  </p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <Flag className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Pending</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.pending_reports}
                  </p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Approved</p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.approved_reports}
                  </p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">Critical</p>
                  <p className="text-2xl font-bold text-red-600">
                    {Array.isArray(reports)
                      ? reports.filter((r) => r.urgency === "critical").length
                      : 0}
                  </p>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                    filter === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All Reports
                </button>
                <button
                  onClick={() => setFilter("pending")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                    filter === "pending"
                      ? "bg-orange-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setFilter("approved")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                    filter === "approved"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Approved
                </button>
                <button
                  onClick={() => setFilter("rejected")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
                    filter === "rejected"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Rejected
                </button>
              </div>

              {/* Admin Actions */}
              <div className="flex gap-2">
                <button
                  onClick={syncForumPosts}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors duration-200 flex items-center gap-2 border border-gray-300"
                  title="Sync approved reports with community forum posts"
                >
                  <i className="fas fa-sync-alt text-sm"></i>
                  Sync Forum
                </button>
                <button
                  onClick={() => setShowAuthDebugger(true)}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors duration-200 flex items-center gap-2 border border-blue-300"
                  title="Debug authentication issues"
                >
                  <Shield className="w-4 h-4" />
                  Debug Auth
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search reports..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
                />
              </div>
            </div>
          </div>

          {/* Reports List */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading reports...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReports.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No reports found matching your criteria.
                </div>
              ) : (
                filteredReports.map((report) => (
                  <div
                    key={report.id}
                    className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 hover:transform hover:scale-[1.02] group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <h3 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                            {report.title}
                          </h3>
                          <div className="flex gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getStatusColor(
                                report.status
                              )}`}
                            >
                              {report.status}
                            </span>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${getUrgencyColor(
                                report.urgency
                              )}`}
                            >
                              {report.urgency}
                            </span>
                          </div>
                        </div>
                        <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                          {report.description}
                        </p>
                        <div className="flex items-center gap-6 text-sm text-gray-500">
                          <span className="flex items-center gap-2 bg-gray-50 px-3 py-1 rounded-lg">
                            <MapPin className="w-4 h-4 text-blue-500" />
                            {report.location.address}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                          <span>By: {report.reporter.name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() =>
                            toggleReportVisibility(report.id, !report.isVisible)
                          }
                          className={`p-2 rounded-lg transition-colors ${
                            report.isVisible
                              ? "bg-green-100 text-green-600 hover:bg-green-200"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                          title={
                            report.isVisible
                              ? "Hide from public"
                              : "Show to public"
                          }
                        >
                          {report.isVisible ? (
                            <Eye className="w-4 h-4" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>
                        {report.status === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                updateReportStatus(report.id, "approved")
                              }
                              className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                              title="Approve report"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() =>
                                updateReportStatus(report.id, "rejected")
                              }
                              className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                              title="Reject report"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {/* Delete button - always available */}
                        <button
                          onClick={() =>
                            openDeleteReportConfirm(
                              parseInt(report.id),
                              report.title
                            )
                          }
                          className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                          title="Delete report permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* User Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-6 rounded-2xl shadow-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">
                    Total Users
                  </p>
                  <p className="text-3xl font-bold">{stats.users}</p>
                </div>
                <Users className="w-8 h-8 text-emerald-200" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-cyan-600 p-6 rounded-2xl shadow-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">
                    Active Users
                  </p>
                  <p className="text-3xl font-bold">
                    {Array.isArray(users)
                      ? users.filter((u) => u.isActive).length
                      : 0}
                  </p>
                </div>
                <Activity className="w-8 h-8 text-blue-200" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 p-6 rounded-2xl shadow-xl text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100 text-sm font-medium">Admins</p>
                  <p className="text-3xl font-bold">{stats.admins}</p>
                </div>
                <Shield className="w-8 h-8 text-purple-200" />
              </div>
            </div>
          </div>

          {/* User Management Table */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="bg-blue-600 p-2 rounded-lg">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    User Management
                  </h3>
                </div>
                <div className="text-sm text-gray-600 bg-white px-3 py-1 rounded-full">
                  {Array.isArray(users) ? users.length : 0} users total
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Reports
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {users.map((user, index) => (
                    <tr
                      key={user.id}
                      className={`hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-25"
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {user.name
                                ? user.name.charAt(0).toUpperCase()
                                : "U"}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-gray-900">
                              {user.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                              user.role === "admin"
                                ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
                                : "bg-gradient-to-r from-gray-400 to-gray-500 text-white"
                            }`}
                          >
                            {user.role === "admin" && (
                              <Shield className="w-3 h-3 mr-1" />
                            )}
                            {user.role}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">
                        <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg inline-block">
                          {user.reportCount}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                          {new Date(user.joinedAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                            user.isActive
                              ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                              : "bg-gradient-to-r from-red-500 to-pink-500 text-white"
                          }`}
                        >
                          <div
                            className={`w-2 h-2 rounded-full mr-2 ${
                              user.isActive ? "bg-white" : "bg-white opacity-70"
                            }`}
                          ></div>
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          {/* Toggle Status Button */}
                          <button
                            onClick={() =>
                              toggleUserStatus(parseInt(user.id), user.isActive)
                            }
                            className={`p-2 rounded-xl font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md ${
                              user.isActive
                                ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
                                : "bg-green-100 text-green-700 hover:bg-green-200"
                            }`}
                            title={
                              user.isActive
                                ? "Deactivate User"
                                : "Activate User"
                            }
                          >
                            {user.isActive ? (
                              <UserX size={18} />
                            ) : (
                              <Shield size={18} />
                            )}
                          </button>

                          {/* Delete Button - Only show for non-admin users */}
                          {user.role !== "admin" && (
                            <button
                              onClick={() =>
                                openDeleteConfirm(parseInt(user.id), user.name)
                              }
                              className="p-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 transition-all duration-200 shadow-sm hover:shadow-md"
                              title="Delete User"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="space-y-8">
          {/* Overview Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Total Reports
                  </p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Array.isArray(reports) ? reports.length : 0}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">All time</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <Flag className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Pending Reports
                  </p>
                  <p className="text-2xl font-bold text-orange-600">
                    {Array.isArray(reports)
                      ? reports.filter((r) => r.status === "pending").length
                      : 0}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">Needs attention</p>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    Active Users
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {Array.isArray(users)
                      ? users.filter((u) => u.isActive).length
                      : 0}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">Online today</p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    System Health
                  </p>
                  <p className="text-2xl font-bold text-gray-900">98%</p>
                  <p className="text-gray-500 text-xs mt-1">Uptime</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <Activity className="h-5 w-5 text-gray-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Reports */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
                    Recent Reports
                  </h3>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </div>
              <div className="p-6 space-y-4">
                {Array.isArray(reports) ? (
                  reports
                    .sort(
                      (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime()
                    )
                    .slice(0, 5)
                    .map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center space-x-4 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <div
                          className={`w-3 h-3 rounded-full ${
                            report.status === "approved"
                              ? "bg-green-500"
                              : report.status === "pending"
                              ? "bg-yellow-500"
                              : report.status === "rejected"
                              ? "bg-red-500"
                              : "bg-gray-500"
                          }`}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {report.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(report.updatedAt).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            report.status
                          )}`}
                        >
                          {report.status}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-gray-500 text-center py-4">
                    No reports available
                  </p>
                )}
              </div>
            </div>

            {/* System Overview */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center">
                    <Target className="w-5 h-5 mr-2 text-purple-600" />
                    System Overview
                  </h3>
                  <Zap className="w-5 h-5 text-yellow-500" />
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border border-green-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-green-800">
                      Database Status
                    </span>
                    <span className="text-green-600 font-bold">Healthy</span>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-800">
                      API Response Time
                    </span>
                    <span className="text-blue-600 font-bold">12ms</span>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-purple-800">
                      Active Sessions
                    </span>
                    <span className="text-purple-600 font-bold">
                      {Array.isArray(users)
                        ? users.filter((u) => u.isActive).length
                        : 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl border border-gray-100">
            <div className="flex items-center mb-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Trash2 className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-xl font-bold text-gray-900">
                  Delete User Account
                </h3>
                <p className="text-sm text-red-600 font-medium">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="mb-8">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-800 font-medium">
                  Are you sure you want to delete the user account for{" "}
                  <span className="font-bold text-red-700">
                    {deleteConfirm.userName}
                  </span>
                  ?
                </p>
              </div>
              <p className="text-sm text-gray-700 font-medium mb-3">
                This will permanently remove:
              </p>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  User account and profile
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  All posts and comments by this user
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  All likes and interactions
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  Route history and saved routes
                </li>
              </ul>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                onClick={closeDeleteConfirm}
                className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  deleteConfirm.userId && deleteUser(deleteConfirm.userId)
                }
                className="px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-red-600 to-pink-600 border border-transparent rounded-xl hover:from-red-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Report Confirmation Dialog */}
      {deleteReportConfirm.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl border border-gray-100">
            <div className="flex items-center mb-6">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Trash2 className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="ml-4">
                <h3 className="text-xl font-bold text-gray-900">
                  Delete Report
                </h3>
                <p className="text-sm text-red-600 font-medium">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="mb-8">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-gray-800 font-medium">
                  Are you sure you want to delete the report{" "}
                  <span className="font-bold text-red-700">
                    "{deleteReportConfirm.reportTitle}"
                  </span>
                  ?
                </p>
              </div>
              <p className="text-sm text-gray-700 font-medium mb-3">
                This will permanently remove:
              </p>
              <ul className="text-sm text-gray-600 space-y-2">
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  The original incident report
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  Associated forum post and discussion
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  All comments and likes on the forum post
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-red-400 rounded-full mr-3"></div>
                  All report data and metadata
                </li>
              </ul>
            </div>

            <div className="flex justify-end space-x-4">
              <button
                onClick={closeDeleteReportConfirm}
                className="px-6 py-3 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-xl hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-all duration-200"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  deleteReportConfirm.reportId &&
                  deleteReport(deleteReportConfirm.reportId)
                }
                className="px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-red-600 to-pink-600 border border-transparent rounded-xl hover:from-red-700 hover:to-pink-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Delete Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Debugger Modal */}
      <AuthDebugger
        isOpen={showAuthDebugger}
        onClose={() => setShowAuthDebugger(false)}
      />
    </div>
  );
};
