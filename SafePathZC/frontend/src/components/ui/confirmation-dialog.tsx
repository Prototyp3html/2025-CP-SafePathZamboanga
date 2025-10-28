import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, Info, X } from "lucide-react";

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: (confirmed: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive" | "success" | "warning";
  icon?: React.ReactNode;
}

const variantStyles = {
  default: {
    icon: <Info className="h-8 w-8 text-blue-600" />,
    titleClass: "text-gray-900",
    confirmButtonClass:
      "bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 hover:from-blue-700 hover:via-blue-800 hover:to-blue-900 text-white",
  },
  destructive: {
    icon: <AlertTriangle className="h-8 w-8 text-red-600" />,
    titleClass: "text-red-900",
    confirmButtonClass:
      "bg-gradient-to-r from-red-600 via-red-700 to-red-800 hover:from-red-700 hover:via-red-800 hover:to-red-900 text-white",
  },
  success: {
    icon: <CheckCircle className="h-8 w-8 text-green-600" />,
    titleClass: "text-green-900",
    confirmButtonClass:
      "bg-gradient-to-r from-green-600 via-green-700 to-green-800 hover:from-green-700 hover:via-green-800 hover:to-green-900 text-white",
  },
  warning: {
    icon: <AlertTriangle className="h-8 w-8 text-orange-600" />,
    titleClass: "text-orange-900",
    confirmButtonClass:
      "bg-gradient-to-r from-orange-600 via-orange-700 to-orange-800 hover:from-orange-700 hover:via-orange-800 hover:to-orange-900 text-white",
  },
};

export function ConfirmationDialog({
  isOpen,
  onClose,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  icon,
}: ConfirmationDialogProps) {
  const variantStyle = variantStyles[variant];

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose(false)}>
      <AlertDialogContent className="sm:max-w-[520px] max-w-[95vw] p-0 bg-white rounded-3xl shadow-2xl border-0 overflow-hidden backdrop-blur-sm">
        {/* Header Section with Icon and Title */}
        <div className="p-8 pb-6">
          <AlertDialogHeader className="space-y-6">
            <div className="flex items-start gap-5">
              {/* Enhanced Icon Container */}
              <div
                className={`flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
                  variant === "destructive"
                    ? "bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200"
                    : variant === "success"
                    ? "bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200"
                    : variant === "warning"
                    ? "bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200"
                    : "bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200"
                }`}
              >
                {icon || variantStyle.icon}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <AlertDialogTitle
                  className={`text-2xl font-bold leading-tight ${variantStyle.titleClass}`}
                >
                  {title}
                </AlertDialogTitle>
              </div>
            </div>

            {/* Description */}
            <AlertDialogDescription className="text-gray-600 text-lg leading-relaxed font-medium pl-0">
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        {/* Footer Section with Actions */}
        <div className="px-8 pb-8">
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row gap-4">
            {/* Cancel Button */}
            <AlertDialogCancel
              onClick={() => onClose(false)}
              className="flex-1 sm:flex-none bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-700 hover:text-gray-800 border-2 border-gray-200 hover:border-gray-300 px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {cancelText}
            </AlertDialogCancel>

            {/* Confirm Button */}
            <AlertDialogAction
              onClick={() => onClose(true)}
              className={`flex-1 sm:flex-none px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] border-2 border-transparent hover:border-white/20 ${variantStyle.confirmButtonClass}`}
            >
              {confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Context for confirmation dialogs
const ConfirmationContext = React.createContext<{
  confirm: (options: {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive" | "success" | "warning";
    icon?: React.ReactNode;
  }) => Promise<boolean>;
} | null>(null);

// Provider component
export function ConfirmationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [dialog, setDialog] = React.useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "destructive" | "success" | "warning";
    icon?: React.ReactNode;
    resolve?: (confirmed: boolean) => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
  });

  const confirm = React.useCallback(
    (options: {
      title: string;
      description: string;
      confirmText?: string;
      cancelText?: string;
      variant?: "default" | "destructive" | "success" | "warning";
      icon?: React.ReactNode;
    }): Promise<boolean> => {
      return new Promise((resolve) => {
        setDialog({
          ...options,
          isOpen: true,
          resolve,
        });
      });
    },
    []
  );

  const handleClose = React.useCallback(
    (confirmed: boolean) => {
      setDialog((prev) => ({
        ...prev,
        isOpen: false,
      }));
      dialog.resolve?.(confirmed);
    },
    [dialog.resolve]
  );

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <ConfirmationDialog
        isOpen={dialog.isOpen}
        onClose={handleClose}
        title={dialog.title}
        description={dialog.description}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        variant={dialog.variant}
        icon={dialog.icon}
      />
    </ConfirmationContext.Provider>
  );
}

// Hook for using confirmation dialogs
export function useConfirmation() {
  const context = React.useContext(ConfirmationContext);
  if (!context) {
    throw new Error(
      "useConfirmation must be used within a ConfirmationProvider"
    );
  }
  return context;
}
