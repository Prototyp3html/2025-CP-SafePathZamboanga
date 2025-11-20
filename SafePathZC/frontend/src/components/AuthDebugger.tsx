import React, { useState, useEffect } from "react";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface AuthDebuggerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TokenInfo {
  token?: string;
  decoded?: any;
  isValid?: boolean;
  error?: string;
}

export const AuthDebugger: React.FC<AuthDebuggerProps> = ({
  isOpen,
  onClose,
}) => {
  const [adminTokenInfo, setAdminTokenInfo] = useState<TokenInfo>({});
  const [userTokenInfo, setUserTokenInfo] = useState<TokenInfo>({});
  const [backendStatus, setBackendStatus] = useState<{
    status: string;
    error?: string;
  }>({ status: "checking" });
  const [isLoading, setIsLoading] = useState(false);

  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  // Helper function to decode JWT token (basic decode, not verified)
  const decodeJWT = (token: string) => {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      return null;
    }
  };

  // Check localStorage tokens
  const checkTokens = () => {
    const adminToken = localStorage.getItem("admin_token");
    const userToken = localStorage.getItem("user_token");
    const adminData = localStorage.getItem("admin_data");
    const userData = localStorage.getItem("user_data");

    // Check admin token
    if (adminToken) {
      const decoded = decodeJWT(adminToken);
      const now = Date.now() / 1000;
      const isExpired = decoded?.exp && decoded.exp < now;
      
      setAdminTokenInfo({
        token: adminToken.substring(0, 20) + "...",
        decoded,
        isValid: !isExpired,
        error: isExpired ? "Token expired" : undefined,
      });
    } else {
      setAdminTokenInfo({
        error: "No admin token found",
      });
    }

    // Check user token
    if (userToken) {
      const decoded = decodeJWT(userToken);
      const now = Date.now() / 1000;
      const isExpired = decoded?.exp && decoded.exp < now;
      
      setUserTokenInfo({
        token: userToken.substring(0, 20) + "...",
        decoded,
        isValid: !isExpired,
        error: isExpired ? "Token expired" : undefined,
      });
    } else {
      setUserTokenInfo({
        error: "No user token found",
      });
    }

    console.log("Auth Debug Info:", {
      adminToken: adminToken ? "Present" : "Missing",
      userToken: userToken ? "Present" : "Missing",
      adminData: adminData ? JSON.parse(adminData) : "Missing",
      userData: userData ? JSON.parse(userData) : "Missing",
    });
  };

  // Test backend connectivity and auth
  const testBackendAuth = async () => {
    setIsLoading(true);
    try {
      const adminToken = localStorage.getItem("admin_token");
      
      if (!adminToken) {
        setBackendStatus({
          status: "error",
          error: "No admin token to test with",
        });
        return;
      }

      // Test admin verification endpoint
      const response = await fetch(`${BACKEND_URL}/admin/verify`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setBackendStatus({
          status: "success",
        });
        console.log("Backend auth test successful:", data);
      } else {
        const errorData = await response.json();
        setBackendStatus({
          status: "error",
          error: `HTTP ${response.status}: ${errorData.detail || response.statusText}`,
        });
        console.error("Backend auth test failed:", response.status, errorData);
      }
    } catch (error) {
      setBackendStatus({
        status: "error",
        error: `Network error: ${error}`,
      });
      console.error("Backend connectivity test failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial check when component opens
  useEffect(() => {
    if (isOpen) {
      checkTokens();
      testBackendAuth();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">
              Authentication Debugger
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Refresh Button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Authentication Status</h3>
            <button
              onClick={() => {
                checkTokens();
                testBackendAuth();
              }}
              disabled={isLoading}
              className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          {/* Admin Token Info */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center mb-2">
              {adminTokenInfo.isValid ? (
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              ) : adminTokenInfo.error ? (
                <XCircle className="w-5 h-5 text-red-500 mr-2" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
              )}
              <h4 className="font-semibold">Admin Token</h4>
            </div>
            
            {adminTokenInfo.token && (
              <p className="text-sm text-gray-600 mb-2">
                Token: {adminTokenInfo.token}
              </p>
            )}
            
            {adminTokenInfo.decoded && (
              <div className="text-sm space-y-1">
                <p>
                  <span className="font-medium">User ID:</span>{" "}
                  {adminTokenInfo.decoded.sub}
                </p>
                <p>
                  <span className="font-medium">Role:</span>{" "}
                  {adminTokenInfo.decoded.role || "N/A"}
                </p>
                <p>
                  <span className="font-medium">Expires:</span>{" "}
                  {adminTokenInfo.decoded.exp
                    ? new Date(adminTokenInfo.decoded.exp * 1000).toLocaleString()
                    : "N/A"}
                </p>
              </div>
            )}
            
            {adminTokenInfo.error && (
              <p className="text-sm text-red-600 mt-2">
                Error: {adminTokenInfo.error}
              </p>
            )}
          </div>

          {/* User Token Info */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center mb-2">
              {userTokenInfo.isValid ? (
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              ) : userTokenInfo.error ? (
                <XCircle className="w-5 h-5 text-red-500 mr-2" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
              )}
              <h4 className="font-semibold">User Token</h4>
            </div>
            
            {userTokenInfo.token && (
              <p className="text-sm text-gray-600 mb-2">
                Token: {userTokenInfo.token}
              </p>
            )}
            
            {userTokenInfo.decoded && (
              <div className="text-sm space-y-1">
                <p>
                  <span className="font-medium">User ID:</span>{" "}
                  {userTokenInfo.decoded.sub}
                </p>
                <p>
                  <span className="font-medium">Role:</span>{" "}
                  {userTokenInfo.decoded.role || "N/A"}
                </p>
                <p>
                  <span className="font-medium">Expires:</span>{" "}
                  {userTokenInfo.decoded.exp
                    ? new Date(userTokenInfo.decoded.exp * 1000).toLocaleString()
                    : "N/A"}
                </p>
              </div>
            )}
            
            {userTokenInfo.error && (
              <p className="text-sm text-red-600 mt-2">
                Error: {userTokenInfo.error}
              </p>
            )}
          </div>

          {/* Backend Status */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center mb-2">
              {backendStatus.status === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              ) : backendStatus.status === "error" ? (
                <XCircle className="w-5 h-5 text-red-500 mr-2" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
              )}
              <h4 className="font-semibold">Backend Authentication Test</h4>
            </div>
            
            <p className="text-sm text-gray-600">
              Backend URL: {BACKEND_URL}
            </p>
            
            {backendStatus.status === "success" && (
              <p className="text-sm text-green-600 mt-2">
                ✅ Backend authentication working correctly
              </p>
            )}
            
            {backendStatus.error && (
              <p className="text-sm text-red-600 mt-2">
                Error: {backendStatus.error}
              </p>
            )}
          </div>

          {/* Local Storage Info */}
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-2">Local Storage Data</h4>
            <div className="text-sm space-y-1">
              <p>
                <span className="font-medium">admin_data:</span>{" "}
                {localStorage.getItem("admin_data") ? "Present" : "Missing"}
              </p>
              <p>
                <span className="font-medium">user_data:</span>{" "}
                {localStorage.getItem("user_data") ? "Present" : "Missing"}
              </p>
              {localStorage.getItem("admin_data") && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                  <pre>
                    {JSON.stringify(
                      JSON.parse(localStorage.getItem("admin_data") || "{}"),
                      null,
                      2
                    )}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-2">Quick Actions</h4>
            <div className="space-y-2">
              <button
                onClick={() => {
                  localStorage.removeItem("admin_token");
                  localStorage.removeItem("admin_data");
                  localStorage.removeItem("user_token");
                  localStorage.removeItem("user_data");
                  checkTokens();
                }}
                className="w-full px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Clear All Auth Data
              </button>
              <button
                onClick={() => {
                  console.log("Auth Debug - Full localStorage dump:");
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key) {
                      console.log(`${key}:`, localStorage.getItem(key));
                    }
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Log All Data to Console
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};