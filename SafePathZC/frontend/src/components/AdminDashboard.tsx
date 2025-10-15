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
} from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "analytics">(
    "reports"
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const [searchTerm, setSearchTerm] = useState("");

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Load data on component mount
  useEffect(() => {
    loadReports();
    loadUsers();
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
    <div className="w-full">
      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-6">
        <button
          onClick={() => setActiveTab("reports")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "reports"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          <Flag className="inline-block w-4 h-4 mr-2" />
          Reports ({Array.isArray(reports) ? reports.length : 0})
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "users"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          <Users className="inline-block w-4 h-4 mr-2" />
          Users ({Array.isArray(users) ? users.length : 0})
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "analytics"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          <AlertTriangle className="inline-block w-4 h-4 mr-2" />
          Analytics
        </button>
      </div>

      {/* Reports Tab */}
      {activeTab === "reports" && (
        <div>
          {/* Filters and Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1 rounded-full text-sm ${
                  filter === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("pending")}
                className={`px-3 py-1 rounded-full text-sm ${
                  filter === "pending"
                    ? "bg-yellow-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setFilter("approved")}
                className={`px-3 py-1 rounded-full text-sm ${
                  filter === "approved"
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                Approved
              </button>
              <button
                onClick={() => setFilter("rejected")}
                className={`px-3 py-1 rounded-full text-sm ${
                  filter === "rejected"
                    ? "bg-red-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                Rejected
              </button>
            </div>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
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
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">
                            {report.title}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              report.status
                            )}`}
                          >
                            {report.status}
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${getUrgencyColor(
                              report.urgency
                            )}`}
                          >
                            {report.urgency}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-2">
                          {report.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
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
        <div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                User Management
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reports
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.role === "admin"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {user.reportCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.joinedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            user.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </span>
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
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Flag className="h-8 w-8 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">
                    Total Reports
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {Array.isArray(reports) ? reports.length : 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Clock className="h-8 w-8 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">
                    Pending Reports
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {reports.filter((r) => r.status === "pending").length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Users className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">
                    Active Users
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {users.filter((u) => u.isActive).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border border-gray-200">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">
                    Approved Today
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {
                      reports.filter(
                        (r) =>
                          r.status === "approved" &&
                          new Date(r.updatedAt).toDateString() ===
                            new Date().toDateString()
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-4">
              {reports
                .sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                )
                .slice(0, 5)
                .map((report) => (
                  <div key={report.id} className="flex items-center space-x-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        getStatusColor(report.status).split(" ")[0]
                      }`}
                    ></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        {report.title} - {report.status}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(report.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
