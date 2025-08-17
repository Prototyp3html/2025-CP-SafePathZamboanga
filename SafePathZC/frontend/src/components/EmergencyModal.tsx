
interface EmergencyModalProps {
  onClose: () => void;
}

export const EmergencyModal = ({ onClose }: EmergencyModalProps) => {
  const emergencyContacts = [
    {
      name: 'Zamboanga Emergency Hotline',
      number: '911',
      type: 'emergency',
      icon: 'fas fa-ambulance',
      color: 'text-red-600'
    },
    {
      name: 'Police Emergency',
      number: '117',
      type: 'police',
      icon: 'fas fa-shield-alt',
      color: 'text-blue-600'
    },
    {
      name: 'Fire Department',
      number: '116',
      type: 'fire',
      icon: 'fas fa-fire',
      color: 'text-orange-600'
    },
    {
      name: 'NDRRMC Zamboanga',
      number: '(062) 991-2041',
      type: 'disaster',
      icon: 'fas fa-life-ring',
      color: 'text-green-600'
    },
    {
      name: 'Coast Guard',
      number: '(062) 991-2738',
      type: 'marine',
      icon: 'fas fa-anchor',
      color: 'text-blue-800'
    },
    {
      name: 'Medical Emergency',
      number: '(062) 991-2222',
      type: 'medical',
      icon: 'fas fa-user-md',
      color: 'text-red-500'
    }
  ];

  const handleCall = (number: string, name: string) => {
    console.log(`Calling ${name} at ${number}`);
    // In a real app, this would initiate a phone call
    window.open(`tel:${number}`, '_self');
  };

  const handleCopy = (number: string) => {
    navigator.clipboard.writeText(number);
    console.log('Number copied to clipboard:', number);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-scale-in max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="bg-alert-red text-white p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center">
              <i className="fas fa-phone mr-2 animate-pulse"></i>
              Emergency Contacts
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
        <div className="p-4">
          {/* Emergency Notice */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <div className="flex items-center">
              <i className="fas fa-exclamation-triangle text-red-500 mr-2"></i>
              <p className="text-sm text-red-700">
                <strong>In case of life-threatening emergency, call 911 immediately!</strong>
              </p>
            </div>
          </div>

          {/* Emergency Contacts List */}
          <div className="space-y-3">
            {emergencyContacts.map((contact, index) => (
              <div
                key={index}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <div className={`text-2xl ${contact.color}`}>
                      <i className={contact.icon}></i>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 text-sm">{contact.name}</h4>
                      <p className="text-lg font-bold text-gray-900">{contact.number}</p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleCall(contact.number, contact.name)}
                      className="bg-green-500 text-white p-2 rounded-full hover:bg-green-600 transition-colors duration-200 active:scale-95"
                      title="Call Now"
                    >
                      <i className="fas fa-phone text-sm"></i>
                    </button>
                    <button
                      onClick={() => handleCopy(contact.number)}
                      className="bg-gray-500 text-white p-2 rounded-full hover:bg-gray-600 transition-colors duration-200 active:scale-95"
                      title="Copy Number"
                    >
                      <i className="fas fa-copy text-sm"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Information */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h4 className="font-semibold text-blue-800 mb-2 text-sm">Important Notes:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li>• Save these numbers in your phone for quick access</li>
              <li>• Provide clear location details when calling</li>
              <li>• Stay calm and speak clearly</li>
              <li>• Keep your phone charged during emergencies</li>
            </ul>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full mt-4 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg font-medium hover:bg-gray-300 transition-colors duration-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};