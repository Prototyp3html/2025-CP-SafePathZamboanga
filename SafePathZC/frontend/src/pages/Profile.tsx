
import { useState } from 'react';
import { NavigationBar } from '../components/NavigationBar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Profile = () => {
  const [userInfo, setUserInfo] = useState({
    name: 'Maria Santos',
    email: 'maria.santos@email.com',
    phone: '+63 912 345 6789',
    location: 'Zamboanga City',
    memberSince: 'June 2024'
  });

  const [stats] = useState({
    routesUsed: 127,
    alertsReceived: 45,
    reportsSubmitted: 8,
    communityPoints: 340
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBar />

      <main className="pt-20 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-wmsu-blue mb-2">My Profile</h1>
            <p className="text-gray-600">Manage your account settings and view your activity</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Info Card */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader className="text-center">
                  <div className="w-24 h-24 bg-wmsu-blue rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-user text-white text-3xl"></i>
                  </div>
                  <CardTitle>{userInfo.name}</CardTitle>
                  <CardDescription>{userInfo.location}</CardDescription>
                  <Badge className="mt-2">Member since {userInfo.memberSince}</Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-wmsu-blue">{stats.communityPoints}</p>
                      <p className="text-sm text-gray-600">Community Points</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="font-semibold">{stats.routesUsed}</p>
                        <p className="text-xs text-gray-600">Routes Used</p>
                      </div>
                      <div>
                        <p className="font-semibold">{stats.reportsSubmitted}</p>
                        <p className="text-xs text-gray-600">Reports</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Profile Settings */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="personal" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="personal">Personal Info</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="preferences">Preferences</TabsTrigger>
                </TabsList>

                <TabsContent value="personal" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Personal Information</CardTitle>
                      <CardDescription>Update your personal details</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Full Name</label>
                        <Input value={userInfo.name} onChange={(e) => setUserInfo({...userInfo, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <Input value={userInfo.email} onChange={(e) => setUserInfo({...userInfo, email: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Phone</label>
                        <Input value={userInfo.phone} onChange={(e) => setUserInfo({...userInfo, phone: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Location</label>
                        <Input value={userInfo.location} onChange={(e) => setUserInfo({...userInfo, location: e.target.value})} />
                      </div>
                      <Button className="w-full">Save Changes</Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="activity" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                      <CardDescription>Your recent app usage and contributions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Route Used: WMSU to Ayala Mall</p>
                            <p className="text-sm text-gray-600">2 hours ago</p>
                          </div>
                          <Badge variant="outline">Route</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Reported flooding on Veterans Ave</p>
                            <p className="text-sm text-gray-600">1 day ago</p>
                          </div>
                          <Badge variant="outline">Report</Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">Commented on forum post</p>
                            <p className="text-sm text-gray-600">2 days ago</p>
                          </div>
                          <Badge variant="outline">Community</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="preferences" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>App Preferences</CardTitle>
                      <CardDescription>Customize your app experience</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Dark Mode</label>
                        <input type="checkbox" className="toggle" />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Location Services</label>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Auto-refresh Map</label>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Voice Navigation</label>
                        <input type="checkbox" className="toggle" />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Profile;