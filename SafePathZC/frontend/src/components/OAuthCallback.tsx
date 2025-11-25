import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface OAuthCallbackProps {
  provider: "google" | "facebook";
  onAuthSuccess?: (user: any) => void;
}

const OAuthCallback: React.FC<OAuthCallbackProps> = ({
  provider,
  onAuthSuccess,
}) => {
  const navigate = useNavigate();
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get authorization code from URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const state = urlParams.get("state");

        if (!code) {
          throw new Error("No authorization code received");
        }

        // Send code to backend
        const response = await fetch(
          `${BACKEND_URL}/auth/${provider}/callback`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ code, state }),
          }
        );

        const data = await response.json();

        if (response.ok) {
          // Store user token and data
          localStorage.setItem("user_token", data.token);
          localStorage.setItem(
            "user_data",
            JSON.stringify({
              ...data.user,
              userType: "user",
            })
          );

          if (onAuthSuccess) {
            onAuthSuccess(data.user);
          }

          // Redirect to home page or dashboard
          navigate("/");
        } else {
          console.error("OAuth callback error:", data);
          // Redirect to login with error
          navigate("/?error=oauth_failed");
        }
      } catch (error) {
        console.error("OAuth callback error:", error);
        navigate("/?error=oauth_failed");
      }
    };

    handleCallback();
  }, [provider, navigate, onAuthSuccess, BACKEND_URL]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <h2 className="mt-6 text-xl font-medium text-gray-900">
            Completing {provider === "google" ? "Google" : "Facebook"} login...
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Please wait while we verify your account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default OAuthCallback;
