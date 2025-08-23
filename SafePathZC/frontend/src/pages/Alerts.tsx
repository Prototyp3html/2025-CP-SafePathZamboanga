
import { useState, useEffect } from 'react';
import { NavigationBar } from '../components/NavigationBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertSettingsModal } from '../components/AlertSettingsModal';
import { AlertDetailsModal } from '../components/AlertDetailsModal';

const Alerts = () => {
  useEffect(() => {
    document.body.style.overflow = 'auto';
  }, []);
  const [activeTab, setActiveTab] = useState('warnings');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  const { toast } = useToast();

  const [activeWarnings, setActiveWarnings] = useState([
    {
      id: 1,
      type: 'flood',
      severity: 'high',
      title: 'Severe Flooding - Canelar Road',
      description: 'Road completely impassable due to heavy flooding. Water level at 1.2 meters.',
      location: 'Canelar Road, Barangay Canelar',
      timeIssued: '2 hours ago',
      estimatedDuration: '4-6 hours',
      affectedRoutes: ['Route A12', 'Route B45', 'Route C33'],
      status: 'active',
      isBookmarked: false
    },
    {
      id: 2,
      type: 'weather',
      severity: 'moderate',
      title: 'Heavy Rainfall Warning',
      description: 'Continuous heavy rain expected. Exercise extreme caution in low-lying areas.',
      location: 'City-wide',
      timeIssued: '45 minutes ago',
      estimatedDuration: '3-4 hours',
      affectedRoutes: ['Multiple routes'],
      status: 'active',
      isBookmarked: false
    },
    {
      id: 3,
      type: 'traffic',
      severity: 'low',
      title: 'Traffic Congestion - Veterans Avenue',
      description: 'Heavy traffic due to flooding on alternate routes. Expect delays.',
      location: 'Veterans Avenue Junction',
      timeIssued: '30 minutes ago',
      estimatedDuration: '2-3 hours',
      affectedRoutes: ['Route V12', 'Route V34'],
      status: 'active',
      isBookmarked: false
    }
  ]);

  const [weatherUpdates, setWeatherUpdates] = useState([
    {
      id: 1,
      type: 'forecast',
      title: 'Extended Heavy Rainfall Forecast',
      description: 'PAGASA forecasts continuous heavy rainfall for the next 6-8 hours with possible thunderstorms.',
      timestamp: '1 hour ago',
      source: 'PAGASA Weather Station',
      impact: 'High flood risk in low-lying areas',
      recommendations: ['Avoid unnecessary travel', 'Monitor flood-prone areas', 'Keep emergency contacts ready'],
      isBookmarked: false
    },
    {
      id: 2,
      type: 'advisory',
      title: 'Typhoon Update - Tropical Depression',
      description: 'A tropical depression has formed east of Mindanao and may affect Zamboanga Peninsula.',
      timestamp: '3 hours ago',
      source: 'PAGASA Regional Office',
      impact: 'Possible heavy rains and strong winds in 48-72 hours',
      recommendations: ['Monitor weather updates', 'Prepare emergency kits', 'Secure outdoor items'],
      isBookmarked: false
    },
    {
      id: 3,
      type: 'update',
      title: 'Current Weather Conditions',
      description: 'Moderate to heavy rainfall continues across Zamboanga City with wind speeds of 15-25 km/h.',
      timestamp: '15 minutes ago',
      source: 'Local Weather Station',
      impact: 'Reduced visibility and slippery roads',
      recommendations: ['Drive slowly', 'Use headlights', 'Maintain safe distance'],
      isBookmarked: false
    }
  ]);

  // Auto-refresh functionality
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Auto-refreshing alerts data...');
      setLastRefreshTime(new Date());
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      setLastRefreshTime(new Date());
      console.log('Alerts refreshed successfully');

      toast({
        title: "Alerts Updated",
        description: "Latest alert information has been retrieved.",
      });
    } catch (error) {
      console.error('Error refreshing alerts:', error);
      toast({
        title: "Refresh Failed",
        description: "Unable to update alerts. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFindAlternativeRoute = (alertId: number) => {
    console.log('Finding alternative route for alert:', alertId);
    toast({
      title: "Route Planning",
      description: "Finding alternative routes. This may take a moment...",
    });

    // Simulate route planning
    setTimeout(() => {
      toast({
        title: "Alternative Routes Found",
        description: "3 alternative routes are available. Check the map for details.",
      });
    }, 2000);
  };

  const handleViewDetails = (alert: any) => {
    setSelectedAlert(alert);
    setShowDetailsModal(true);
    console.log('Viewing details for alert:', alert.id);
  };

  const handleShareAlert = (alert: any) => {
    if (navigator.share) {
      navigator.share({
        title: alert.title,
        text: `${alert.description} - Location: ${alert.location}`,
        url: window.location.href,
      });
    } else {
      // Fallback: copy to clipboard
      const shareText = `${alert.title}\n${alert.description}\nLocation: ${alert.location}`;
      navigator.clipboard.writeText(shareText);
      toast({
        title: "Alert Copied",
        description: "Alert details copied to clipboard.",
      });
    }
    console.log('Sharing alert:', alert.id);
  };

  const handleBookmarkToggle = (id: number, type: 'warning' | 'weather') => {
    if (type === 'warning') {
      setActiveWarnings(prev =>
        prev.map(warning =>
          warning.id === id
            ? { ...warning, isBookmarked: !warning.isBookmarked }
            : warning
        )
      );
    } else {
      setWeatherUpdates(prev =>
        prev.map(update =>
          update.id === id
            ? { ...update, isBookmarked: !update.isBookmarked }
            : update
        )
      );
    }

    toast({
      title: type === 'warning' ? "Alert Bookmarked" : "Update Bookmarked",
      description: "Item saved to your bookmarks.",
    });
    console.log('Toggled bookmark for:', type, id);
  };

  const openPagasaWebsite = () => {
    window.open('https://www.pagasa.dost.gov.ph/', '_blank');
    console.log('Opening PAGASA website');
  };

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
      case 'forecast': return 'fas fa-cloud-sun-rain';
      case 'advisory': return 'fas fa-exclamation-triangle';
      case 'update': return 'fas fa-sync-alt';
      default: return 'fas fa-bell';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      <main className="pt-20 container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-wmsu-blue mb-2">Alerts & Warnings</h1>
          <p className="text-gray-600">
            Stay informed about current conditions and weather updates
            <span className="text-sm text-gray-500 ml-2">
              Last updated: {lastRefreshTime.toLocaleTimeString()}
            </span>
          </p>
        </div>

        {/* Emergency Banner */}
        <Alert className="mb-8 border-red-500 bg-red-50">
          <i className="fas fa-exclamation-triangle text-red-600"></i>
          <AlertTitle className="text-red-800">Emergency Weather Alert</AlertTitle>
          <AlertDescription className="text-red-700">
            Heavy flooding reported in multiple areas. Avoid travel unless absolutely necessary.
            <Button
              variant="link"
              className="p-0 ml-2 text-red-800 underline"
              onClick={() => {
                toast({
                  title: "Emergency Contacts",
                  description: "Emergency: 911 | Disaster Risk Reduction: (062) 991-2999",
                });
              }}
            >
              View Emergency Contacts
            </Button>
          </AlertDescription>
        </Alert>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="warnings" className="text-base">
              Active Warnings ({activeWarnings.length})
            </TabsTrigger>
            <TabsTrigger value="weather" className="text-base">
              Weather Updates ({weatherUpdates.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="warnings" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Active Warnings</h2>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSettingsModal(true)}
                >
                  <i className="fas fa-bell mr-2"></i>
                  Notification Settings
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <i className={`fas fa-sync-alt mr-2 ${isRefreshing ? 'animate-spin' : ''}`}></i>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid gap-6">
              {activeWarnings.map((warning) => (
                <Card key={warning.id} className="border-l-4 border-l-red-500 hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-start space-x-3">
                        <i className={`${getSeverityIcon(warning.type)} text-2xl mt-1 ${
                          warning.severity === 'high' ? 'text-red-600' :
                          warning.severity === 'moderate' ? 'text-orange-600' : 'text-yellow-600'
                        }`}></i>
                        <div>
                          <CardTitle className="text-lg text-gray-800">{warning.title}</CardTitle>
                          <CardDescription className="mt-1 text-sm">
                            <i className="fas fa-map-marker-alt mr-1"></i>
                            {warning.location} • {warning.timeIssued}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={`${getSeverityColor(warning.severity)} text-white`}>
                          {warning.severity} priority
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBookmarkToggle(warning.id, 'warning')}
                          className={warning.isBookmarked ? 'text-yellow-500' : 'text-gray-400'}
                        >
                          <i className={`fas fa-bookmark`}></i>
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 mb-4">{warning.description}</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <span className="text-sm text-gray-500">Estimated Duration:</span>
                        <p className="font-semibold">{warning.estimatedDuration}</p>
                      </div>
                      <div>
                        <span className="text-sm text-gray-500">Affected Routes:</span>
                        <p className="font-semibold">{warning.affectedRoutes.join(', ')}</p>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleFindAlternativeRoute(warning.id)}
                      >
                        <i className="fas fa-route mr-1"></i>
                        Find Alternative Route
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(warning)}
                      >
                        <i className="fas fa-info-circle mr-1"></i>
                        More Details
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleShareAlert(warning)}
                      >
                        <i className="fas fa-share mr-1"></i>
                        Share Alert
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="weather" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Weather Updates</h2>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={openPagasaWebsite}
                >
                  <i className="fas fa-external-link-alt mr-2"></i>
                  PAGASA Website
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <i className={`fas fa-sync-alt mr-2 ${isRefreshing ? 'animate-spin' : ''}`}></i>
                  Refresh Updates
                </Button>
              </div>
            </div>

            <div className="grid gap-6">
              {weatherUpdates.map((update) => (
                <Card key={update.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <i className={`${getSeverityIcon(update.type)} text-2xl mt-1 text-wmsu-blue`}></i>
                        <div className="flex-1">
                          <CardTitle className="text-lg text-gray-800">{update.title}</CardTitle>
                          <CardDescription className="mt-1 text-sm">
                            <i className="fas fa-clock mr-1"></i>
                            {update.timestamp} • Source: {update.source}
                          </CardDescription>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBookmarkToggle(update.id, 'weather')}
                        className={update.isBookmarked ? 'text-yellow-500' : 'text-gray-400'}
                      >
                        <i className="fas fa-bookmark"></i>
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 mb-4">{update.description}</p>

                    <div className="bg-blue-50 rounded-lg p-4 mb-4">
                      <h4 className="font-semibold text-gray-800 mb-2">Expected Impact:</h4>
                      <p className="text-gray-700 text-sm">{update.impact}</p>
                    </div>

                    <div className="bg-yellow-50 rounded-lg p-4 mb-4">
                      <h4 className="font-semibold text-gray-800 mb-2">Recommendations:</h4>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {update.recommendations.map((rec, index) => (
                          <li key={index} className="flex items-start">
                            <i className="fas fa-check-circle text-green-600 mr-2 mt-0.5"></i>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleShareAlert(update)}
                      >
                        <i className="fas fa-share mr-1"></i>
                        Share Update
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modals */}
      {showSettingsModal && (
        <AlertSettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {showDetailsModal && selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
    </div>
  );
};

export default Alerts;