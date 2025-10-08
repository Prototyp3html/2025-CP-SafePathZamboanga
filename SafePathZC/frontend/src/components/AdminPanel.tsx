import React, { useState, useEffect } from "react";
import {
  X,
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

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<"reports" | "users" | "analytics">(
    "reports"
  );
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterUrgency, setFilterUrgency] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [adminNotes, setAdminNotes] = useState("");

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Fetch reports from backend
  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/admin/reports`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch users from backend
  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/admin/users`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Update report status
  const updateReportStatus = async (
    reportId: string,
    status: Report["status"],
    notes?: string
  ) => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/admin/reports/${reportId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status,
            adminNotes: notes,
            updatedAt: new Date().toISOString(),
          }),
        }
      );

      if (response.ok) {
        // Update local state
        setReports((prev) =>
          prev.map((report) =>
            report.id === reportId
              ? {
                  ...report,
                  status,
                  adminNotes: notes,
                  updatedAt: new Date().toISOString(),
                }
              : report
          )
        );

        // Close detail view if this report was selected
        if (selectedReport?.id === reportId) {
          setSelectedReport(null);
        }

        console.log(`Report ${reportId} status updated to ${status}`);
      }
    } catch (error) {
      console.error("Error updating report status:", error);
    }
  };

  // Toggle report visibility
  const toggleReportVisibility = async (reportId: string) => {
    try {
      const report = reports.find((r) => r.id === reportId);
      if (!report) return;

      const response = await fetch(
        `${BACKEND_URL}/admin/reports/${reportId}/visibility`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isVisible: !report.isVisible }),
        }
      );

      if (response.ok) {
        setReports((prev) =>
          prev.map((report) =>
            report.id === reportId
              ? { ...report, isVisible: !report.isVisible }
              : report
          )
        );
      }
    } catch (error) {
      console.error("Error toggling report visibility:", error);
    }
  };

  // Update report urgency
  const updateReportUrgency = async (
    reportId: string,
    urgency: Report["urgency"]
  ) => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/admin/reports/${reportId}/urgency`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("admin_token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ urgency }),
        }
      );

      if (response.ok) {
        setReports((prev) =>
          prev.map((report) =>
            report.id === reportId ? { ...report, urgency } : report
          )
        );
      }
    } catch (error) {
      console.error("Error updating report urgency:", error);
    }
  };

  // Filter reports based on search and filters
  const filteredReports = reports.filter((report) => {
    const matchesSearch =
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.location.address.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      filterStatus === "all" || report.status === filterStatus;
    const matchesUrgency =
      filterUrgency === "all" || report.urgency === filterUrgency;
    const matchesCategory =
      filterCategory === "all" || report.category === filterCategory;

    return matchesSearch && matchesStatus && matchesUrgency && matchesCategory;
  });

  // Load data when component mounts or tab changes
  useEffect(() => {
    if (isOpen) {
      if (activeTab === "reports") {
        fetchReports();
      } else if (activeTab === "users") {
        fetchUsers();
      }
    }
  }, [isOpen, activeTab]);

  // Get status color
  const getStatusColor = (status: Report["status"]) => {
    switch (status) {
      case "pending":
        return "text-yellow-600 bg-yellow-100";
      case "approved":
        return "text-green-600 bg-green-100";
      case "rejected":
        return "text-red-600 bg-red-100";
      case "under_review":
        return "text-blue-600 bg-blue-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  // Get urgency color
  const getUrgencyColor = (urgency: Report["urgency"]) => {
    switch (urgency) {
      case "low":
        return "text-green-600 bg-green-100";
      case "medium":
        return "text-yellow-600 bg-yellow-100";
      case "high":
        return "text-orange-600 bg-orange-100";
      case "critical":
        return "text-red-600 bg-red-100";
      default:
        return "text-gray-600 bg-gray-100";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-7xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Admin Panel</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {["reports", "users", "analytics"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-3 font-medium capitalize ${
                activeTab === tab
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "reports" && (
            <div className="h-full flex">
              {/* Reports List */}
              <div className="w-1/2 border-r border-gray-200 flex flex-col">
                {/* Filters */}
                <div className="p-4 border-b border-gray-200 space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search reports..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="under_review">Under Review</option>
                    </select>

                    <select
                      value={filterUrgency}
                      onChange={(e) => setFilterUrgency(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="all">All Urgency</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>

                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      <option value="all">All Categories</option>
                      <option value="flood">Flood</option>
                      <option value="road_closure">Road Closure</option>
                      <option value="accident">Accident</option>
                      <option value="emergency">Emergency</option>
                      <option value="infrastructure">Infrastructure</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Reports List */}
                <div className="flex-1 overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      {filteredReports.map((report) => (
                        <div
                          key={report.id}
                          onClick={() => setSelectedReport(report)}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedReport?.id === report.id
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-medium text-gray-900 truncate">
                              {report.title}
                            </h3>
                            <div className="flex items-center space-x-2">
                              {report.isVisible ? (
                                <Eye className="w-4 h-4 text-green-600" />
                              ) : (
                                <EyeOff className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                          </div>

                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {report.description}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                                  report.status
                                )}`}
                              >
                                {report.status.replace("_", " ")}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getUrgencyColor(
                                  report.urgency
                                )}`}
                              >
                                {report.urgency}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(report.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Report Detail */}
              <div className="w-1/2 flex flex-col">
                {selectedReport ? (
                  <div className="h-full flex flex-col">
                    {/* Report Header */}
                    <div className="p-6 border-b border-gray-200">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {selectedReport.title}
                      </h3>
                      <div className="flex items-center space-x-4 mb-4">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                            selectedReport.status
                          )}`}
                        >
                          {selectedReport.status.replace("_", " ")}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-medium ${getUrgencyColor(
                            selectedReport.urgency
                          )}`}
                        >
                          {selectedReport.urgency}
                        </span>
                        <span className="text-sm text-gray-500">
                          <MapPin className="w-4 h-4 inline mr-1" />
                          {selectedReport.location.address}
                        </span>
                      </div>
                    </div>

                    {/* Report Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">
                          Description
                        </h4>
                        <p className="text-gray-700">
                          {selectedReport.description}
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">
                          Reporter Information
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm">
                            <strong>Name:</strong>{" "}
                            {selectedReport.reporter.name}
                          </p>
                          <p className="text-sm">
                            <strong>Email:</strong>{" "}
                            {selectedReport.reporter.email}
                          </p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">
                          Location Details
                        </h4>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm">
                            <strong>Address:</strong>{" "}
                            {selectedReport.location.address}
                          </p>
                          <p className="text-sm">
                            <strong>Coordinates:</strong>{" "}
                            {selectedReport.location.lat},{" "}
                            {selectedReport.location.lng}
                          </p>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">
                          Admin Notes
                        </h4>
                        <textarea
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Add admin notes..."
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          rows={4}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="p-6 border-t border-gray-200">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                          <label className="text-sm font-medium text-gray-700">
                            Urgency:
                          </label>
                          <select
                            value={selectedReport.urgency}
                            onChange={(e) =>
                              updateReportUrgency(
                                selectedReport.id,
                                e.target.value as Report["urgency"]
                              )
                            }
                            className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>

                        <button
                          onClick={() =>
                            toggleReportVisibility(selectedReport.id)
                          }
                          className={`px-4 py-2 rounded-lg text-sm font-medium ${
                            selectedReport.isVisible
                              ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                        >
                          {selectedReport.isVisible
                            ? "Hide from Public"
                            : "Make Visible"}
                        </button>
                      </div>

                      <div className="flex space-x-3">
                        <button
                          onClick={() =>
                            updateReportStatus(
                              selectedReport.id,
                              "approved",
                              adminNotes
                            )
                          }
                          className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center"
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Approve
                        </button>

                        <button
                          onClick={() =>
                            updateReportStatus(
                              selectedReport.id,
                              "under_review",
                              adminNotes
                            )
                          }
                          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                        >
                          <AlertTriangle className="w-4 h-4 mr-2" />
                          Review
                        </button>

                        <button
                          onClick={() =>
                            updateReportStatus(
                              selectedReport.id,
                              "rejected",
                              adminNotes
                            )
                          }
                          className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Select a report to view details
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "users" && (
            <div className="h-full overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="bg-white border border-gray-200 rounded-lg p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium text-gray-900">{user.name}</h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.isActive
                            ? "text-green-600 bg-green-100"
                            : "text-red-600 bg-red-100"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{user.email}</p>
                    <p className="text-sm text-gray-600 mb-2">
                      Role: {user.role}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      Reports: {user.reportCount}
                    </p>
                    <p className="text-sm text-gray-600">
                      Joined: {new Date(user.joinedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="h-full overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-blue-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-blue-900 mb-2">
                    Total Reports
                  </h3>
                  <p className="text-3xl font-bold text-blue-600">
                    {reports.length}
                  </p>
                </div>
                <div className="bg-yellow-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-yellow-900 mb-2">
                    Pending Review
                  </h3>
                  <p className="text-3xl font-bold text-yellow-600">
                    {reports.filter((r) => r.status === "pending").length}
                  </p>
                </div>
                <div className="bg-green-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-green-900 mb-2">
                    Approved
                  </h3>
                  <p className="text-3xl font-bold text-green-600">
                    {reports.filter((r) => r.status === "approved").length}
                  </p>
                </div>
                <div className="bg-red-50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium text-red-900 mb-2">
                    Critical Reports
                  </h3>
                  <p className="text-3xl font-bold text-red-600">
                    {reports.filter((r) => r.urgency === "critical").length}
                  </p>
                </div>
              </div>

              <div className="text-center text-gray-500">
                <p>More analytics features coming soon...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
