
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface AlertDetailsModalProps {
  alert: any;
  onClose: () => void;
}

export const AlertDetailsModal = ({ alert, onClose }: AlertDetailsModalProps) => {
  const { toast } = useToast();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-alert-red';
      case 'moderate': return 'bg-alert-orange';
      case 'low': return 'bg-caution-yellow';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityIcon = (type: string) => {
    switch (type) {
      case 'flood': return 'fas fa-water';
      case 'weather': return 'fas fa-cloud-rain';
      case 'traffic': return 'fas fa-car';
      default: return 'fas fa-bell';
    }
  };

  const handlePlanRoute = () => {
    toast({
      title: "Route Planning",
      description: "Opening route planner with current conditions...",
    });
    onClose();
    console.log('Planning route around alert:', alert.id);
  };

  const handleReportUpdate = () => {
    toast({
      title: "Report Submitted",
      description: "Thank you for reporting the current status.",
    });
    console.log('Reporting update for alert:', alert.id);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className={`${getSeverityColor(alert.severity)} text-white p-4 rounded-t-lg`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg flex items-center">
              <i className={`${getSeverityIcon(alert.type)} mr-2`}></i>
              Alert Details
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors duration-200"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xl font-bold text-gray-800">{alert.title}</h4>
              <Badge className={`${getSeverityColor(alert.severity)} text-white`}>
                {alert.severity} priority
              </Badge>
            </div>
            <p className="text-gray-600 text-sm mb-2">
              <i className="fas fa-map-marker-alt mr-1"></i>
              {alert.location}
            </p>
            <p className="text-gray-600 text-sm">
              <i className="fas fa-clock mr-1"></i>
              Issued {alert.timeIssued} • Duration: {alert.estimatedDuration}
            </p>
          </div>

          <div className="mb-6">
            <h5 className="font-semibold text-gray-800 mb-2">Description</h5>
            <p className="text-gray-700">{alert.description}</p>
          </div>

          {alert.affectedRoutes && (
            <div className="mb-6">
              <h5 className="font-semibold text-gray-800 mb-2">Affected Routes</h5>
              <div className="flex flex-wrap gap-2">
                {alert.affectedRoutes.map((route: string, index: number) => (
                  <Badge key={index} variant="outline">
                    {route}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <h5 className="font-semibold text-gray-800 mb-2">Safety Recommendations</h5>
            <ul className="text-sm text-gray-700 space-y-1">
              <li className="flex items-start">
                <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5"></i>
                Use alternative routes when possible
              </li>
              <li className="flex items-start">
                <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5"></i>
                Allow extra travel time
              </li>
              <li className="flex items-start">
                <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5"></i>
                Monitor weather conditions regularly
              </li>
              <li className="flex items-start">
                <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5"></i>
                Report any changes in road conditions
              </li>
            </ul>
          </div>

          {alert.impact && (
            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <h5 className="font-semibold text-gray-800 mb-2">Expected Impact</h5>
              <p className="text-gray-700 text-sm">{alert.impact}</p>
            </div>
          )}

          <div className="flex space-x-3">
            <Button
              onClick={handlePlanRoute}
              className="flex-1 bg-wmsu-blue text-white hover:bg-wmsu-blue-light"
            >
              <i className="fas fa-route mr-2"></i>
              Plan Alternative Route
            </Button>
            <Button
              onClick={handleReportUpdate}
              variant="outline"
              className="flex-1"
            >
              <i className="fas fa-flag mr-2"></i>
              Report Status
            </Button>
          </div>

          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full mt-3"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};