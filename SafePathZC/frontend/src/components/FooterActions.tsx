
interface FooterActionsProps {
  onModalOpen: (modal: 'route' | 'report' | 'emergency') => void;
}

export const FooterActions = ({ onModalOpen }: FooterActionsProps) => {
  const actions = [
    {
      id: 'route',
      icon: 'fas fa-compass',
      label: 'Plan Route',
      color: 'bg-wmsu-blue hover:bg-wmsu-blue-light'
    },
    {
      id: 'report',
      icon: 'fas fa-comment-alt',
      label: 'Report Issue',
      color: 'bg-wmsu-blue hover:bg-wmsu-blue-light'
    },
    {
      id: 'emergency',
      icon: 'fas fa-phone',
      label: 'Emergency',
      color: 'bg-alert-red hover:bg-red-600'
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex justify-center space-x-8 md:space-x-12">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onModalOpen(action.id as 'route' | 'report' | 'emergency')}
              className={`flex flex-col items-center space-y-2 ${action.color} text-white rounded-full w-20 h-20 justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg`}
            >
              <i className={`${action.icon} text-2xl`}></i>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};