
import { useState } from 'react';

interface ReportModalProps {
  onClose: () => void;
}

export const ReportModal = ({ onClose }: ReportModalProps) => {
  const [reportType, setReportType] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('moderate');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reportTypes = [
    { id: 'flood', label: 'Flooding', icon: 'fas fa-water' },
    { id: 'roadblock', label: 'Road Blockage', icon: 'fas fa-road' },
    { id: 'damage', label: 'Road Damage', icon: 'fas fa-tools' },
    { id: 'weather', label: 'Weather Hazard', icon: 'fas fa-cloud-rain' },
    { id: 'other', label: 'Other Issue', icon: 'fas fa-exclamation-triangle' }
  ];

  const handleSubmit = async () => {
    if (!reportType || !location || !description) return;

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      console.log('Report submitted:', {
        type: reportType,
        location,
        description,
        severity,
        timestamp: new Date()
      });
      setIsSubmitting(false);
      onClose();
      // Show success message
    }, 1000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="bg-wmsu-blue text-white p-4 rounded-t-lg sticky top-0">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center">
              <i className="fas fa-comment-alt mr-2"></i>
              Report an Issue
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {/* Report Type Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              What type of issue are you reporting?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {reportTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setReportType(type.id)}
                  className={`p-3 border-2 rounded-lg text-left transition-all duration-200 ${
                    reportType === type.id
                      ? 'border-wmsu-blue bg-blue-50 text-wmsu-blue'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <i className={type.icon}></i>
                    <span className="text-sm font-medium">{type.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Location Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <i className="fas fa-map-marker-alt mr-1"></i>
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Veterans Avenue near City Hall"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none"
              required
            />
          </div>

          {/* Severity Level */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Severity Level
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none"
            >
              <option value="low">Low - Minor inconvenience</option>
              <option value="moderate">Moderate - Significant delay</option>
              <option value="high">High - Route impassable</option>
            </select>
          </div>

          {/* Description */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide details about the issue..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-wmsu-blue focus:border-transparent outline-none resize-none"
              required
            />
          </div>

          {/* Community Guidelines */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
            <h4 className="text-sm font-semibold text-blue-800 mb-1">Community Guidelines</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Provide accurate and specific location information</li>
              <li>• Include time-sensitive details if applicable</li>
              <li>• Be respectful and constructive in your reports</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!reportType || !location || !description || isSubmitting}
              className="flex-1 bg-wmsu-blue text-white py-2 px-4 rounded-lg font-medium hover:bg-wmsu-blue-light transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <i className="fas fa-spinner animate-spin mr-2"></i>
                  Submitting...
                </>
              ) : (
                <>
                  <i className="fas fa-paper-plane mr-2"></i>
                  Submit Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};