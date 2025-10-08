import React, { useState, useEffect } from 'react';
import { NavigationBar } from '../components/NavigationBar';
import { useToast } from "@/hooks/use-toast";

const AdminSettings = () => {
  const [adminUser, setAdminUser] = useState<any>(null);
  const { toast } = useToast();

  const [adminSettings, setAdminSettings] = useState({
    systemMaintenance: false,
    userRegistration: true,
    publicReports: true,
    emailNotifications: true,
    smsAlerts: false,
    dataRetentionDays: 365,
    maxReportsPerUser: 10,
    autoApproveReports: false,
  });

  const [securitySettings, setSecuritySettings] = useState({
    requireEmailVerification: true,
    enableTwoFactor: false,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    passwordMinLength: 8,
  });

  // Load admin data
  useEffect(() => {
    const adminData = localStorage.getItem('admin_data') || localStorage.getItem('user_data');
    if (adminData) {
      const parsedAdmin = JSON.parse(adminData);
      if (parsedAdmin.userType === 'admin' || parsedAdmin.role === 'admin') {
        setAdminUser(parsedAdmin);
      }
    }
  }, []);

  const handleAdminSettingChange = (key: string, value: any) => {
    setAdminSettings(prev => ({ ...prev, [key]: value }));
    toast({
      title: "Setting updated",
      description: `${key} has been ${typeof value === 'boolean' ? (value ? 'enabled' : 'disabled') : 'updated'}.`,
    });
  };

  const handleSecuritySettingChange = (key: string, value: any) => {
    setSecuritySettings(prev => ({ ...prev, [key]: value }));
    toast({
      title: "Security setting updated",
      description: `${key} has been updated.`,
    });
  };

  const handleSaveAllSettings = async () => {
    try {
      // Here you would save to backend
      const token = localStorage.getItem('admin_token') || localStorage.getItem('user_token');
      if (token) {
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";
        // For now, just simulate the save
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      toast({
        title: "Settings saved",
        description: "All admin settings have been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_data');
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_data');
    window.location.href = '/';
  };

  return (
    <>
      <NavigationBar />
      <div className="min-h-screen bg-gray-50 pt-20">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Settings</h1>
            <p className="text-gray-600">Configure system settings and security options</p>
            <div className="mt-4">
              <span className="text-sm text-gray-500">Logged in as: {adminUser?.name || 'Administrator'} ({adminUser?.email})</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* System Settings */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">System Settings</h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">System Maintenance Mode</h3>
                    <p className="text-sm text-gray-500">Temporarily disable user access</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminSettings.systemMaintenance}
                      onChange={(e) => handleAdminSettingChange('systemMaintenance', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">User Registration</h3>
                    <p className="text-sm text-gray-500">Allow new user registrations</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminSettings.userRegistration}
                      onChange={(e) => handleAdminSettingChange('userRegistration', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Public Reports</h3>
                    <p className="text-sm text-gray-500">Allow anonymous safety reports</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminSettings.publicReports}
                      onChange={(e) => handleAdminSettingChange('publicReports', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Data Retention (Days)</label>
                  <input
                    type="number"
                    value={adminSettings.dataRetentionDays}
                    onChange={(e) => handleAdminSettingChange('dataRetentionDays', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="3650"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Reports Per User</label>
                  <input
                    type="number"
                    value={adminSettings.maxReportsPerUser}
                    onChange={(e) => handleAdminSettingChange('maxReportsPerUser', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="100"
                  />
                </div>
              </div>
            </div>

            {/* Security Settings */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Security Settings</h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Email Verification</h3>
                    <p className="text-sm text-gray-500">Require email verification for new accounts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={securitySettings.requireEmailVerification}
                      onChange={(e) => handleSecuritySettingChange('requireEmailVerification', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-500">Require 2FA for all admin accounts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={securitySettings.enableTwoFactor}
                      onChange={(e) => handleSecuritySettingChange('enableTwoFactor', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Session Timeout (Minutes)</label>
                  <input
                    type="number"
                    value={securitySettings.sessionTimeout}
                    onChange={(e) => handleSecuritySettingChange('sessionTimeout', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="5"
                    max="1440"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Max Login Attempts</label>
                  <input
                    type="number"
                    value={securitySettings.maxLoginAttempts}
                    onChange={(e) => handleSecuritySettingChange('maxLoginAttempts', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="3"
                    max="20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Password Length</label>
                  <input
                    type="number"
                    value={securitySettings.passwordMinLength}
                    onChange={(e) => handleSecuritySettingChange('passwordMinLength', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="6"
                    max="50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex justify-between items-center bg-white rounded-lg shadow-md p-6">
            <div>
              <h3 className="font-semibold text-gray-900">Save Admin Settings</h3>
              <p className="text-sm text-gray-600">Apply all changes to the system configuration</p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={handleLogout}
                className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
              <button
                onClick={handleSaveAllSettings}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save All Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminSettings;