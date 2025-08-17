
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

interface AlertSettingsModalProps {
  onClose: () => void;
}

export const AlertSettingsModal = ({ onClose }: AlertSettingsModalProps) => {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    smsAlerts: false,
    highPriorityOnly: false,
    locationBasedAlerts: true,
    weatherUpdates: true,
    trafficAlerts: true,
    floodWarnings: true,
    soundEnabled: true,
    vibrationEnabled: true
  });

  const { toast } = useToast();

  const handleSettingChange = (key: string, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    console.log(`Alert setting changed: ${key} = ${value}`);
  };

  const handleSaveSettings = () => {
    // Simulate saving to backend
    console.log('Saving alert settings:', settings);

    toast({
      title: "Settings Saved",
      description: "Your notification preferences have been updated.",
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="bg-wmsu-blue text-white p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center">
              <i className="fas fa-bell mr-2"></i>
              Notification Settings
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Notification Methods */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">Notification Methods</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Email Notifications</label>
                <Switch
                  checked={settings.emailNotifications}
                  onCheckedChange={(checked) => handleSettingChange('emailNotifications', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Push Notifications</label>
                <Switch
                  checked={settings.pushNotifications}
                  onCheckedChange={(checked) => handleSettingChange('pushNotifications', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">SMS Alerts</label>
                <Switch
                  checked={settings.smsAlerts}
                  onCheckedChange={(checked) => handleSettingChange('smsAlerts', checked)}
                />
              </div>
            </div>
          </div>

          {/* Alert Types */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">Alert Types</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">High Priority Only</label>
                <Switch
                  checked={settings.highPriorityOnly}
                  onCheckedChange={(checked) => handleSettingChange('highPriorityOnly', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Location-Based Alerts</label>
                <Switch
                  checked={settings.locationBasedAlerts}
                  onCheckedChange={(checked) => handleSettingChange('locationBasedAlerts', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Weather Updates</label>
                <Switch
                  checked={settings.weatherUpdates}
                  onCheckedChange={(checked) => handleSettingChange('weatherUpdates', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Traffic Alerts</label>
                <Switch
                  checked={settings.trafficAlerts}
                  onCheckedChange={(checked) => handleSettingChange('trafficAlerts', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Flood Warnings</label>
                <Switch
                  checked={settings.floodWarnings}
                  onCheckedChange={(checked) => handleSettingChange('floodWarnings', checked)}
                />
              </div>
            </div>
          </div>

          {/* Sound & Vibration */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">Sound & Vibration</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Sound Enabled</label>
                <Switch
                  checked={settings.soundEnabled}
                  onCheckedChange={(checked) => handleSettingChange('soundEnabled', checked)}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Vibration Enabled</label>
                <Switch
                  checked={settings.vibrationEnabled}
                  onCheckedChange={(checked) => handleSettingChange('vibrationEnabled', checked)}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <Button
              onClick={handleSaveSettings}
              className="flex-1 bg-wmsu-blue text-white hover:bg-wmsu-blue-light"
            >
              Save Settings
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};