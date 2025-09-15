import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-control-geocoder";
import "leaflet/dist/leaflet.css";
import "leaflet-control-geocoder/dist/Control.Geocoder.css";
import "leaflet-routing-machine";
import "../App.css";
import { RouteModal } from "./RouteModal";
import { AlertBanner } from "./AlertBanner";
import { WeatherDashboard } from "./WeatherDashboard";
import { localRoutingService } from '../services/localRouting';
import { searchZamboCityLocations, ZamboCityLocation } from '../utils/zamboCityLocations';

interface LatLng {
  lat: number;
  lng: number;
}

interface FloodRoute {
  waypoints: LatLng[];
  distance: string;
  time: string;
  floodRisk: "safe" | "manageable" | "prone";
  riskLevel: string;
  description: string;
  color: string;
}

interface RouteDetails {
  safeRoute: FloodRoute;
  manageableRoute: FloodRoute;
  proneRoute: FloodRoute;
  startName: string;
  endName: string;
}

interface TerrainData {
  elevation: number;
  slope: number;
  floodRisk: string;
  terrainType: string;
  lat: string;
  lng: string;
}

interface TileLayerConfig {
  url: string;
  options: {
    maxZoom: number;
    attribution: string;
  };
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id: string;
}

interface MapViewProps {
  onModalOpen?: (modal: "report" | "emergency") => void;
}

export const MapView = ({ onModalOpen }: MapViewProps) => {
  const [routeMode, setRouteMode] = useState(false);
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<LatLng | null>(null);
  const [routeDetails, setRouteDetails] = useState<RouteDetails | null>(null);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [mapLayer, setMapLayer] = useState("street");
  const [showTerrainData, setShowTerrainData] = useState(false);
  const [terrainData, setTerrainData] = useState<TerrainData | null>(null);
  const [isTerrainMode, setIsTerrainMode] = useState(false);
  const [showTerrainOverlay, setShowTerrainOverlay] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<
    "safe" | "manageable" | "prone" | null
  >(null);
  const [showWeatherDashboard, setShowWeatherDashboard] = useState(false);
  
  // Transportation mode state
  const [transportationMode, setTransportationMode] = useState<"car" | "motorcycle" | "walking">("car");

  // Current location and map click states
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [locationDetails, setLocationDetails] = useState<{
    lat: number;
    lng: number;
    address: string;
    elevation: number;
  } | null>(null);
  const [showLocationDetails, setShowLocationDetails] = useState(false);

  // New states for route planner modal
  const [showRoutePlannerModal, setShowRoutePlannerModal] = useState(false);
  const [startLocationInput, setStartLocationInput] = useState("");
  const [endLocationInput, setEndLocationInput] = useState("");
  const [startSuggestions, setStartSuggestions] = useState<
    LocationSuggestion[]
  >([]);
  const [endSuggestions, setEndSuggestions] = useState<LocationSuggestion[]>(
    []
  );
  const [selectedStartLocation, setSelectedStartLocation] =
    useState<LocationSuggestion | null>(null);
  const [selectedEndLocation, setSelectedEndLocation] =
    useState<LocationSuggestion | null>(null);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);

  const mapRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const layersRef = useRef<Record<string, L.TileLayer>>({});
  const terrainPopupRef = useRef<L.CircleMarker | null>(null);
  const terrainOverlayRef = useRef<L.LayerGroup | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const currentLocationMarkerRef = useRef<L.Marker | null>(null);
  const locationPopupRef = useRef<L.Popup | null>(null);

  // Custom icons
  const startIcon = L.icon({
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x-green.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
  const endIcon = L.icon({
    iconUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x-red.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });
  const currentLocationIcon = L.icon({
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

  // Get current location and add marker
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const newLocation = { lat, lng };
        
        setCurrentLocation(newLocation);
        
        // Remove existing current location marker
        if (currentLocationMarkerRef.current && mapRef.current) {
          mapRef.current.removeLayer(currentLocationMarkerRef.current);
        }
        
        // Add new current location marker
        if (mapRef.current) {
          const marker = L.marker([lat, lng], {
            icon: currentLocationIcon,
            zIndexOffset: 1000 // Make sure it's on top
          })
          .addTo(mapRef.current)
          .bindPopup(`
            <div style="text-align: center; font-family: system-ui;">
              <strong>📍 Your Current Location</strong><br>
              <small>Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}</small>
            </div>
          `);
          
          currentLocationMarkerRef.current = marker;
          
          // Pan to current location
          mapRef.current.setView([lat, lng], 16);
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to get your current location: " + error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  };

  // Handle map click to show location details (like Google Maps)
  const handleMapClick = async (e: L.LeafletMouseEvent) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    // Calculate estimated elevation
    const coastalDistance = Math.sqrt(
      Math.pow(lat - 6.9087, 2) + Math.pow(lng - 122.0547, 2)
    ) * 111000; // Convert to meters
    const estimatedElevation = Math.max(0, Math.min(200, coastalDistance / 50));
    
    try {
      // Reverse geocode to get address
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const data = await response.json();
      
      const address = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      
      // Close previous location popup
      if (locationPopupRef.current && mapRef.current) {
        mapRef.current.closePopup(locationPopupRef.current);
      }
      
      // Create and show location details popup (Google Maps style)
      const popup = L.popup({
        maxWidth: 300,
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        className: 'location-details-popup'
      })
      .setLatLng(e.latlng)
      .setContent(`
        <div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.4;">
          <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #333;">
            📍 Location Details
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
            <strong>Address:</strong><br>
            ${address}
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 6px;">
            <strong>Coordinates:</strong><br>
            ${lat.toFixed(6)}, ${lng.toFixed(6)}
          </div>
          <div style="font-size: 12px; color: #666; margin-bottom: 8px;">
            <strong>Elevation:</strong> ~${estimatedElevation.toFixed(1)}m above sea level
          </div>
          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button onclick="setAsStart(${lat}, ${lng}, '${address.replace(/'/g, "\\'")}')" 
                    style="flex: 1; padding: 6px 12px; background: #4CAF50; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
              Set as Start
            </button>
            <button onclick="setAsEnd(${lat}, ${lng}, '${address.replace(/'/g, "\\'")}')" 
                    style="flex: 1; padding: 6px 12px; background: #2196F3; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
              Set as End
            </button>
          </div>
        </div>
      `)
      .openOn(mapRef.current!);
      
      locationPopupRef.current = popup;
      
      // Store location details
      setLocationDetails({
        lat,
        lng,
        address,
        elevation: estimatedElevation
      });
      
    } catch (error) {
      console.error("Error getting location details:", error);
      
      // Fallback popup without address
      const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(`
          <div style="font-family: system-ui; text-align: center;">
            <strong>📍 Location</strong><br>
            <small>${lat.toFixed(6)}, ${lng.toFixed(6)}</small><br>
            <small>Elevation: ~${estimatedElevation.toFixed(1)}m</small>
          </div>
        `)
        .openOn(mapRef.current!);
        
      locationPopupRef.current = popup;
    }
  };

  // Zamboanga City location search using local database
  const searchLocations = async (
    query: string
  ): Promise<LocationSuggestion[]> => {
    if (query.length < 2) return [];

    try {
      const zamboCityResults = await searchZamboCityLocations(query, 5);
      
      return zamboCityResults.map((location: ZamboCityLocation) => ({
        display_name: location.displayName,
        lat: location.lat.toString(),
        lon: location.lng.toString(),
        place_id: location.place_id || `zambo_${location.name.toLowerCase().replace(/\s+/g, '_')}`
      }));
    } catch (error) {
      console.error("Error searching Zamboanga City locations:", error);
      return [];
    }
  };

  // Enhanced local routing function with better transport mode handling
  const getLocalBackendRoute = async (
    start: LatLng,
    end: LatLng,
    waypoints: LatLng[] = [],
    routeType: 'fastest' | 'shortest' | 'balanced' = 'fastest',
    transportMode: "car" | "motorcycle" | "walking" = "car"
  ): Promise<LatLng[]> => {
    try {
      console.log(`🏠 Enhanced routing: ${transportMode} | ${routeType}`);
      
      // PRIORITY: Use direct OSRM Docker with appropriate profile and settings
      const allPoints = [start, ...waypoints, end];
      const coords = allPoints.map(p => `${p.lng},${p.lat}`).join(';');
      
      // Map transport modes to OSRM profiles and ports with different parameters
      let osrmProfile = 'driving';
      let osrmPort = '5000';
      let additionalParams = '';
      
      if (transportMode === 'walking') {
        osrmProfile = 'foot';
        osrmPort = '5001';
        additionalParams = '&alternatives=2&continue_straight=false'; // More walking alternatives
      } else if (transportMode === 'motorcycle') {
        osrmProfile = 'driving';
        osrmPort = '5000';
        additionalParams = '&alternatives=1&continue_straight=false'; // Allow tighter turns for motorcycles
      } else { // car
        osrmProfile = 'driving';
        osrmPort = '5000';
        additionalParams = '&alternatives=1&continue_straight=true'; // Prefer main roads for cars
      }
      
      try {
        const osrmResponse = await fetch(
          `http://localhost:${osrmPort}/route/v1/${osrmProfile}/${coords}?overview=full&geometries=geojson${additionalParams}`
        );
        
        if (osrmResponse.ok) {
          const osrmData = await osrmResponse.json();
          if (osrmData.routes && osrmData.routes[0]) {
            console.log(`✅ Enhanced OSRM ${transportMode} route: ${(osrmData.routes[0].distance/1000).toFixed(1)}km`);
            return osrmData.routes[0].geometry.coordinates.map((coord: number[]) => ({
              lat: coord[1],
              lng: coord[0]
            }));
          }
        }
      } catch (osrmError) {
        console.log(`Enhanced OSRM ${transportMode} unavailable, trying GeoJSON fallback...`);
      }

      // FALLBACK: Try local GeoJSON routing (if OSRM fails)
      try {
        const localResponse = await fetch('http://localhost:8001/api/routing/calculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start_lat: start.lat,
            start_lng: start.lng,
            end_lat: end.lat,
            end_lng: end.lng
          })
        });

        if (localResponse.ok) {
          const localData = await localResponse.json();
          if (localData.success && localData.route.length > 0) {
            console.log(`✅ GeoJSON fallback route: ${(localData.distance/1000).toFixed(1)}km`);
            return localData.route.map((point: any) => ({
              lat: point.lat,
              lng: point.lng
            }));
          }
        }
      } catch (localError) {
        console.log('GeoJSON routing also unavailable');
      }

      // Last resort: direct line
      console.log('⚠️ All routing services unavailable, using direct line');
      return [start, end];
      
    } catch (error) {
      console.error(`Local routing failed for ${transportMode}:`, error);
      return [start, end];
    }
  };

  // Calculate flood risk based on detailed risk score
  const calculateFloodRisk = (
    elevation: number,
    lat: number,
    lng: number
  ): "safe" | "manageable" | "prone" => {
    const cityCenter = { lat: 6.9214, lng: 122.079 };
    const distanceFromCenter = Math.sqrt(
      Math.pow(lat - cityCenter.lat, 2) + Math.pow(lng - cityCenter.lng, 2)
    ) * 111;

    let riskScore = 0;

    // Elevation risk
    if (elevation < 5) riskScore += 40;
    else if (elevation < 15) riskScore += 20;

    // Coastal proximity
    if (distanceFromCenter < 3) riskScore += 30;
    else if (distanceFromCenter < 5) riskScore += 15;

    // Categorize risk
    if (riskScore >= 50) return "prone";
    if (riskScore >= 25) return "manageable";
    return "safe";
  };

  const calculateRouteDistance = (waypoints: LatLng[]): number => {
    if (waypoints.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const point1 = waypoints[i];
      const point2 = waypoints[i + 1];

      const R = 6371; // Earth's radius in km
      const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
      const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((point1.lat * Math.PI) / 180) *
          Math.cos((point2.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      totalDistance += distance;
    }

    return totalDistance;
  };

  // Enhanced flood risk assessment with transportation mode considerations
  const assessRouteFloodRisk = async (
    waypoints: LatLng[],
    transportMode: "car" | "motorcycle" | "walking" = "car"
  ): Promise<{
    risk: "safe" | "manageable" | "prone";
    level: string;
    description: string;
    color: string;
    riskScore: number;
  }> => {
    if (waypoints.length === 0) {
      return {
        risk: "safe",
        level: "Unknown",
        description: "Route data unavailable",
        color: "#gray",
        riskScore: 0,
      };
    }

    const cityCenter = { lat: 6.9214, lng: 122.079 };
    const coast = { lat: 6.9087, lng: 122.0547 }; // Port area (most flood-prone)
    const lowlandAreas = [
      { lat: 6.9180, lng: 122.0680 }, // Tetuan (low-lying area)
      { lat: 6.9050, lng: 122.0590 }, // Sta. Catalina (coastal)
      { lat: 6.9290, lng: 122.0820 }, // Tumaga (riverside)
    ];

    let riskScore = 0;
    let coastalPoints = 0;
    let lowlandPoints = 0;
    let totalDistance = 0;

    // Transportation mode risk modifiers
    const modeRiskModifiers = {
      car: 1.0,        // Standard risk
      motorcycle: 0.8, // Lower risk (can navigate smaller roads/shortcuts)
      walking: 1.2     // Higher risk (more vulnerable to flooding)
    };

    // Analyze each waypoint for flood risk factors
    waypoints.forEach((point, index) => {
      // Distance from city center
      const distanceFromCenter = Math.sqrt(
        Math.pow(point.lat - cityCenter.lat, 2) + 
        Math.pow(point.lng - cityCenter.lng, 2)
      ) * 111; // Convert to km

      // Distance from coast/port (most flood-prone area)
      const distanceFromCoast = Math.sqrt(
        Math.pow(point.lat - coast.lat, 2) + 
        Math.pow(point.lng - coast.lng, 2)
      ) * 111;

      // Check proximity to known lowland/flood-prone areas
      const nearLowland = lowlandAreas.some(lowland => {
        const distanceToLowland = Math.sqrt(
          Math.pow(point.lat - lowland.lat, 2) + 
          Math.pow(point.lng - lowland.lng, 2)
        ) * 111;
        return distanceToLowland < 2; // Within 2km of lowland area
      });

      // Scoring system (higher = more flood-prone)
      if (distanceFromCoast < 1) riskScore += 50; // Very close to port/coast
      else if (distanceFromCoast < 2) riskScore += 30;
      else if (distanceFromCoast < 4) riskScore += 15;

      if (nearLowland) riskScore += 25; // In known flood-prone area
      
      if (distanceFromCenter < 2) riskScore += 20; // Urban center (more development/runoff)
      else if (distanceFromCenter > 8) riskScore += 10; // Far from center (rural/undeveloped)

      // Count different types of points
      if (distanceFromCoast < 3) coastalPoints++;
      if (nearLowland) lowlandPoints++;
      
      if (index > 0) {
        const prevPoint = waypoints[index - 1];
        const segmentDistance = Math.sqrt(
          Math.pow(point.lat - prevPoint.lat, 2) + 
          Math.pow(point.lng - prevPoint.lng, 2)
        ) * 111;
        totalDistance += segmentDistance;
      }
    });

    // Apply transportation mode risk modifier
    const normalizedRiskScore = (riskScore / waypoints.length) * modeRiskModifiers[transportMode];
    const coastalRatio = coastalPoints / waypoints.length;
    const lowlandRatio = lowlandPoints / waypoints.length;

    // Mode-specific descriptions
    const modeDescriptions = {
      car: "car route",
      motorcycle: "motorcycle route (can use smaller roads)",
      walking: "walking route (more vulnerable to flooding)"
    };

    // Determine risk level based on comprehensive analysis
    if (normalizedRiskScore >= 35 || coastalRatio > 0.6 || lowlandRatio > 0.4) {
      return {
        risk: "prone",
        level: "High Flood Risk",
        description: `High-risk ${modeDescriptions[transportMode]}: ${(coastalRatio * 100).toFixed(0)}% coastal, ${(lowlandRatio * 100).toFixed(0)}% lowland areas. Significant flood risk during heavy rains.`,
        color: "#e74c3c",
        riskScore: normalizedRiskScore,
      };
    } else if (normalizedRiskScore >= 20 || coastalRatio > 0.3 || lowlandRatio > 0.2) {
      return {
        risk: "manageable",
        level: "Moderate Flood Risk",
        description: `Moderate-risk ${modeDescriptions[transportMode]}: ${(coastalRatio * 100).toFixed(0)}% coastal, ${(lowlandRatio * 100).toFixed(0)}% lowland areas. Some flood risk during heavy rains.`,
        color: "#f39c12",
        riskScore: normalizedRiskScore,
      };
    } else {
      return {
        risk: "safe",
        level: "Low Flood Risk",
        description: `Low-risk ${modeDescriptions[transportMode]}: ${(coastalRatio * 100).toFixed(0)}% coastal, ${(lowlandRatio * 100).toFixed(0)}% lowland areas. Minimal flood risk.`,
        color: "#27ae60",
        riskScore: normalizedRiskScore,
      };
    }
  };

  // NEW FUNCTION - Add this
  const createDirectRoute = (start: LatLng, end: LatLng): LatLng[] => {
    return [start, end];
  };

  const validateAndFixRoute = (
    route: LatLng[],
    start: LatLng,
    end: LatLng
  ): LatLng[] => {
    if (!route || route.length === 0) {
      return createDirectRoute(start, end);
    }

    // Check if route actually starts and ends at the right points
    const threshold = 0.001; // About 100m tolerance
    const startsCorrectly =
      Math.abs(route[0].lat - start.lat) < threshold &&
      Math.abs(route[0].lng - start.lng) < threshold;
    const endsCorrectly =
      Math.abs(route[route.length - 1].lat - end.lat) < threshold &&
      Math.abs(route[route.length - 1].lng - end.lng) < threshold;

    const fixedRoute = [...route];

    // Force correct start point
    if (!startsCorrectly) {
      fixedRoute[0] = start;
    }

    // Force correct end point
    if (!endsCorrectly) {
      fixedRoute[fixedRoute.length - 1] = end;
    }

    return fixedRoute;
  };

  // NEW FUNCTION - Add this
  const removeSimilarRoutes = (routes: LatLng[][]): LatLng[][] => {
    const uniqueRoutes: LatLng[][] = [];
    const threshold = 0.01;

    for (const route of routes) {
      let isSimilar = false;

      for (const existingRoute of uniqueRoutes) {
        if (areRoutesSimilar(route, existingRoute, threshold)) {
          isSimilar = true;
          break;
        }
      }

      if (!isSimilar) {
        uniqueRoutes.push(route);
      }
    }

    return uniqueRoutes;
  };

  // NEW FUNCTION - Add this
  const areRoutesSimilar = (
  route1: LatLng[],
  route2: LatLng[],
  threshold: number = 0.005 // About 500m tolerance
): boolean => {
  if (route1.length === 0 || route2.length === 0) return false;
  
  // Check if routes have significantly different lengths
  const lengthDiff = Math.abs(route1.length - route2.length);
  if (lengthDiff > Math.max(route1.length, route2.length) * 0.5) {
    return false; // Very different route lengths suggest different paths
  }

  // Compare start points
  const startDiff = Math.abs(route1[0].lat - route2[0].lat) + 
                   Math.abs(route1[0].lng - route2[0].lng);
  
  // Compare end points  
  const endDiff = Math.abs(route1[route1.length - 1].lat - route2[route2.length - 1].lat) +
                 Math.abs(route1[route1.length - 1].lng - route2[route2.length - 1].lng);
  
  // Compare some middle points for path similarity
  const midIndex1 = Math.floor(route1.length / 2);
  const midIndex2 = Math.floor(route2.length / 2);
  const midDiff = Math.abs(route1[midIndex1].lat - route2[midIndex2].lat) +
                 Math.abs(route1[midIndex1].lng - route2[midIndex2].lng);

  // Routes are similar if start, middle, and end points are close
  return startDiff < threshold && endDiff < threshold && midDiff < threshold * 2;
};

  // Enhanced flood-risk aware routing with transport mode variations
  const generateFloodRoutes = async (
    start: LatLng,
    end: LatLng,
    currentTransportMode: "car" | "motorcycle" | "walking" = "car"
  ): Promise<RouteDetails> => {
    try {
      console.log(`🚦 Generating 3 distinct routes for ${currentTransportMode}...`);
      console.log("🗺️ Using enhanced routing for different transport modes!");

      const routes: LatLng[][] = [];
      
      // Create different routing strategies based on transport mode
      const routingStrategies = [
        { mode: currentTransportMode, preference: 'fastest', waypoint: null },
        { mode: currentTransportMode, preference: 'balanced', waypoint: { lat: (start.lat + end.lat) / 2 + 0.005, lng: (start.lng + end.lng) / 2 - 0.003 } },
        { mode: currentTransportMode, preference: 'shortest', waypoint: { lat: (start.lat + end.lat) / 2 - 0.005, lng: (start.lng + end.lng) / 2 + 0.003 } }
      ];

      // Generate 3 different routes using enhanced routing
      for (let i = 0; i < 3; i++) {
        const strategy = routingStrategies[i];
        console.log(`🗺️ Generating route ${i + 1} for ${strategy.mode} (${strategy.preference})...`);
        
        try {
          let route: LatLng[];
          
          if (strategy.waypoint) {
            // Multi-segment route with intermediate waypoint
            const segment1 = await getLocalBackendRoute(start, strategy.waypoint, [], strategy.preference as any, strategy.mode);
            const segment2 = await getLocalBackendRoute(strategy.waypoint, end, [], strategy.preference as any, strategy.mode);
            route = [...segment1, ...segment2.slice(1)]; // Remove duplicate waypoint
          } else {
            // Direct route
            route = await getLocalBackendRoute(start, end, [], strategy.preference as any, strategy.mode);
          }
          
          // Validate and fix the route
          const validatedRoute = validateAndFixRoute(route, start, end);
          
          if (validatedRoute.length > 2) {
            routes.push(validatedRoute);
            console.log(`✅ Route ${i + 1} generated: ${validatedRoute.length} points`);
          } else {
            console.log(`⚠️ Route ${i + 1} too short, using fallback...`);
            routes.push(createDirectRoute(start, end));
          }
        } catch (error) {
          console.log(`⚠️ Route ${i + 1} failed:`, error);
          routes.push(createDirectRoute(start, end));
        }
      }
      
      // Strategy 1: ALWAYS try local GeoJSON routing FIRST (no bounds checking!)
      console.log("🗺️ PRIORITIZING local GeoJSON routing for ALL routes (using your zamboanga_roads.geojson)...");
      
      try {
        // Route 1: Direct local route using your GeoJSON roads
        const localRoute1 = await localRoutingService.calculateRoute(start.lat, start.lng, end.lat, end.lng);
        if (localRoute1?.success && localRoute1.route.length > 0) {
          const localWaypoints1 = localRoutingService.convertToLatLng(localRoute1.route);
          routes.push(localWaypoints1);
          console.log(`✅ Local GeoJSON route 1: ${localRoute1.distance}m using your road data!`);
        } else {
          console.log(`⚠️ Local GeoJSON route 1 failed: ${localRoute1?.message || "No route found"}`);
        }

        // Route 2: Local route with intermediate waypoint (create variation)
        const midLat = (start.lat + end.lat) / 2;
        const midLng = (start.lng + end.lng) / 2;
        
        // Try different intermediate points to create route variations
        const intermediatePoints = [
          { lat: midLat + 0.005, lng: midLng - 0.003 }, // Slightly north-west
          { lat: midLat - 0.005, lng: midLng + 0.003 }, // Slightly south-east
          { lat: midLat + 0.008, lng: midLng + 0.005 }, // More north-east
        ];

        for (const intermediate of intermediatePoints) {
          if (routes.length >= 3) break;
          
          try {
            // Two-segment route: start → intermediate → end
            const segment1 = await localRoutingService.calculateRoute(start.lat, start.lng, intermediate.lat, intermediate.lng);
            const segment2 = await localRoutingService.calculateRoute(intermediate.lat, intermediate.lng, end.lat, end.lng);
            
            if (segment1?.success && segment2?.success && segment1.route.length > 0 && segment2.route.length > 0) {
              const waypoints1 = localRoutingService.convertToLatLng(segment1.route);
              const waypoints2 = localRoutingService.convertToLatLng(segment2.route);
              
              // Combine segments (remove duplicate intermediate point)
              const combinedRoute = [...waypoints1, ...waypoints2.slice(1)];
              
              if (combinedRoute.length > 5) { // Ensure meaningful route
                routes.push(combinedRoute);
                console.log(`✅ Local GeoJSON multi-segment route: ${(segment1.distance + segment2.distance)}m using YOUR road data!`);
              }
            }
          } catch (error) {
            console.log(`Local multi-segment routing failed for intermediate point:`, error);
          }
        }
      } catch (error) {
        console.log("⚠️ Local GeoJSON routing failed - your zamboanga_roads.geojson may not be loaded:", error);
      }

      // Strategy 2: Fill remaining slots with LOCAL routing if needed
      while (routes.length < 3) {
        const routeIndex = routes.length;
        console.log(`� Generating local route ${routeIndex + 1}...`);
        
        if (routeIndex === 0) {
          // Direct fastest route
          const fastestRoute = await getLocalBackendRoute(start, end, [], 'fastest', transportationMode);
          if (fastestRoute.length > 0) {
            routes.push(fastestRoute);
            console.log(`✅ Local fastest route (${transportationMode}): ${fastestRoute.length} waypoints`);
          } else {
            routes.push(createDirectRoute(start, end));
          }
        } else if (routeIndex === 1) {
          // Northern alternative route
          const midLat = (start.lat + end.lat) / 2;
          const midLng = (start.lng + end.lng) / 2;
          const northWaypoint = { lat: midLat + 0.008, lng: midLng + 0.003 };
          
          const northRoute = await getLocalBackendRoute(start, end, [northWaypoint], 'balanced', transportationMode);
          if (northRoute.length > 2) {
            routes.push(northRoute);
            console.log(`✅ Local northern route (${transportationMode}): ${northRoute.length} waypoints`);
          } else {
            routes.push(createDirectRoute(start, end));
          }
        } else if (routeIndex === 2) {
          // Southern/coastal alternative route
          const midLat = (start.lat + end.lat) / 2;
          const midLng = (start.lng + end.lng) / 2;
          const southWaypoint = { lat: midLat - 0.008, lng: midLng - 0.003 };
          
          const southRoute = await getLocalBackendRoute(start, end, [southWaypoint], 'shortest', transportationMode);
          if (southRoute.length > 2) {
            routes.push(southRoute);
            console.log(`✅ Local southern route (${transportationMode}): ${southRoute.length} waypoints`);
          } else {
            routes.push(createDirectRoute(start, end));
          }
        }
      }

      // Validate all routes and ensure exactly 3
      const finalRoutes = routes.slice(0, 3).map(route => validateAndFixRoute(route, start, end));
      
      console.log(`📍 Generated ${finalRoutes.length} routes for ${transportationMode.toUpperCase()} (YOUR zamboanga_roads.geojson prioritized!)`);

      // Assess each route for flood risk using enhanced analysis with transportation mode
      const routeAssessments = await Promise.all(
        finalRoutes.map(route => assessRouteFloodRisk(route, transportationMode))
      );

      // Calculate distances for each route
      const distances = finalRoutes.map(route => calculateRouteDistance(route));

      // Sort routes by FLOOD RISK (most prone first for RED → ORANGE → GREEN display)
      const routeData = finalRoutes.map((route, index) => ({
        waypoints: route,
        distance: distances[index],
        assessment: routeAssessments[index]
      })).sort((a, b) => {
        // Sort by risk score (HIGHEST risk first for RED route)
        return b.assessment.riskScore - a.assessment.riskScore;
      });

      // Assign routes with PROPER FLOOD RISK ORDER: Red (most prone) → Orange (manageable) → Green (safest)
      const proneRoute: FloodRoute = {
        waypoints: routeData[0].waypoints,
        distance: `${routeData[0].distance.toFixed(1)} km`,
        time: `${Math.round(routeData[0].distance * 4)} min`,
        floodRisk: "prone",
        riskLevel: routeData[0].assessment.level,
        description: routeData[0].assessment.description,
        color: "#e74c3c" // RED - Most flood-prone route
      };

      const manageableRoute: FloodRoute = {
        waypoints: routeData[1].waypoints,
        distance: `${routeData[1].distance.toFixed(1)} km`,
        time: `${Math.round(routeData[1].distance * 4)} min`,
        floodRisk: "manageable", 
        riskLevel: routeData[1].assessment.level,
        description: routeData[1].assessment.description,
        color: "#f39c12" // ORANGE - Moderate flood risk route
      };

      const safeRoute: FloodRoute = {
        waypoints: routeData[2].waypoints,
        distance: `${routeData[2].distance.toFixed(1)} km`,
        time: `${Math.round(routeData[2].distance * 4)} min`,
        floodRisk: "safe",
        riskLevel: routeData[2].assessment.level,
        description: routeData[2].assessment.description,
        color: "#27ae60" // GREEN - Safest route
      };

      return {
        safeRoute,
        manageableRoute,
        proneRoute,
        startName: selectedStartLocation?.display_name || "Start Point",
        endName: selectedEndLocation?.display_name || "End Point"
      };

    } catch (error) {
      console.error("Error in generateFloodRoutes:", error);
      
      // Fallback: create simple direct routes with slight variations
      const directRoute = createDirectRoute(start, end);
      const distance = calculateRouteDistance(directRoute);
      
      const baseFallback = {
        waypoints: directRoute,
        distance: `${distance.toFixed(1)} km`,
        time: `${Math.round(distance * 4)} min`,
      };

      return {
        safeRoute: { 
          ...baseFallback, 
          floodRisk: "safe" as const, 
          color: "#27ae60", 
          riskLevel: "Low Risk", 
          description: "Direct safe route (fallback)" 
        },
        manageableRoute: { 
          ...baseFallback, 
          floodRisk: "manageable" as const, 
          color: "#f39c12", 
          riskLevel: "Medium Risk", 
          description: "Direct moderate route (fallback)" 
        },
        proneRoute: { 
          ...baseFallback, 
          floodRisk: "prone" as const, 
          color: "#e74c3c", 
          riskLevel: "High Risk", 
          description: "Direct fast route (fallback)" 
        },
        startName: selectedStartLocation?.display_name || "Start Point",
        endName: selectedEndLocation?.display_name || "End Point"
      };
    }
  };

  // Enhanced route drawing with elevation display and sequential rendering
  const drawRoute = (route: FloodRoute) => {
    if (!mapRef.current) return;

    // Clear existing route layers
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    // Draw the route as a single polyline with hover elevation display
    const polyline = L.polyline(
      route.waypoints.map((wp) => [wp.lat, wp.lng]),
      {
        color: route.color,
        weight: 5,
        opacity: 0.8,
        dashArray: route.floodRisk === "prone" ? "10, 10" : undefined,
      }
    ).addTo(mapRef.current);

    // Add elevation display on hover
    polyline.on('mouseover', async (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      try {
        // Simple elevation estimation based on distance from coast
        const coastalDistance = Math.sqrt(
          Math.pow(lat - 6.9087, 2) + Math.pow(lng - 122.0547, 2)
        ) * 111000; // Convert to meters
        
        // Estimate elevation (higher as you move inland)
        const estimatedElevation = Math.max(0, Math.min(200, coastalDistance / 50));
        
        // Create hover popup with elevation info
        const popup = L.popup({
          closeButton: false,
          className: 'elevation-popup'
        })
        .setLatLng(e.latlng)
        .setContent(`
          <div style="text-align: center; font-size: 12px;">
            <strong>📍 Position</strong><br>
            Lat: ${lat.toFixed(5)}<br>
            Lng: ${lng.toFixed(5)}<br>
            <strong>⛰️ Elevation</strong><br>
            ~${estimatedElevation.toFixed(1)}m above sea level<br>
            <span style="color: ${route.color};">● ${route.floodRisk.toUpperCase()} ROUTE</span>
          </div>
        `)
        .openOn(mapRef.current!);
        
        // Store popup reference for cleanup
        (polyline as any)._hoverPopup = popup;
      } catch (error) {
        console.log('Elevation display error:', error);
      }
    });

    polyline.on('mouseout', () => {
      // Remove hover popup
      if ((polyline as any)._hoverPopup && mapRef.current) {
        mapRef.current.closePopup((polyline as any)._hoverPopup);
      }
    });

    routeLayersRef.current.push(polyline);

    // Fit map to show the route
    const group = new L.FeatureGroup(routeLayersRef.current);
    mapRef.current.fitBounds(group.getBounds().pad(0.1));
  };

  // Sequential route rendering function
  const drawRoutesSequentially = async (routes: { safe: FloodRoute; manageable: FloodRoute; prone: FloodRoute }) => {
    if (!mapRef.current) return;

    // Clear existing routes
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    console.log('🎬 Starting sequential route rendering...');

    // Draw routes with 3-second delays
    const routeOrder = [
      { route: routes.prone, name: 'High Risk (Red)', delay: 0 },
      { route: routes.manageable, name: 'Moderate Risk (Orange)', delay: 3000 },
      { route: routes.safe, name: 'Low Risk (Green)', delay: 6000 }
    ];

    for (const { route, name, delay } of routeOrder) {
      setTimeout(() => {
        console.log(`🎭 Rendering ${name} route...`);
        
        const polyline = L.polyline(
          route.waypoints.map((wp) => [wp.lat, wp.lng]),
          {
            color: route.color,
            weight: 5,
            opacity: 0.8,
            dashArray: route.floodRisk === "prone" ? "10, 10" : undefined,
          }
        );

        // Add elevation hover functionality
        polyline.on('mouseover', async (e: L.LeafletMouseEvent) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          
          const coastalDistance = Math.sqrt(
            Math.pow(lat - 6.9087, 2) + Math.pow(lng - 122.0547, 2)
          ) * 111000;
          
          const estimatedElevation = Math.max(0, Math.min(200, coastalDistance / 50));
          
          const popup = L.popup({
            closeButton: false,
            className: 'elevation-popup'
          })
          .setLatLng(e.latlng)
          .setContent(`
            <div style="text-align: center; font-size: 12px;">
              <strong>📍 ${name}</strong><br>
              Lat: ${lat.toFixed(5)}<br>
              Lng: ${lng.toFixed(5)}<br>
              <strong>⛰️ Elevation</strong><br>
              ~${estimatedElevation.toFixed(1)}m above sea level<br>
              <strong>Distance:</strong> ${route.distance}<br>
              <strong>Time:</strong> ${route.time}
            </div>
          `)
          .openOn(mapRef.current!);
          
          (polyline as any)._hoverPopup = popup;
        });

        polyline.on('mouseout', () => {
          if ((polyline as any)._hoverPopup && mapRef.current) {
            mapRef.current.closePopup((polyline as any)._hoverPopup);
          }
        });

        if (mapRef.current) {
          polyline.addTo(mapRef.current);
          routeLayersRef.current.push(polyline);
          
          // Fit bounds after all routes are drawn
          if (delay === 6000) { // Last route
            setTimeout(() => {
              if (mapRef.current) {
                const group = new L.FeatureGroup(routeLayersRef.current);
                mapRef.current.fitBounds(group.getBounds().pad(0.1));
              }
            }, 500);
          }
        }
      }, delay);
    }
  };

  // Handle start location input change
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (startLocationInput.length >= 3) {
        const suggestions = await searchLocations(startLocationInput);
        setStartSuggestions(suggestions);
        setShowStartSuggestions(true);
      } else {
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [startLocationInput]);

  // Handle end location input change
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (endLocationInput.length >= 3) {
        const suggestions = await searchLocations(endLocationInput);
        setEndSuggestions(suggestions);
        setShowEndSuggestions(true);
      } else {
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [endLocationInput]);

  // Handle selecting start location
  const handleSelectStartLocation = (location: LocationSuggestion) => {
    setSelectedStartLocation(location);
    setStartLocationInput(location.display_name);
    setStartSuggestions([]);
    setShowStartSuggestions(false);
    setStartPoint({
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon),
    });
  };

  // Handle selecting end location
  const handleSelectEndLocation = (location: LocationSuggestion) => {
    setSelectedEndLocation(location);
    setEndLocationInput(location.display_name);
    setEndSuggestions([]);
    setShowEndSuggestions(false);
    setEndPoint({
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon),
    });
  };

  // Handle find route button click
  const handleFindRoute = async () => {
    if (selectedStartLocation && selectedEndLocation) {
      setShowRoutePlannerModal(false);
      setRouteMode(true);

      // Add markers for start and end points
      if (mapRef.current) {
        const startMarker = L.marker([startPoint!.lat, startPoint!.lng], {
          icon: startIcon,
        })
          .addTo(mapRef.current)
          .bindPopup("Start: " + selectedStartLocation.display_name);

        const endMarker = L.marker([endPoint!.lat, endPoint!.lng], {
          icon: endIcon,
        })
          .addTo(mapRef.current)
          .bindPopup("End: " + selectedEndLocation.display_name);

        markersRef.current.push(startMarker, endMarker);
      }

      try {
        // Generate routes using enhanced flood-aware routing with transport mode
        console.log(`🚦 Generating routes for ${transportationMode}...`);
        const routes = await generateFloodRoutes(startPoint!, endPoint!, transportationMode);

        // Store route details
        setRouteDetails(routes);

        // Use sequential rendering instead of immediate display
        console.log('🎬 Starting sequential route rendering...');
        drawRoutesSequentially({
          safe: routes.safeRoute,
          manageable: routes.manageableRoute,
          prone: routes.proneRoute
        });

        // DON'T show route modal - removed as requested
        // setShowRouteModal(true); // REMOVED - no popup after route generation
        console.log(`✅ All routes generated for ${transportationMode}!`);
        
      } catch (error) {
        console.error("Error generating routes:", error);
        alert("Error generating routes. Please try again.");
      }
    }
  };

  // Use current location for start point
  const useCurrentLocationAsStart = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;

          // Reverse geocode to get location name
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
            );
            const data = await response.json();

            const locationData: LocationSuggestion = {
              display_name: data.display_name || "Current Location",
              lat: lat.toString(),
              lon: lng.toString(),
              place_id: "current",
            };

            handleSelectStartLocation(locationData);
          } catch (error) {
            // Fallback if reverse geocoding fails
            const locationData: LocationSuggestion = {
              display_name: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(
                4
              )})`,
              lat: lat.toString(),
              lon: lng.toString(),
              place_id: "current",
            };

            handleSelectStartLocation(locationData);
          }
        },
        (error) => {
          alert("Unable to get current location: " + error.message);
        }
      );
    } else {
      alert("Geolocation is not supported by this browser");
    }
  };

  // Handle route selection
  const handleRouteSelection = (routeType: "safe" | "manageable" | "prone") => {
    setSelectedRoute(routeType);
    if (routeDetails) {
      const selectedRouteData = routeDetails[routeType + "Route"] as FloodRoute;
      drawRoute(selectedRouteData);
    }
  };

  // Regenerate routes when transportation mode changes
  const handleTransportationModeChange = async (newMode: "car" | "motorcycle" | "walking") => {
    setTransportationMode(newMode);
    
    // If we have existing route details, regenerate them with the new mode
    if (routeDetails && startPoint && endPoint) {
      console.log(`🔄 Regenerating routes for ${newMode.toUpperCase()} mode...`);
      
      try {
        const newRoutes = await generateFloodRoutes(startPoint, endPoint);
        setRouteDetails(newRoutes);
        // setShowRouteModal(true); // Removed - no modal popup
        
        // Clear existing route layers
        routeLayersRef.current.forEach((layer) => {
          if (mapRef.current && mapRef.current.hasLayer(layer)) {
            mapRef.current.removeLayer(layer);
          }
        });
        routeLayersRef.current = [];
        
        console.log(`✅ Routes regenerated for ${newMode} mode!`);
      } catch (error) {
        console.error("Error regenerating routes:", error);
      }
    }
  };

  // Define tile layers with working URLs
  const tileLayers: Record<string, TileLayerConfig> = {
    street: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    terrain: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      options: {
        maxZoom: 17,
        attribution:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      },
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      options: {
        maxZoom: 18,
        attribution:
          "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
      },
    },
    topo: {
      url: "https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=6170aad10dfd42a38d4d8c709a536f38",
      options: {
        maxZoom: 18,
        attribution:
          '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
  };

  // Elevation data functions for terrain display only
  const getElevationData = async (
    lat: number,
    lng: number
  ): Promise<{ elevation: number; slope: number } | null> => {
    try {
      const response = await fetch(
        `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
      );
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const elevation = data.results[0].elevation;
        
        // Calculate approximate slope using nearby points
        const delta = 0.001; // Small offset for slope calculation
        const responses = await Promise.all([
          fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat + delta},${lng}`),
          fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng + delta}`)
        ]);
        
        const [northData, eastData] = await Promise.all(responses.map(r => r.json()));
        
        let slope = 0;
        if (northData.results?.[0] && eastData.results?.[0]) {
          const elevNorth = northData.results[0].elevation;
          const elevEast = eastData.results[0].elevation;
          const deltaElev = Math.sqrt(
            Math.pow(elevNorth - elevation, 2) + Math.pow(elevEast - elevation, 2)
          );
          const distance = delta * 111000; // Convert to meters
          slope = Math.atan(deltaElev / distance) * (180 / Math.PI);
        }
        
        return { elevation: Math.max(0, elevation), slope };
      }
    } catch (error) {
      console.error("Error fetching elevation data:", error);
    }
    return null;
  };

  const getElevationColor = (elevation: number): string => {
    if (elevation < 5) return "#3498db";       // Blue for sea level
    if (elevation < 10) return "#e74c3c";     // Red for very low
    if (elevation < 20) return "#f39c12";     // Orange for low
    if (elevation < 50) return "#f1c40f";     // Yellow for medium-low
    if (elevation < 100) return "#2ecc71";    // Green for medium
    if (elevation < 200) return "#27ae60";    // Dark green for high
    return "#8e44ad";                         // Purple for very high
  };

  // Create smooth terrain overlay using polygon grid
  const createTerrainOverlay = () => {
    if (!mapRef.current) return;

    // Remove existing overlay
    if (terrainOverlayRef.current) {
      mapRef.current.removeLayer(terrainOverlayRef.current);
    }

    const bounds = mapRef.current.getBounds();
    const zoom = mapRef.current.getZoom();
    const center = mapRef.current.getCenter();

    // Create a denser grid for smoother appearance
    const gridResolution = Math.max(5, Math.min(20, Math.floor(zoom * 1.5))); // Adaptive resolution based on zoom
    const latStep = (bounds.getNorth() - bounds.getSouth()) / gridResolution;
    const lngStep = (bounds.getEast() - bounds.getWest()) / gridResolution;

    const terrainLayer = L.layerGroup();

    // Generate grid of rectangles/polygons for smooth coverage
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        const lat = bounds.getSouth() + i * latStep;
        const lng = bounds.getWest() + j * lngStep;
        const nextLat = lat + latStep;
        const nextLng = lng + lngStep;

        // Calculate center of this grid cell for elevation calculation
        const cellCenterLat = lat + latStep / 2;
        const cellCenterLng = lng + lngStep / 2;

        // Calculate distance from coast based on current view
        const distanceFromCoast =
          Math.min(
            Math.abs(cellCenterLat - bounds.getSouth()),
            Math.abs(cellCenterLat - bounds.getNorth()),
            Math.abs(cellCenterLng - bounds.getWest()),
            Math.abs(cellCenterLng - bounds.getEast())
          ) * 111; // Convert to km

        // Calculate distance from center
        const distanceFromCenter =
          Math.sqrt(
            Math.pow(cellCenterLat - center.lat, 2) +
              Math.pow(cellCenterLng - center.lng, 2)
          ) * 111; // Convert to km

        // Dynamic elevation calculation based on position
        let elevation;

        // Coastal areas - low elevation
        if (distanceFromCoast < 2) {
          elevation = Math.random() * 5; // 0-5m
        }
        // Coastal plains
        else if (distanceFromCoast < 5) {
          elevation = 5 + Math.random() * 5; // 5-10m
        }
        // Low plains
        else if (distanceFromCenter < 10) {
          elevation = 10 + Math.random() * 20; // 10-30m
        }
        // City areas
        else if (distanceFromCenter < 20) {
          elevation = 30 + Math.random() * 20; // 30-50m
        }
        // Hills
        else if (distanceFromCenter < 30) {
          elevation = 50 + Math.random() * 50; // 50-100m
        }
        // Mountains
        else {
          elevation = 100 + Math.random() * 200; // 100-300m
        }

        // Add smooth terrain variation using sine waves for more natural appearance
        const terrainNoise =
          (Math.sin(cellCenterLat * 100) * 0.3 +
            Math.cos(cellCenterLng * 100) * 0.3 +
            Math.sin((cellCenterLat + cellCenterLng) * 50) * 0.4) *
          5;

        elevation = Math.max(0, elevation + terrainNoise);

        const color = getElevationColor(elevation);

        // Create a rectangle/polygon for each grid cell
        const rectangle = L.rectangle(
          [
            [lat, lng],
            [nextLat, nextLng],
          ],
          {
            fillColor: color,
            color: color,
            weight: 0,
            fillOpacity: 0.4,
            stroke: false,
          }
        );

        rectangle.addTo(terrainLayer);
      }
    }

    // Add gradient overlay for smoother transitions (using larger semi-transparent patches)
    const smoothingResolution = Math.max(3, gridResolution / 3);
    const smoothLatStep =
      (bounds.getNorth() - bounds.getSouth()) / smoothingResolution;
    const smoothLngStep =
      (bounds.getEast() - bounds.getWest()) / smoothingResolution;

    for (let i = 0; i < smoothingResolution; i++) {
      for (let j = 0; j < smoothingResolution; j++) {
        const lat = bounds.getSouth() + i * smoothLatStep;
        const lng = bounds.getWest() + j * smoothLngStep;
        const nextLat = lat + smoothLatStep;
        const nextLng = lng + smoothLngStep;

        const cellCenterLat = lat + smoothLatStep / 2;
        const cellCenterLng = lng + smoothLngStep / 2;

        // Calculate average elevation for smoother overlay
        const distanceFromCenter =
          Math.sqrt(
            Math.pow(cellCenterLat - center.lat, 2) +
              Math.pow(cellCenterLng - center.lng, 2)
          ) * 111;

        let avgElevation = 30 + distanceFromCenter * 2;
        avgElevation = Math.min(200, avgElevation);

        const color = getElevationColor(avgElevation);

        // Add larger semi-transparent patches for smoothing
        L.rectangle(
          [
            [lat, lng],
            [nextLat, nextLng],
          ],
          {
            fillColor: color,
            color: color,
            weight: 0,
            fillOpacity: 0.2,
            stroke: false,
          }
        ).addTo(terrainLayer);
      }
    }

    terrainOverlayRef.current = terrainLayer;
    terrainLayer.addTo(mapRef.current);
  };

  // Update overlay when map moves (for continuous coverage)
  useEffect(() => {
    if (!mapRef.current || !showTerrainOverlay) return;

    const updateOverlay = () => {
      if (showTerrainOverlay) {
        createTerrainOverlay();
      }
    };

    mapRef.current.on("moveend", updateOverlay);
    mapRef.current.on("zoomend", updateOverlay);

    return () => {
      if (mapRef.current) {
        mapRef.current.off("moveend", updateOverlay);
        mapRef.current.off("zoomend", updateOverlay);
      }
    };
  }, [showTerrainOverlay]);

  // Handle terrain overlay toggle
  useEffect(() => {
    if (showTerrainOverlay && mapRef.current) {
      createTerrainOverlay();
    } else if (terrainOverlayRef.current) {
      mapRef.current.removeLayer(terrainOverlayRef.current);
      terrainOverlayRef.current = null;
    }
  }, [showTerrainOverlay]);

  // Auto-enable terrain overlay when switching to terrain map
  useEffect(() => {
    if (mapLayer === "terrain") {
      setShowTerrainOverlay(true);
    }
  }, [mapLayer]);

  // Initialize map and controls
  useEffect(() => {
    // Add global functions for popup buttons
    (window as any).setAsStart = (lat: number, lng: number, address: string) => {
      const locationData: LocationSuggestion = {
        display_name: address,
        lat: lat.toString(),
        lon: lng.toString(),
        place_id: `clicked_${Date.now()}`,
      };
      handleSelectStartLocation(locationData);
      if (locationPopupRef.current && mapRef.current) {
        mapRef.current.closePopup(locationPopupRef.current);
      }
    };

    (window as any).setAsEnd = (lat: number, lng: number, address: string) => {
      const locationData: LocationSuggestion = {
        display_name: address,
        lat: lat.toString(),
        lon: lng.toString(),
        place_id: `clicked_${Date.now()}`,
      };
      handleSelectEndLocation(locationData);
      if (locationPopupRef.current && mapRef.current) {
        mapRef.current.closePopup(locationPopupRef.current);
      }
    };

    const map = L.map("map", {
      zoomControl: false, // Disable default zoom control to add it in custom position
    }).setView([6.9111, 122.0794], 13); // Centered on Zamboanga City
    mapRef.current = map;

    // Add map click handler for location details
    map.on('click', handleMapClick);

    // Get current location immediately when map loads
    getCurrentLocation();

    // Initialize all tile layers
    Object.keys(tileLayers).forEach((layerName) => {
      layersRef.current[layerName] = L.tileLayer(
        tileLayers[layerName].url,
        tileLayers[layerName].options
      );
    });

    // Add default layer
    layersRef.current[mapLayer].addTo(map);

    // 1. FIRST: Add geocoder (search bar)
    const geocoder = (L.Control as any)
      .geocoder({
        defaultMarkGeocode: false,
        position: "topleft",
        placeholder: "Search in Zamboanga City...",
        collapsed: false,
      })
      .on("markgeocode", function (e: any) {
        const latlng = e.geocode.center;
        map.setView(latlng, 16);
      })
      .addTo(map);

    // 2. SECOND: Add flood-aware routing button control
    const RoutingBtn = L.Control.extend({
      options: {
        position: "topleft",
      },
      onAdd: function () {
        const btn = L.DomUtil.create("button", "leaflet-control-custom");

        btn.style.background = "#451ae0ff";
        btn.style.border = "2px solid #190fd8ff";
        btn.style.width = "170px";
        btn.style.height = "37px";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "8px";
        btn.style.display = "flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.gap = "6px";
        btn.style.marginTop = "10px";

        const icon = L.DomUtil.create("img", "", btn);
        icon.src = "/icons/circle.png";
        icon.style.width = "24px";
        icon.style.height = "24px";

        const text = L.DomUtil.create("span", "", btn);
        text.innerText = "Flood Routes";
        text.style.fontSize = "14px";
        text.style.color = "#ffffffff";
        text.style.fontWeight = "bold";

        btn.onclick = (e: Event) => {
          e.stopPropagation();
          setShowRoutePlannerModal(true);
          setIsTerrainMode(false);
        };

        return btn;
      },
    });
    const routingBtn = new RoutingBtn({ position: "topleft" });
    map.addControl(routingBtn);

    // 3. THIRD: Add zoom controls
    const zoomControl = new L.Control.Zoom({
      position: "topleft",
    });
    map.addControl(zoomControl);

    // 4. FOURTH: Add collapsible menu button (same as before but removed routing-related parts)
    const CollapsibleMenuBtn = L.Control.extend({
      options: { position: "topleft" },
      onAdd: function () {
        const container = L.DomUtil.create(
          "div",
          "leaflet-bar leaflet-control collapsible-control"
        );

        container.style.background = "transparent";
        container.style.border = "0";
        container.style.boxShadow = "none";
        container.style.overflow = "visible";

        // Main toggle button
        const toggleBtn = L.DomUtil.create(
          "button",
          "leaflet-control-custom",
          container
        );
        toggleBtn.style.cssText = `
            background: #451ae0ff;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid #190fd8ff;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            box-shadow: 0 0 6px rgba(36, 33, 69, 0.2);
            margin-bottom: 5px;
            outline: none;
          `;

        const toggleIcon = document.createElement("span");
        toggleIcon.innerText = "⋯";
        toggleIcon.style.cssText = `
            color: white;
            font-size: 20px;
            font-weight: bold;
            transform: rotate(90deg);
          `;
        toggleBtn.appendChild(toggleIcon);
        toggleBtn.title = "More Options";

        // Menu container
        const menuContainer = L.DomUtil.create("div", "", container);
        menuContainer.style.cssText = `
            display: none;
            flex-direction: column;
            gap: 5px;
            opacity: 0;
            transform: translateY(-10px);
            transition: all 0.3s ease;
          `;

        let isMenuOpen = false;

        // Helper to style sub-buttons consistently
        const styleSubBtn = (btn) => {
          btn.style.cssText = `
              background: #451ae0ff;
              width: 40px;
              height: 40px;
              border-radius: 50%;
              cursor: pointer;
              border: 2px solid #190fd8ff;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              outline: none;
            `;
          btn.addEventListener("focus", () => (btn.style.outline = "none"));
        };

        // 1. Location button
        const locationBtn = L.DomUtil.create(
          "button",
          "leaflet-control-custom",
          menuContainer
        );
        styleSubBtn(locationBtn);
        const locationIcon = document.createElement("img");
        locationIcon.src = "/icons/location.png";
        locationIcon.style.cssText = `
            width: 24px;
            height: 24px;
            filter: brightness(0) invert(1);
          `;
        locationBtn.appendChild(locationIcon);
        locationBtn.title = "Use My Location";

        // 2. Terrain analysis button
        const terrainBtn = L.DomUtil.create(
          "button",
          "leaflet-control-custom",
          menuContainer
        );
        styleSubBtn(terrainBtn);
        const terrainIcon = document.createElement("img");
        terrainIcon.src = "/icons/terrain.png";
        terrainIcon.style.cssText = `
            width: 24px;
            height: 24px;
            filter: brightness(0) invert(1);
          `;
        terrainBtn.appendChild(terrainIcon);
        terrainBtn.title = "Terrain Analysis";

        // 3. Map view toggle button
        const mapViewBtn = L.DomUtil.create(
          "button",
          "leaflet-control-custom",
          menuContainer
        );
        styleSubBtn(mapViewBtn);
        const mapViewIcon = document.createElement("img");
        mapViewIcon.src = "/icons/globe.png";
        mapViewIcon.style.cssText = `width: 24px; height: 24px;`;
        mapViewBtn.appendChild(mapViewIcon);
        mapViewBtn.title = "Toggle Map View";

        // Toggle menu function
        const toggleMenu = () => {
          isMenuOpen = !isMenuOpen;
          if (isMenuOpen) {
            menuContainer.style.display = "flex";
            setTimeout(() => {
              menuContainer.style.opacity = "1";
              menuContainer.style.transform = "translateY(0)";
            }, 10);
            toggleIcon.style.transform = "rotate(90deg) scale(1.1)";
            toggleBtn.style.background = "#5a2ef0ff";
          } else {
            menuContainer.style.opacity = "0";
            menuContainer.style.transform = "translateY(-10px)";
            setTimeout(() => (menuContainer.style.display = "none"), 300);
            toggleIcon.style.transform = "rotate(90deg) scale(1)";
            toggleBtn.style.background = "#451ae0ff";
          }
        };

        // Event handlers
        toggleBtn.onclick = (e) => {
          e.stopPropagation();
          toggleMenu();
        };

        // Location button functionality
        locationBtn.onclick = (e) => {
          e.stopPropagation();
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
              const latlng = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              };
              mapRef.current?.setView([latlng.lat, latlng.lng], 15);
            });
          } else {
            alert("Geolocation not supported");
          }
        };

        // Terrain button functionality
        terrainBtn.onclick = (e: Event) => {
          e.stopPropagation();
          setIsTerrainMode((prev) => !prev);
          setRouteMode(false);
        };

        // Map view toggle functionality
        let currentLayerIndex = 0;
        const layers = ["street", "satellite", "topo"];

        mapViewBtn.onclick = (e: Event) => {
          e.stopPropagation();
          currentLayerIndex = (currentLayerIndex + 1) % layers.length;
          const nextLayer = layers[currentLayerIndex];
          setMapLayer(nextLayer);

          const titles = {
            street: "Street Map",
            satellite: "Satellite View",
            topo: "Topographic View",
          };
          mapViewBtn.title = titles[nextLayer] || nextLayer;
        };

        return container;
      },
    });

    const collapsibleMenuBtn = new CollapsibleMenuBtn({ position: "topleft" });
    map.addControl(collapsibleMenuBtn);

    // 5. Add terrain overlay toggle button
    const TerrainOverlayBtn = L.Control.extend({
      options: {
        position: "topright",
      },
      onAdd: function () {
        const btn = L.DomUtil.create(
          "button",
          "leaflet-bar leaflet-control leaflet-control-custom"
        );

        btn.style.cssText = `
            background: #ffffff;
            border: 2px solid #000000;
            width: 160px;
            height: 37px;
            cursor: pointer;
            border-radius: 8px;
            display: flex;
            align-items: center;
            padding: 0 12px;
            gap: 8px;
            margin: 10px;
          `;

        const container = document.createElement("div");
        container.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
          `;

        // Add mountain icon
        const icon = document.createElement("img");
        icon.src = "/icons/mountain.png";
        icon.style.cssText = `
            width: 20px;
            height: 20px;
            object-fit: contain;
          `;

        // Add text
        const text = document.createElement("span");
        text.innerText = "Show Terrain";

        // Append elements
        container.appendChild(icon);
        container.appendChild(text);
        btn.appendChild(container);

        btn.onclick = (e: Event) => {
          e.stopPropagation();
          setShowTerrainOverlay((prev) => {
            text.innerText = !prev ? "Hide Terrain" : "Show Terrain";
            btn.style.background = !prev ? "#f0f0f0" : "#ffffff";
            return !prev;
          });
        };

        return btn;
      },
    });
    const terrainOverlayBtn = new TerrainOverlayBtn();
    map.addControl(terrainOverlayBtn);

    // 6. Add compass button (current location) in bottom right
    const CompassBtn = L.Control.extend({
      options: {
        position: "bottomright",
      },
      onAdd: function () {
        const container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
        const button = L.DomUtil.create("button", "leaflet-control-custom", container);
        
        button.innerHTML = "🧭";
        button.title = "Go to my current location";
        button.style.cssText = `
          width: 34px;
          height: 34px;
          background: white;
          border: 2px solid #ccc;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 5px rgba(0,0,0,0.4);
          transition: all 0.2s ease;
        `;
        
        button.onmouseover = () => {
          button.style.background = "#f0f0f0";
          button.style.borderColor = "#999";
        };
        
        button.onmouseout = () => {
          button.style.background = "white";
          button.style.borderColor = "#ccc";
        };
        
        L.DomEvent.on(button, "click", (e) => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          getCurrentLocation();
        });
        
        return container;
      },
    });
    const compassBtn = new CompassBtn();
    map.addControl(compassBtn);

    return () => {
      map.remove();
      if (routingControlRef.current) routingControlRef.current.remove();
      // Clean up global functions
      delete (window as any).setAsStart;
      delete (window as any).setAsEnd;
    };
  }, []);

  // Handle layer switching
  useEffect(() => {
    if (!mapRef.current || !layersRef.current) return;

    // Remove current layer
    Object.values(layersRef.current).forEach((layer) => {
      if (mapRef.current!.hasLayer(layer)) {
        mapRef.current!.removeLayer(layer);
      }
    });

    // Add new layer
    layersRef.current[mapLayer].addTo(mapRef.current);
  }, [mapLayer]);

  // Reset route
  const resetRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteDetails(null);
    setShowRouteModal(false);
    setRouteMode(false);
    setSelectedRoute(null);
    setStartLocationInput("");
    setEndLocationInput("");
    setSelectedStartLocation(null);
    setSelectedEndLocation(null);
    setStartSuggestions([]);
    setEndSuggestions([]);
    setShowStartSuggestions(false);
    setShowEndSuggestions(false);

    // Clear markers
    markersRef.current.forEach((marker) => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    // Clear route layers
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    // Clear terrain marker
    if (terrainPopupRef.current) {
      mapRef.current!.removeLayer(terrainPopupRef.current);
      terrainPopupRef.current = null;
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "15px",
          display: "flex",
          gap: "10px",
          alignItems: "center",
        }}
      >
        {routeMode && routeDetails && (
          <div
            style={{
              background: "#e3f2fd",
              padding: "8px 12px",
              borderRadius: "4px",
              flexGrow: 1,
            }}
          >
            <p style={{ margin: 0 }}>
              Flood-aware routes from {routeDetails.startName} to{" "}
              {routeDetails.endName}
            </p>
          </div>
        )}

        {isTerrainMode && (
          <div
            style={{
              background: "#f0f8e6",
              display: "flex",
              padding: "8px 12px",
              flexDirection: "column",
              borderRadius: "4px",
              gap: "3px",
              flexGrow: 1,
            }}
          >
            <p style={{ margin: 0 }}>
              Click on the map to analyze terrain elevation
            </p>
          </div>
        )}

        {(startPoint || endPoint || isTerrainMode || showTerrainOverlay) && (
          <button
            onClick={resetRoute}
            style={{
              background: "#e74c3c",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Clear All
          </button>
        )}
      </div>

      <div style={{ position: "relative" }}>
        {/* Alert Banner */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            borderRadius: "1px 1px 0 0",
            backgroundColor: "#d7913cff",
            overflow: "hidden",
            color: "#000000",
          }}
        >
          <AlertBanner />
        </div>

        <div style={{ position: "relative", marginTop: "60px" }}>
          <div
            id="map"
            style={{
              height: "500px",
              width: "100%",
              borderRadius: "10px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
              marginBottom: "20px",
            }}
          ></div>
        </div>

        {/* Action Buttons */}
        {onModalOpen && (
          <div className="action-buttons-container">
            <button
              onClick={() => setShowWeatherDashboard(true)}
              className="action-button weather-button"
              style={{
                backgroundColor: "#3B82F6",
                color: "white",
                marginBottom: "10px",
              }}
            >
              Weather Dashboard
            </button>

            <button
              onClick={() => onModalOpen("report")}
              className="action-button report-button"
            >
              Report Issue
            </button>

            <button
              onClick={() => onModalOpen("emergency")}
              className="action-button emergency-button"
            >
              Emergency
            </button>
          </div>
        )}

       {/* Elevation Legend */}
{showTerrainOverlay && (
  <div style={{
    position: 'absolute',
    bottom: '30px',
    right: '20px',
    background: 'rgba(255, 255, 255, 0.85)',
    padding: '10px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
    fontSize: '0.8em',
    zIndex: 1000,
    maxWidth: '200px'
  }}>
    <h4 style={{ margin: '0 0 8px 0', color: '#2c3e50' }}>
      🌈 Terrain Elevation
    </h4>
    
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#0066CC', borderRadius: '2px' }}></div>
        <span>0-5m (Sea Level)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#0099CC', borderRadius: '2px' }}></div>
        <span>5-10m (Coastal)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#00CC99', borderRadius: '2px' }}></div>
        <span>10-20m (Low Plains)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#00CC66', borderRadius: '2px' }}></div>
        <span>20-30m (Plains)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#33CC33', borderRadius: '2px' }}></div>
        <span>30-40m (Low Hills)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#66CC00', borderRadius: '2px' }}></div>
        <span>40-50m (Hills)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#99CC00', borderRadius: '2px' }}></div>
        <span>50-70m (Mid Hills)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#CCCC00', borderRadius: '2px' }}></div>
        <span>70-90m (High Hills)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#CC9900', borderRadius: '2px' }}></div>
        <span>90-110m (Low Mountains)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#CC6600', borderRadius: '2px' }}></div>
        <span>110-150m (Mountains)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#CC3300', borderRadius: '2px' }}></div>
        <span>150-200m (High Mountains)</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '12px', height: '12px', background: '#CC0000', borderRadius: '2px' }}></div>
        <span>200m+ (Peaks)</span>
      </div>
    </div>
  </div>
        )}

        {routeMode && (
          <div
            style={{
              position: "absolute",
              bottom: "30px",
              left: "20px",
              background: "rgba(255, 255, 255, 0.9)",
              padding: "10px",
              borderRadius: "8px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
              zIndex: 1000,
            }}
          >
            <h4 style={{ margin: "0 0 8px 0", fontSize: "14px" }}>
              Route Options
            </h4>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "5px" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "3px",
                    background: "#27ae60",
                  }}
                ></div>
                <span style={{ fontSize: "12px" }}>Safe Route</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "3px",
                    background: "#f39c12",
                  }}
                ></div>
                <span style={{ fontSize: "12px" }}>Manageable Route</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "3px",
                    background: "#e74c3c",
                    borderStyle: "dashed",
                  }}
                ></div>
                <span style={{ fontSize: "12px" }}>Flood-Prone Route</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Route Planner Modal */}
      {showRoutePlannerModal && (
        <RouteModal
          onClose={() => setShowRoutePlannerModal(false)}
          startLocationInput={startLocationInput}
          endLocationInput={endLocationInput}
          setStartLocationInput={setStartLocationInput}
          setEndLocationInput={setEndLocationInput}
          startSuggestions={startSuggestions}
          endSuggestions={endSuggestions}
          showStartSuggestions={showStartSuggestions}
          showEndSuggestions={showEndSuggestions}
          setShowStartSuggestions={setShowStartSuggestions}
          setShowEndSuggestions={setShowEndSuggestions}
          handleSelectStartLocation={handleSelectStartLocation}
          handleSelectEndLocation={handleSelectEndLocation}
          useCurrentLocationAsStart={useCurrentLocationAsStart}
          selectedStartLocation={selectedStartLocation}
          selectedEndLocation={selectedEndLocation}
          handleFindRoute={handleFindRoute}
          // Add these back temporarily to prevent crashes:
          routeOptions={{
            avoidFloods: false,
            highGround: false,
            fastest: true,
            safest: false,
          }}
          setRouteOptions={() => {}} // Empty function since we're not using it
          // NEW: Transportation mode props
          transportationMode={transportationMode}
          setTransportationMode={handleTransportationModeChange}
        />
      )}

      {/* Terrain Data Modal */}
      {showTerrainData && terrainData && (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "10px",
            boxShadow: "0 5px 20px rgba(0,0,0,0.2)",
            padding: "20px",
            marginTop: "20px",
            position: "relative",
            border: "2px solid #27ae60",
          }}
        >
          <button
            onClick={() => setShowTerrainData(false)}
            style={{
              position: "absolute",
              top: "15px",
              right: "15px",
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#888",
              fontWeight: "bold",
            }}
          >
            ×
          </button>

          <h2
            style={{
              marginTop: "0",
              marginBottom: "15px",
              color: "#27ae60",
              borderBottom: "2px solid #f0f0f0",
              paddingBottom: "10px",
            }}
          >
            🗻 Terrain Analysis
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "15px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                background: "#f8f9fa",
                padding: "15px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "5px" }}>📏</div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#2c3e50",
                }}
              >
                {terrainData.elevation}m
              </div>
              <div style={{ fontSize: "0.9rem", color: "#666" }}>Elevation</div>
            </div>

            <div
              style={{
                background: "#f8f9fa",
                padding: "15px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "5px" }}>⛰️</div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#2c3e50",
                }}
              >
                {terrainData.slope}°
              </div>
              <div style={{ fontSize: "0.9rem", color: "#666" }}>Slope</div>
            </div>

            <div
              style={{
                background: "#f8f9fa",
                padding: "15px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "5px" }}>💧</div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color:
                    terrainData.floodRisk === "High"
                      ? "#e74c3c"
                      : terrainData.floodRisk === "Medium"
                      ? "#f39c12"
                      : "#27ae60",
                }}
              >
                {terrainData.floodRisk}
              </div>
              <div style={{ fontSize: "0.9rem", color: "#666" }}>
                Flood Risk
              </div>
            </div>

            <div
              style={{
                background: "#f8f9fa",
                padding: "15px",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "2rem", marginBottom: "5px" }}>🌍</div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#2c3e50",
                }}
              >
                {terrainData.terrainType}
              </div>
              <div style={{ fontSize: "0.9rem", color: "#666" }}>
                Terrain Type
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#e8f5e8",
              padding: "15px",
              borderRadius: "8px",
              borderLeft: "4px solid #27ae60",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#2c3e50" }}>
              📍 Location Details
            </h4>
            <p style={{ margin: "0", fontSize: "0.9rem", color: "#666" }}>
              <strong>Coordinates:</strong> {terrainData.lat}, {terrainData.lng}
            </p>
            {terrainData.floodRisk === "High" && (
              <p
                style={{
                  margin: "10px 0 0 0",
                  fontSize: "0.9rem",
                  color: "#e74c3c",
                }}
              >
                ⚠️ <strong>Warning:</strong> This area has high flood risk due
                to low elevation.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Flood-Risk Route Details Modal */}
      {showRouteModal && routeDetails && (
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "10px",
            boxShadow: "0 5px 20px rgba(0,0,0,0.2)",
            padding: "20px",
            marginTop: "20px",
            position: "relative",
          }}
        >
          <button
            onClick={() => setShowRouteModal(false)}
            style={{
              position: "absolute",
              top: "15px",
              right: "15px",
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#888",
              fontWeight: "bold",
            }}
          >
            ×
          </button>

          <h2
            style={{
              marginTop: "0",
              marginBottom: "15px",
              color: "#2c3e50",
              borderBottom: "2px solid #f0f0f0",
              paddingBottom: "10px",
            }}
          >
            🌊 Flood-Risk Route Options
          </h2>

          {/* Transportation Mode Display */}
          <div
            style={{
              background: "#667eea",
              color: "white",
              padding: "10px 15px",
              borderRadius: "8px",
              marginBottom: "15px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              fontSize: "14px",
              fontWeight: "600",
            }}
          >
            <span style={{ fontSize: "20px" }}>
              {transportationMode === "car" && "🚗"}
              {transportationMode === "motorcycle" && "🏍️"}
              {transportationMode === "walking" && "🚶"}
            </span>
            <span>
              Routes optimized for {transportationMode === "car" ? "Car" : 
                                  transportationMode === "motorcycle" ? "Motorcycle" : 
                                  "Walking"}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "20px",
              background: "#f8f9fa",
              padding: "15px",
              borderRadius: "8px",
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 5px 0", color: "#27ae60" }}>From:</h3>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                {routeDetails.startName}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <h3 style={{ margin: "0 0 5px 0", color: "#e74c3c" }}>To:</h3>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                {routeDetails.endName}
              </p>
            </div>
          </div>

          {/* Route Options */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}
          >
            {/* Safe Route */}
            <div
              style={{
                border:
                  selectedRoute === "safe"
                    ? "3px solid #27ae60"
                    : "2px solid #ddd",
                borderRadius: "8px",
                padding: "15px",
                cursor: "pointer",
                background: selectedRoute === "safe" ? "#f8fff8" : "white",
                transition: "all 0.3s ease",
              }}
              onClick={() => handleRouteSelection("safe")}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      background: routeDetails.safeRoute.color,
                      borderRadius: "50%",
                    }}
                  ></div>
                  <h3 style={{ margin: 0, color: "#27ae60" }}>🛡️ Safe Route</h3>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
                    {routeDetails.safeRoute.distance}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#666" }}>
                    {routeDetails.safeRoute.time}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "10px" }}>
                <span
                  style={{
                    background: "#27ae60",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                >
                  {routeDetails.safeRoute.riskLevel}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                {routeDetails.safeRoute.description}
              </p>
            </div>

            {/* Manageable Route */}
            <div
              style={{
                border:
                  selectedRoute === "manageable"
                    ? "3px solid #f39c12"
                    : "2px solid #ddd",
                borderRadius: "8px",
                padding: "15px",
                cursor: "pointer",
                background:
                  selectedRoute === "manageable" ? "#fffbf0" : "white",
                transition: "all 0.3s ease",
              }}
              onClick={() => handleRouteSelection("manageable")}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      background: routeDetails.manageableRoute.color,
                      borderRadius: "50%",
                    }}
                  ></div>
                  <h3 style={{ margin: 0, color: "#f39c12" }}>
                    ⚠️ Manageable Route
                  </h3>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
                    {routeDetails.manageableRoute.distance}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#666" }}>
                    {routeDetails.manageableRoute.time}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "10px" }}>
                <span
                  style={{
                    background: "#f39c12",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                >
                  {routeDetails.manageableRoute.riskLevel}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                {routeDetails.manageableRoute.description}
              </p>
            </div>

            {/* Prone Route */}
            <div
              style={{
                border:
                  selectedRoute === "prone"
                    ? "3px solid #e74c3c"
                    : "2px solid #ddd",
                borderRadius: "8px",
                padding: "15px",
                cursor: "pointer",
                background: selectedRoute === "prone" ? "#fff5f5" : "white",
                transition: "all 0.3s ease",
              }}
              onClick={() => handleRouteSelection("prone")}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      background: routeDetails.proneRoute.color,
                      borderRadius: "50%",
                    }}
                  ></div>
                  <h3 style={{ margin: 0, color: "#e74c3c" }}>
                    🚨 Flood-Prone Route
                  </h3>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.2rem", fontWeight: "bold" }}>
                    {routeDetails.proneRoute.distance}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#666" }}>
                    {routeDetails.proneRoute.time}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "10px" }}>
                <span
                  style={{
                    background: "#e74c3c",
                    color: "white",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                >
                  {routeDetails.proneRoute.riskLevel}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                {routeDetails.proneRoute.description}
              </p>
            </div>
          </div>

          {selectedRoute && (
            <div
              style={{
                marginTop: "20px",
                padding: "15px",
                background: "#e8f4f8",
                borderRadius: "8px",
                borderLeft: "4px solid #3498db",
              }}
            >
              <h4 style={{ margin: "0 0 10px 0", color: "#2c3e50" }}>
                📍 Selected Route:{" "}
                {selectedRoute.charAt(0).toUpperCase() + selectedRoute.slice(1)}{" "}
                Route
              </h4>
              <p style={{ margin: "0", fontSize: "0.9rem", color: "#666" }}>
                Route displayed on map. The {selectedRoute} route is now
                highlighted in{" "}
                {selectedRoute === "safe"
                  ? "green"
                  : selectedRoute === "manageable"
                  ? "orange"
                  : "red"}
                .
              </p>
            </div>
          )}

          <div
            style={{
              marginTop: "20px",
              padding: "15px",
              background: "#fff3cd",
              borderRadius: "8px",
              borderLeft: "4px solid #ffc107",
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#856404" }}>
              💡 Flood Safety Tips
            </h4>
            <ul
              style={{
                margin: "0",
                paddingLeft: "20px",
                fontSize: "0.9rem",
                color: "#856404",
              }}
            >
              <li>Check weather conditions before traveling</li>
              <li>Avoid traveling during heavy rains or flood warnings</li>
              <li>Keep emergency contacts handy</li>
              <li>Monitor local flood alerts and updates</li>
            </ul>
          </div>
        </div>
      )}

      {/* Weather Dashboard Modal */}
      <WeatherDashboard
        isOpen={showWeatherDashboard}
        onClose={() => setShowWeatherDashboard(false)}
      />
    </div>
  );
};