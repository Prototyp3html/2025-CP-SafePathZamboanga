import * as React from "react";
import { toast as baseToast } from "@/hooks/use-toast";
import {
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  MapPin,
  Navigation,
  Shield,
  Clock,
  Wifi,
  WifiOff,
} from "lucide-react";

export type NotificationType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "gps"
  | "route"
  | "safety"
  | "network";

const notificationConfig = {
  success: {
    icon: <CheckCircle className="h-5 w-5 text-green-600" />,
    className: "border-green-200 bg-green-50",
    titleClassName: "text-green-900",
    descriptionClassName: "text-green-700",
  },
  error: {
    icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
    className: "border-red-200 bg-red-50",
    titleClassName: "text-red-900",
    descriptionClassName: "text-red-700",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-orange-600" />,
    className: "border-orange-200 bg-orange-50",
    titleClassName: "text-orange-900",
    descriptionClassName: "text-orange-700",
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-600" />,
    className: "border-blue-200 bg-blue-50",
    titleClassName: "text-blue-900",
    descriptionClassName: "text-blue-700",
  },
  gps: {
    icon: <MapPin className="h-5 w-5 text-purple-600" />,
    className: "border-purple-200 bg-purple-50",
    titleClassName: "text-purple-900",
    descriptionClassName: "text-purple-700",
  },
  route: {
    icon: <Navigation className="h-5 w-5 text-indigo-600" />,
    className: "border-indigo-200 bg-indigo-50",
    titleClassName: "text-indigo-900",
    descriptionClassName: "text-indigo-700",
  },
  safety: {
    icon: <Shield className="h-5 w-5 text-emerald-600" />,
    className: "border-emerald-200 bg-emerald-50",
    titleClassName: "text-emerald-900",
    descriptionClassName: "text-emerald-700",
  },
  network: {
    icon: <WifiOff className="h-5 w-5 text-gray-600" />,
    className: "border-gray-200 bg-gray-50",
    titleClassName: "text-gray-900",
    descriptionClassName: "text-gray-700",
  },
};

export interface CustomNotificationOptions {
  title: string;
  description?: string;
  type?: NotificationType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
}

function createCustomToast({
  title,
  description,
  type = "info",
  duration = 5000,
  action,
  icon,
}: CustomNotificationOptions) {
  const config = notificationConfig[type];
  const displayIcon = icon || config.icon;

  baseToast({
    title: (
      <div className="flex items-center gap-2">
        {displayIcon}
        <span className={config.titleClassName}>{title}</span>
      </div>
    ),
    description: description && (
      <p className={config.descriptionClassName}>{description}</p>
    ),
    action: action && (
      <button
        onClick={action.onClick}
        className="text-sm font-medium underline hover:no-underline"
      >
        {action.label}
      </button>
    ),
    className: `${config.className} border-l-4 shadow-lg`,
    duration: duration,
  });
}

// Enhanced notification system with predefined common notifications
export const notification = {
  // Basic notifications
  success: (
    title: string,
    description?: string,
    options?: Partial<CustomNotificationOptions>
  ) => createCustomToast({ title, description, type: "success", ...options }),

  error: (
    title: string,
    description?: string,
    options?: Partial<CustomNotificationOptions>
  ) => createCustomToast({ title, description, type: "error", ...options }),

  warning: (
    title: string,
    description?: string,
    options?: Partial<CustomNotificationOptions>
  ) => createCustomToast({ title, description, type: "warning", ...options }),

  info: (
    title: string,
    description?: string,
    options?: Partial<CustomNotificationOptions>
  ) => createCustomToast({ title, description, type: "info", ...options }),

  // Specialized notifications for SafePath features
  gps: {
    permissionRequired: () =>
      createCustomToast({
        title: "GPS Permission Required",
        description:
          "Please enable location access to track your route progress and receive accurate navigation.",
        type: "gps",
        duration: 8000,
      }),

    permissionDenied: () =>
      createCustomToast({
        title: "GPS Permission Denied",
        description:
          "Route tracking has been disabled. You can still view routes without GPS tracking.",
        type: "error",
        duration: 8000,
      }),

    unavailable: () =>
      createCustomToast({
        title: "GPS Unavailable",
        description:
          "Please check your location settings and ensure GPS is enabled on your device.",
        type: "warning",
        duration: 8000,
      }),

    destinationReached: () =>
      createCustomToast({
        title: "🎉 Destination Reached!",
        description:
          "Congratulations! You've arrived safely at your destination.",
        type: "success",
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        duration: 10000,
      }),
  },

  route: {
    saved: (hasGps: boolean = false) =>
      createCustomToast({
        title: "Route Saved Successfully",
        description: hasGps
          ? "Your route has been saved and GPS tracking is ready to start."
          : "Your route has been saved. You can view it in 'My Routes' or use it for planning.",
        type: "route",
        duration: 6000,
      }),

    planningStarted: () =>
      createCustomToast({
        title: "Finding Best Route",
        description:
          "Analyzing current conditions and finding the safest path for you...",
        type: "route",
        duration: 4000,
      }),

    destinationsCleared: () =>
      createCustomToast({
        title: "Destinations Cleared",
        description: "All route markers and saved locations have been removed.",
        type: "info",
        duration: 4000,
      }),
  },

  reports: {
    submitted: (reportId?: number) =>
      createCustomToast({
        title: "Report Submitted Successfully!",
        description: `Your report has been recorded for admin review and posted to the community forum.${
          reportId ? ` Report ID: #${reportId}.` : ""
        } Thank you for helping keep our community safe!`,
        type: "success",
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        duration: 8000,
      }),

    failed: () =>
      createCustomToast({
        title: "Report Submission Failed",
        description: "Please try again or check your internet connection.",
        type: "error",
        duration: 6000,
      }),

    postDeleted: () =>
      createCustomToast({
        title: "Post Deleted Successfully",
        description:
          "The forum post and all associated comments and likes have been removed.",
        type: "success",
        icon: <CheckCircle className="h-5 w-5 text-green-600" />,
        duration: 6000,
      }),

    notFound: () =>
      createCustomToast({
        title: "Post Not Found",
        description:
          "The post you're trying to delete may have already been removed.",
        type: "warning",
        duration: 5000,
      }),
  },

  safety: {
    floodWarning: (location: string) =>
      createCustomToast({
        title: "⚠️ Flood Warning",
        description: `High flood risk detected near ${location}. Consider alternative routes.`,
        type: "safety",
        duration: 10000,
      }),

    roadClosed: (location: string) =>
      createCustomToast({
        title: "🚧 Road Closure",
        description: `Road closure reported at ${location}. Route will be recalculated.`,
        type: "warning",
        duration: 8000,
      }),
  },

  network: {
    offline: () =>
      createCustomToast({
        title: "Connection Lost",
        description: "You're currently offline. Some features may be limited.",
        type: "network",
        icon: <WifiOff className="h-5 w-5 text-gray-600" />,
        duration: 8000,
      }),

    restored: () =>
      createCustomToast({
        title: "Connection Restored",
        description: "You're back online! All features are now available.",
        type: "success",
        icon: <Wifi className="h-5 w-5 text-green-600" />,
        duration: 4000,
      }),

    error: (message: string) =>
      createCustomToast({
        title: "Network Error",
        description: message,
        type: "error",
        duration: 6000,
      }),
  },

  auth: {
    loginRequired: () =>
      createCustomToast({
        title: "Login Required",
        description: "Please log in to access this feature.",
        type: "warning",
        duration: 6000,
      }),

    unauthorized: () =>
      createCustomToast({
        title: "Access Denied",
        description: "You don't have permission to perform this action.",
        type: "error",
        duration: 6000,
      }),

    accessDenied: () =>
      createCustomToast({
        title: "Access Denied",
        description:
          "You don't have administrative privileges to perform this action.",
        type: "error",
        duration: 6000,
      }),
  },

  // Custom notification with full control
  custom: createCustomToast,
};

// Legacy support - for gradual migration
export const showNotification = notification.custom;
export const showAlert = notification.info;
export const showError = notification.error;
export const showSuccess = notification.success;
export const showWarning = notification.warning;
