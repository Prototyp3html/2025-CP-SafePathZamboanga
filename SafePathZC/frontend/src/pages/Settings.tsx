import { useState, useEffect } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usePreferences } from "../contexts/PreferencesContext";
import AdminSettings from "./AdminSettings";

const Settings = () => {
  const [activeTab, setActiveTab] = useState("profile");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const { toast } = useToast();
  const { preferences, updatePreference, savePreferences, isLoading } =
    usePreferences();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [profile, setProfile] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    emergencyContact: "",
  });

  const [security, setSecurity] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    twoFactorEnabled: false,
  });

  // Load user data if logged in
  useEffect(() => {
    const userData = localStorage.getItem("user_data");
    const adminData = localStorage.getItem("admin_data");

    // Check for admin user first
    if (adminData) {
      const parsedAdmin = JSON.parse(adminData);
      if (parsedAdmin.userType === "admin" || parsedAdmin.role === "admin") {
        setIsAdmin(true);
        return; // Admin detected, stop here
      }
    }

    // Check for regular user
    if (userData) {
      const parsedUser = JSON.parse(userData);

      // Check if this user is actually an admin
      if (parsedUser.userType === "admin" || parsedUser.role === "admin") {
        setIsAdmin(true);
        return;
      }

      setUser(parsedUser);
      setProfile({
        name: parsedUser.name || "",
        email: parsedUser.email || "",
        phone: parsedUser.phone || "",
        address: parsedUser.location || "",
        emergencyContact: parsedUser.emergencyContact || "",
      });

      // Load profile picture - prioritize email as consistent key
      const userKey = parsedUser.email; // Use email as primary key for consistency
      const userProfilePicture = localStorage.getItem(
        `user_profile_picture_${userKey}`
      );
      
      if (userProfilePicture) {
        setProfilePicture(userProfilePicture);
      } else if (parsedUser.profilePicture) {
        // If found in user data but not in user-specific key, migrate it
        setProfilePicture(parsedUser.profilePicture);
        localStorage.setItem(
          `user_profile_picture_${userKey}`,
          parsedUser.profilePicture
        );
      }

      // Load 2FA status
      if (parsedUser.twoFactorEnabled !== undefined) {
        setSecurity((prev) => ({
          ...prev,
          twoFactorEnabled: parsedUser.twoFactorEnabled,
        }));
      }
    }
  }, []);

  const handleProfilePictureUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please select an image smaller than 5MB.",
          variant: "destructive",
        });
        return;
      }

      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const imageDataUrl = e.target?.result as string;
          setProfilePicture(imageDataUrl);

          // Save to user-specific localStorage key using email for consistency
          if (user) {
            const userKey = user.email; // Always use email as key for consistency
            localStorage.setItem(
              `user_profile_picture_${userKey}`,
              imageDataUrl
            );

            // Update user data
            const updatedUser = { ...user, profilePicture: imageDataUrl };
            localStorage.setItem("user_data", JSON.stringify(updatedUser));
            setUser(updatedUser);

            console.log(`✅ Profile picture saved to localStorage with key: user_profile_picture_${userKey}`);
          }

          // Try to save to backend
          const token = localStorage.getItem("user_token");
          if (token) {
            try {
              const BACKEND_URL =
                import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
              const response = await fetch(
                `${BACKEND_URL}/auth/profile-picture`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({ profilePicture: imageDataUrl }),
                }
              );

              if (response.ok) {
                console.log("✅ Profile picture saved to backend");
              } else {
                console.warn("⚠️ Failed to save profile picture to backend");
              }
            } catch (error) {
              console.warn("⚠️ Backend not available, saved locally only");
            }
          }

          toast({
            title: "Profile picture updated",
            description: "Your profile picture has been updated successfully.",
          });
        };
        reader.readAsDataURL(file);
      } catch (error) {
        toast({
          title: "Error uploading picture",
          description: "Failed to process the image. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  const handleRemoveProfilePicture = async () => {
    setProfilePicture(null);

    // Remove from user-specific localStorage using email as key
    if (user) {
      const userKey = user.email; // Always use email as key for consistency
      localStorage.removeItem(`user_profile_picture_${userKey}`);

      // Update user data
      const updatedUser = { ...user };
      delete updatedUser.profilePicture;
      localStorage.setItem("user_data", JSON.stringify(updatedUser));
      setUser(updatedUser);

      console.log(`✅ Profile picture removed from localStorage key: user_profile_picture_${userKey}`);
    }

    // Try to remove from backend
    const token = localStorage.getItem("user_token");
    if (token) {
      try {
        const BACKEND_URL =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
        const response = await fetch(`${BACKEND_URL}/auth/profile-picture`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          console.log("✅ Profile picture removed from backend");
        } else {
          console.warn("⚠️ Failed to remove profile picture from backend");
        }
      } catch (error) {
        console.warn("⚠️ Backend not available, removed locally only");
      }
    }

    toast({
      title: "Profile picture removed",
      description: "Your profile picture has been removed.",
    });
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      // Save profile data to backend if user is logged in
      const token = localStorage.getItem("user_token");
      if (token) {
        const BACKEND_URL =
          import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

        // Map frontend profile fields to backend expected fields
        const backendProfile = {
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          location: profile.address, // address maps to location in backend
          emergencyContact: profile.emergencyContact,
        };

        const response = await fetch(`${BACKEND_URL}/auth/profile`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(backendProfile),
        });

        if (!response.ok) {
          throw new Error("Failed to save profile to backend");
        }
      }

      // Update local storage
      if (user) {
        const updatedUser = {
          ...user,
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          location: profile.address,
          emergencyContact: profile.emergencyContact,
        };
        localStorage.setItem("user_data", JSON.stringify(updatedUser));
        setUser(updatedUser);
      }

      toast({
        title: "✅ Profile saved successfully!",
        description: "Your profile has been updated and saved to the server.",
        duration: 4000,
      });

      // Show success state briefly
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "❌ Error saving profile",
        description:
          "Changes saved locally. Please check your connection and try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllSettings = async () => {
    setIsSaving(true);
    try {
      await savePreferences();
      await handleSaveProfile();
      toast({
        title: "🎉 All settings saved successfully!",
        description:
          "Your profile, preferences, and notifications have been updated.",
        duration: 4000,
      });
    } catch (error) {
      toast({
        title: "⚠️ Error saving some settings",
        description: "Some changes may not have been saved. Please try again.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    updatePreference(key as any, value);
    toast({
      title: "Notification settings updated",
      description: `${key} has been ${value ? "enabled" : "disabled"}.`,
    });
  };

  const handleProfileChange = (key: string, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handlePreferenceChange = (key: string, value: any) => {
    updatePreference(key as any, value);
    
    // Special handling for theme changes
    if (key === "theme") {
      toast({
        title: "Theme updated",
        description: `Switched to ${value} mode. ${value === "auto" ? "Following system preferences." : ""}`,
      });
    } else {
      toast({
        title: "Preferences updated",
        description: "Your preferences have been saved.",
      });
    }
  };

  const handleSecurityChange = (key: string, value: string) => {
    setSecurity((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpdatePassword = async () => {
    if (
      !security.currentPassword ||
      !security.newPassword ||
      !security.confirmPassword
    ) {
      toast({
        title: "Error",
        description: "Please fill in all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (security.newPassword !== security.confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (security.newPassword.length < 6) {
      toast({
        title: "Error",
        description: "New password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    const token = localStorage.getItem("user_token");
    if (!token) {
      toast({
        title: "Authentication required",
        description: "Please log in to change your password.",
        variant: "destructive",
      });
      return;
    }

    try {
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
      const response = await fetch(`${BACKEND_URL}/auth/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: security.currentPassword,
          newPassword: security.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSecurity((prev) => ({
          ...prev,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));

        toast({
          title: "Password updated",
          description: "Your password has been updated successfully.",
        });
      } else {
        toast({
          title: "Error",
          description:
            data.detail ||
            "Failed to update password. Please check your current password.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error updating password:", error);
      toast({
        title: "Error",
        description: "Unable to update password. Please try again later.",
        variant: "destructive",
      });
    }
  };

  const handleEnableTwoFactor = async () => {
    const token = localStorage.getItem("user_token");
    if (!token) {
      toast({
        title: "Authentication required",
        description: "Please log in to enable two-factor authentication.",
        variant: "destructive",
      });
      return;
    }

    try {
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

      if (security.twoFactorEnabled) {
        // Disable 2FA
        const response = await fetch(`${BACKEND_URL}/auth/disable-2fa`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          setSecurity((prev) => ({ ...prev, twoFactorEnabled: false }));
          toast({
            title: "Two-factor authentication disabled",
            description: "2FA has been disabled for your account.",
          });
        } else {
          const data = await response.json();
          toast({
            title: "Error",
            description: data.detail || "Failed to disable 2FA.",
            variant: "destructive",
          });
        }
      } else {
        // Enable 2FA
        const phoneNumber = prompt(
          "Enter your phone number for SMS verification:"
        );
        if (!phoneNumber) return;

        const response = await fetch(`${BACKEND_URL}/auth/enable-2fa`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ phoneNumber }),
        });

        if (response.ok) {
          const verificationCode = prompt(
            "Enter the verification code sent to your phone:"
          );
          if (!verificationCode) return;

          const verifyResponse = await fetch(`${BACKEND_URL}/auth/verify-2fa`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ code: verificationCode }),
          });

          if (verifyResponse.ok) {
            setSecurity((prev) => ({ ...prev, twoFactorEnabled: true }));
            toast({
              title: "Two-factor authentication enabled",
              description: "Your account is now more secure with 2FA.",
            });
          } else {
            toast({
              title: "Verification failed",
              description: "Invalid verification code. Please try again.",
              variant: "destructive",
            });
          }
        } else {
          const data = await response.json();
          toast({
            title: "Error",
            description: data.detail || "Failed to enable 2FA.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error with 2FA:", error);
      toast({
        title: "Error",
        description: "Unable to update 2FA settings. Please try again later.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    // Show confirmation dialog
    const confirmMessage = `Are you sure you want to delete your account? This action cannot be undone.

All your data including:
• Profile information
• Route history  
• Community reports
• Preferences and settings

Will be permanently deleted.

Type "DELETE" to confirm:`;

    const userInput = prompt(confirmMessage);

    if (userInput !== "DELETE") {
      if (userInput !== null) {
        // User didn't cancel
        toast({
          title: "Account deletion cancelled",
          description:
            "You must type 'DELETE' exactly to confirm account deletion.",
          variant: "destructive",
        });
      }
      return;
    }

    const token = localStorage.getItem("user_token");
    if (!token) {
      toast({
        title: "Authentication required",
        description: "Please log in to delete your account.",
        variant: "destructive",
      });
      return;
    }

    try {
      const BACKEND_URL =
        import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
      const response = await fetch(`${BACKEND_URL}/auth/delete-account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        // Clear all user-specific local storage items
        if (user) {
          const userKey = user.id || user.email;
          localStorage.removeItem(`user_profile_picture_${userKey}`);
        }
        localStorage.removeItem("user_token");
        localStorage.removeItem("user_data");
        localStorage.removeItem("user_profile_picture");
        localStorage.removeItem("user_preferences");
        localStorage.removeItem("admin_token");
        localStorage.removeItem("admin_data");

        toast({
          title: "Account deleted",
          description: "Your account has been permanently deleted.",
        });

        // Redirect to home page after a delay
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      } else {
        const data = await response.json();
        toast({
          title: "Error deleting account",
          description:
            data.detail || "Failed to delete account. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      toast({
        title: "Error",
        description: "Unable to delete account. Please try again later.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* If user is admin, show AdminSettings component */}
      {isAdmin ? (
        <AdminSettings />
      ) : user ? (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <NavigationBar />

          <main className="pt-20 container mx-auto px-4 py-8 max-w-4xl">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-wmsu-blue dark:text-blue-400 mb-2">
                Settings
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage your account, preferences, and notifications
              </p>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-4 mb-8">
                <TabsTrigger value="profile" className="text-base">
                  Profile
                </TabsTrigger>
                <TabsTrigger value="notifications" className="text-base">
                  Notifications
                </TabsTrigger>
                <TabsTrigger value="preferences" className="text-base">
                  Preferences
                </TabsTrigger>
                <TabsTrigger value="security" className="text-base">
                  Security
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-6">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-user mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Personal Information
                    </CardTitle>
                    <CardDescription>
                      Update your personal details and contact information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          value={profile.name}
                          onChange={(e) =>
                            handleProfileChange("name", e.target.value)
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          value={profile.email}
                          onChange={(e) =>
                            handleProfileChange("email", e.target.value)
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          value={profile.phone}
                          onChange={(e) =>
                            handleProfileChange("phone", e.target.value)
                          }
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="emergency">Emergency Contact</Label>
                        <Input
                          id="emergency"
                          value={profile.emergencyContact}
                          onChange={(e) =>
                            handleProfileChange(
                              "emergencyContact",
                              e.target.value
                            )
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="address">Home Address</Label>
                      <Textarea
                        id="address"
                        value={profile.address}
                        onChange={(e) =>
                          handleProfileChange("address", e.target.value)
                        }
                        className="mt-1"
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => window.location.reload()}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveProfile}
                        disabled={isSaving}
                        className={
                          saveSuccess
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-blue-600 hover:bg-blue-700"
                        }
                      >
                        {isSaving ? (
                          <>
                            <svg
                              className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Saving...
                          </>
                        ) : saveSuccess ? (
                          <>✅ Saved!</>
                        ) : (
                          "Save Changes"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-camera mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Profile Picture
                    </CardTitle>
                    <CardDescription>
                      Update your profile picture
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-4">
                      <div className="w-20 h-20 bg-wmsu-blue rounded-full flex items-center justify-center overflow-hidden">
                        {profilePicture ? (
                          <img
                            src={profilePicture}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <i className="fas fa-user text-3xl text-white"></i>
                        )}
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfilePictureUpload}
                          className="hidden"
                          id="profile-picture-upload"
                        />
                        <Button
                          variant="outline"
                          className="mr-2"
                          onClick={() =>
                            document
                              .getElementById("profile-picture-upload")
                              ?.click()
                          }
                        >
                          <i className="fas fa-upload mr-2"></i>
                          Upload New Photo
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleRemoveProfilePicture}
                        >
                          <i className="fas fa-trash mr-2"></i>
                          Remove
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-6">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-bell mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Notification Preferences
                    </CardTitle>
                    <CardDescription>
                      Choose what notifications you want to receive
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="flood-alerts" className="font-medium">
                            Flood Alerts
                          </Label>
                          <p className="text-sm text-gray-500">
                            Get notified about flood warnings and road closures
                          </p>
                        </div>
                        <Switch
                          id="flood-alerts"
                          checked={preferences.floodAlerts}
                          onCheckedChange={(checked) =>
                            handleNotificationChange("floodAlerts", checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label
                            htmlFor="weather-updates"
                            className="font-medium"
                          >
                            Weather Updates
                          </Label>
                          <p className="text-sm text-gray-500">
                            Receive weather forecasts and severe weather
                            warnings
                          </p>
                        </div>
                        <Switch
                          id="weather-updates"
                          checked={preferences.weatherUpdates}
                          onCheckedChange={(checked) =>
                            handleNotificationChange("weatherUpdates", checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label
                            htmlFor="traffic-updates"
                            className="font-medium"
                          >
                            Traffic Updates
                          </Label>
                          <p className="text-sm text-gray-500">
                            Get alerts about traffic congestion and delays
                          </p>
                        </div>
                        <Switch
                          id="traffic-updates"
                          checked={preferences.trafficUpdates}
                          onCheckedChange={(checked) =>
                            handleNotificationChange("trafficUpdates", checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label
                            htmlFor="community-reports"
                            className="font-medium"
                          >
                            Community Reports
                          </Label>
                          <p className="text-sm text-gray-500">
                            Notifications about community-submitted road
                            conditions
                          </p>
                        </div>
                        <Switch
                          id="community-reports"
                          checked={preferences.communityReports}
                          onCheckedChange={(checked) =>
                            handleNotificationChange(
                              "communityReports",
                              checked
                            )
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label
                            htmlFor="emergency-alerts"
                            className="font-medium"
                          >
                            Emergency Alerts
                          </Label>
                          <p className="text-sm text-gray-500">
                            Critical emergency notifications and safety alerts
                          </p>
                        </div>
                        <Switch
                          id="emergency-alerts"
                          checked={preferences.emergencyAlerts}
                          onCheckedChange={(checked) =>
                            handleNotificationChange("emergencyAlerts", checked)
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <Label
                            htmlFor="route-reminders"
                            className="font-medium"
                          >
                            Route Reminders
                          </Label>
                          <p className="text-sm text-gray-500">
                            Reminders about your saved routes and travel times
                          </p>
                        </div>
                        <Switch
                          id="route-reminders"
                          checked={preferences.routeReminders}
                          onCheckedChange={(checked) =>
                            handleNotificationChange("routeReminders", checked)
                          }
                        />
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-3">Notification Methods</h4>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="email-notifications"
                            defaultChecked
                            className="rounded"
                          />
                          <Label htmlFor="email-notifications">
                            Email notifications ✅
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 opacity-50 cursor-not-allowed">
                          <input
                            type="checkbox"
                            id="sms-notifications"
                            className="rounded"
                            disabled
                            title="SMS notifications require Twilio/SMS service integration"
                          />
                          <Label htmlFor="sms-notifications" className="cursor-not-allowed">
                            SMS notifications 🚧 (Coming soon)
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="push-notifications"
                            defaultChecked
                            className="rounded"
                          />
                          <Label htmlFor="push-notifications">
                            Browser push notifications ✅
                          </Label>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-3 flex items-start gap-2">
                        <i className="fas fa-info-circle mt-0.5"></i>
                        <span>SMS notifications require SMS service integration (Twilio, Vonage, etc.). Currently, notifications are shown in-app and via browser.</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="preferences" className="space-y-6">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-cog mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      App Preferences
                    </CardTitle>
                    <CardDescription>
                      Customize your app experience
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="language">Language</Label>
                      <div className="mt-1 relative">
                        <Select
                          value={preferences.language}
                          onValueChange={(value) => {
                            handlePreferenceChange("language", value);
                            if (value !== "english") {
                              toast({
                                title: "🚧 Feature In Development",
                                description: "Language translations are being prepared. Currently only English is fully supported.",
                                variant: "default",
                                duration: 5000,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="english">English ✅</SelectItem>
                            <SelectItem value="filipino">Filipino 🚧</SelectItem>
                            <SelectItem value="chavacano">Chavacano 🚧</SelectItem>
                          </SelectContent>
                        </Select>
                        {preferences.language !== "english" && (
                          <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                            <i className="fas fa-info-circle"></i>
                            Translation in progress
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="units">Distance Units</Label>
                      <Select
                        value={preferences.units}
                        onValueChange={(value) =>
                          handlePreferenceChange("units", value)
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select units" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="metric">
                            Kilometers (km)
                          </SelectItem>
                          <SelectItem value="imperial">Miles (mi)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="theme">Theme</Label>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handlePreferenceChange("theme", "light")}
                          className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all ${
                            preferences.theme === "light"
                              ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <i className="fas fa-sun"></i>
                            <span>Light</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreferenceChange("theme", "dark")}
                          className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all ${
                            preferences.theme === "dark"
                              ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <i className="fas fa-moon"></i>
                            <span>Dark</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePreferenceChange("theme", "auto")}
                          className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all ${
                            preferences.theme === "auto"
                              ? "border-blue-600 bg-blue-50 text-blue-700 font-medium"
                              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <i className="fas fa-adjust"></i>
                            <span>Auto</span>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="map-style">Default Map Style</Label>
                      <Select
                        value={preferences.mapStyle}
                        onValueChange={(value) =>
                          handlePreferenceChange("mapStyle", value)
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select map style" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="satellite">Satellite</SelectItem>
                          <SelectItem value="terrain">Terrain</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-route mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Route Preferences
                    </CardTitle>
                    <CardDescription>
                      Set your default routing preferences
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="avoid-floods"
                          checked={preferences.avoidFloods}
                          onChange={(e) =>
                            handlePreferenceChange(
                              "avoidFloods",
                              e.target.checked
                            )
                          }
                          className="rounded"
                        />
                        <Label htmlFor="avoid-floods">
                          Avoid flood-prone areas
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="fastest-route"
                          checked={preferences.fastestRoute}
                          onChange={(e) =>
                            handlePreferenceChange(
                              "fastestRoute",
                              e.target.checked
                            )
                          }
                          className="rounded"
                        />
                        <Label htmlFor="fastest-route">
                          Prefer fastest route
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="avoid-tolls"
                          checked={preferences.avoidTolls}
                          onChange={(e) =>
                            handlePreferenceChange(
                              "avoidTolls",
                              e.target.checked
                            )
                          }
                          className="rounded"
                        />
                        <Label htmlFor="avoid-tolls">Avoid toll roads</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="main-roads"
                          checked={preferences.mainRoads}
                          onChange={(e) =>
                            handlePreferenceChange(
                              "mainRoads",
                              e.target.checked
                            )
                          }
                          className="rounded"
                        />
                        <Label htmlFor="main-roads">Prefer main roads</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="security" className="space-y-6">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-shield-alt mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Account Security
                    </CardTitle>
                    <CardDescription>
                      Manage your account security settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        placeholder="Enter current password"
                        value={security.currentPassword}
                        onChange={(e) =>
                          handleSecurityChange(
                            "currentPassword",
                            e.target.value
                          )
                        }
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="new-password">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="Enter new password"
                        value={security.newPassword}
                        onChange={(e) =>
                          handleSecurityChange("newPassword", e.target.value)
                        }
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="confirm-password">
                        Confirm New Password
                      </Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm new password"
                        value={security.confirmPassword}
                        onChange={(e) =>
                          handleSecurityChange(
                            "confirmPassword",
                            e.target.value
                          )
                        }
                        className="mt-1"
                      />
                    </div>

                    <Button
                      className="w-full md:w-auto"
                      onClick={handleUpdatePassword}
                    >
                      Update Password
                    </Button>
                  </CardContent>
                </Card>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-mobile-alt mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Two-Factor Authentication
                    </CardTitle>
                    <CardDescription>
                      Add an extra layer of security to your account
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">SMS Authentication</p>
                        <p className="text-sm text-gray-500">
                          Receive codes via SMS to your phone
                        </p>
                      </div>
                      <Button
                        variant={
                          security.twoFactorEnabled ? "default" : "outline"
                        }
                        onClick={handleEnableTwoFactor}
                        disabled={security.twoFactorEnabled}
                      >
                        {security.twoFactorEnabled ? "Enabled" : "Enable"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center dark:text-gray-100">
                      <i className="fas fa-history mr-2 text-wmsu-blue dark:text-blue-400"></i>
                      Login Activity
                    </CardTitle>
                    <CardDescription>
                      Recent login activity on your account
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b">
                        <div>
                          <p className="font-medium">Current Session</p>
                          <p className="text-sm text-gray-500">
                            Chrome on Windows • Zamboanga City, PH
                          </p>
                        </div>
                        <span className="text-green-600 text-sm">
                          Active now
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b">
                        <div>
                          <p className="font-medium">Mobile App</p>
                          <p className="text-sm text-gray-500">
                            Android Device • Zamboanga City, PH
                          </p>
                        </div>
                        <span className="text-gray-500 text-sm">
                          2 hours ago
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-red-200 dark:border-red-900 dark:bg-gray-800">
                  <CardHeader>
                    <CardTitle className="flex items-center text-red-600 dark:text-red-400">
                      <i className="fas fa-exclamation-triangle mr-2"></i>
                      Danger Zone
                    </CardTitle>
                    <CardDescription>Irreversible actions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Delete Account</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Permanently delete your account and all associated
                          data. This action cannot be undone.
                        </p>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteAccount}
                        >
                          Delete Account
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Global Save Button */}
            <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                    Save All Settings
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Save all your changes including preferences, notifications,
                    and profile.
                  </p>
                </div>
                <Button
                  onClick={handleSaveAllSettings}
                  disabled={isSaving || isLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSaving || isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    "Save All Changes"
                  )}
                </Button>
              </div>
            </div>
          </main>
        </div>
      ) : (
        // Show login prompt when no user is logged in
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <NavigationBar />
          <main className="pt-20 container mx-auto px-4 py-8 max-w-4xl">
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 max-w-md mx-auto">
                <i className="fas fa-user-circle text-gray-400 dark:text-gray-500 text-6xl mb-4"></i>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
                  Please Log In
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  You need to be logged in to access your settings.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Click the profile icon in the navigation bar to log in.
                </p>
              </div>
            </div>
          </main>
        </div>
      )}
    </>
  );
};

export default Settings;
