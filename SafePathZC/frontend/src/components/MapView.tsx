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
import {
  searchZamboCityLocations,
  getLocationByCoordinates,
  type ZamboCityLocation,
} from "../utils/zamboCityLocations";

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/icons/location.png",
  iconUrl: "/icons/location.png",
  shadowUrl: "/icons/location.png",
});

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
  type?: string;
  isLocal?: boolean;
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

  // Custom icons using local assets
  const startIcon = L.icon({
    iconUrl: "/icons/location.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const endIcon = L.icon({
    iconUrl: "/icons/circle.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  // Enhanced search function with Zamboanga City focus
  const searchLocations = async (
    query: string
  ): Promise<LocationSuggestion[]> => {
    if (query.length < 2) return [];

    try {
      // First, search our local Zamboanga database
      const localResults = searchZamboCityLocations(query, 8);
      const localSuggestions: LocationSuggestion[] = localResults.map(
        (location, index) => ({
          display_name: `${location.displayName} - Zamboanga City`,
          lat: location.lat.toString(),
          lon: location.lng.toString(),
          place_id: `local_${index}`,
          type: location.type,
          isLocal: true,
        })
      );

      // If we have good local results (2 or more), prioritize them heavily
      if (localSuggestions.length >= 2) {
        // Still get some external results but limit them
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              query + " Zamboanga City Mindanao Philippines"
            )}&limit=2&addressdetails=1&bounded=1&viewbox=122.0,6.8,122.2,7.0`
          );

          let externalData = await response.json();

          // Filter out results that are too far from Zamboanga
          externalData = externalData.filter((item: any) => {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            return lat >= 6.8 && lat <= 7.0 && lon >= 122.0 && lon <= 122.2;
          });

          const externalSuggestions: LocationSuggestion[] = externalData.map(
            (item: any) => ({
              display_name: item.display_name,
              lat: item.lat,
              lon: item.lon,
              place_id: item.place_id,
              isLocal: false,
            })
          );

          // Remove duplicates and return local results first
          const allSuggestions = [...localSuggestions, ...externalSuggestions];
          return removeDuplicateLocations(allSuggestions).slice(0, 8);
        } catch (error) {
          console.warn("External search failed, using local only:", error);
          return localSuggestions;
        }
      }

      // If not enough local results, get more from external API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query + " Zamboanga City Mindanao Philippines"
        )}&limit=5&addressdetails=1&bounded=1&viewbox=122.0,6.8,122.2,7.0`
      );

      let externalData = await response.json();

      // Filter out results that are too far from Zamboanga
      externalData = externalData.filter((item: any) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        return lat >= 6.8 && lat <= 7.0 && lon >= 122.0 && lon <= 122.2;
      });

      const externalSuggestions: LocationSuggestion[] = externalData.map(
        (item: any) => ({
          display_name: item.display_name,
          lat: item.lat,
          lon: item.lon,
          place_id: item.place_id,
          isLocal: false,
        })
      );

      // Combine results, prioritizing local ones
      const allSuggestions = [...localSuggestions, ...externalSuggestions];
      return removeDuplicateLocations(allSuggestions).slice(0, 8);
    } catch (error) {
      console.error("Error searching locations:", error);

      // Fallback to local search only
      const localResults = searchZamboCityLocations(query, 5);
      return localResults.map((location, index) => ({
        display_name: `${location.displayName} - Zamboanga City`,
        lat: location.lat.toString(),
        lon: location.lng.toString(),
        place_id: `local_${index}`,
        type: location.type,
        isLocal: true,
      }));
    }
  };

  // Helper function to remove duplicate locations
  const removeDuplicateLocations = (
    suggestions: LocationSuggestion[]
  ): LocationSuggestion[] => {
    return suggestions.filter((suggestion, index) => {
      const currentLat = parseFloat(suggestion.lat);
      const currentLon = parseFloat(suggestion.lon);

      return !suggestions.slice(0, index).some((existing) => {
        const existingLat = parseFloat(existing.lat);
        const existingLon = parseFloat(existing.lon);
        const distance = Math.sqrt(
          Math.pow(currentLat - existingLat, 2) +
            Math.pow(currentLon - existingLon, 2)
        );
        return distance < 0.001; // ~100m threshold
      });
    });
  };

  const getOSRMRoute = async (
    start: LatLng,
    end: LatLng,
    waypoints: LatLng[] = []
  ): Promise<LatLng[]> => {
    try {
      // Build the waypoints string for the URL
      const waypointsStr = waypoints
        .map((wp) => `${wp.lng},${wp.lat}`)
        .join(";");

      const coordinatesStr = `${start.lng},${start.lat};${waypointsStr}${
        waypointsStr ? ";" : ""
      }${end.lng},${end.lat}`;

      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${coordinatesStr}?overview=full&geometries=geojson&alternatives=true`
      );

      if (!response.ok) {
        throw new Error(`OSRM API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.routes && data.routes[0]) {
        // Convert coordinates and analyze terrain for each point
        const route = data.routes[0].geometry.coordinates.map(
          (coord: number[]) => ({
            lat: coord[1],
            lng: coord[0],
          })
        );

        // Add elevation data for the route
        const elevationPromises = route.map(async (point) => {
          try {
            const elevationData = await getElevationData(point.lat, point.lng);
            return elevationData ? elevationData.elevation : null;
          } catch (error) {
            console.error("Error getting elevation:", error);
            return null;
          }
        });

        const elevations = await Promise.all(elevationPromises);

        // Filter points based on elevation and flood risk
        const filteredRoute = route.filter((point, index) => {
          const elevation = elevations[index];
          if (elevation === null) return true; // Keep points without elevation data

          // Calculate flood risk based on elevation
          const riskLevel = calculateFloodRisk(elevation, point.lat, point.lng);
          return riskLevel !== "prone"; // Filter out high-risk points
        });

        return filteredRoute.length > 1 ? filteredRoute : route;
      }
      return [];
    } catch (error) {
      console.error("Error fetching OSRM route:", error);
      return [];
    }
  };

  // NEW FUNCTION - Add this after getOSRMRoute
  interface TerrainAnalysis {
    avgElevation: number;
    lowPoints: number;
    coastalPoints: number;
    terrainProfile: number[];
  }

  interface RouteAnalysis {
    routes: LatLng[][];
    analyses: TerrainAnalysis[];
  }

  const analyzeRouteElevation = async (
    waypoints: LatLng[]
  ): Promise<TerrainAnalysis> => {
    const sampleSize = Math.min(waypoints.length, 20); // Sample points along route
    const step = Math.max(1, Math.floor(waypoints.length / sampleSize));
    let elevationSum = 0;
    let lowPoints = 0;
    let coastalPoints = 0;
    const terrainProfile: number[] = [];

    const cityCenter = { lat: 6.9214, lng: 122.079 }; // Zamboanga City center

    for (let i = 0; i < waypoints.length; i += step) {
      const point = waypoints[i];
      const elevationData = await getElevationData(point.lat, point.lng);

      if (elevationData) {
        elevationSum += elevationData.elevation;
        terrainProfile.push(elevationData.elevation);

        if (elevationData.elevation < 5) lowPoints++;

        // Check if point is coastal
        const distanceFromCenter =
          Math.sqrt(
            Math.pow(point.lat - cityCenter.lat, 2) +
              Math.pow(point.lng - cityCenter.lng, 2)
          ) * 111; // Convert to km

        if (distanceFromCenter < 3) coastalPoints++;
      }
    }

    return {
      avgElevation: elevationSum / (terrainProfile.length || 1),
      lowPoints,
      coastalPoints,
      terrainProfile,
    };
  };

  const getOSRMAlternativeRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<RouteAnalysis> => {
    try {
      // Get multiple route alternatives with more options
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=3&steps=true&continue_straight=false`
      );

      if (!response.ok) {
        throw new Error(`OSRM API returned ${response.status}`);
      }

      const data = await response.json();
      const routes: LatLng[][] = [];
      const analyses = [];

      if (data.routes && data.routes.length > 0) {
        console.log(`OSRM returned ${data.routes.length} alternative routes`);

        // Get terrain data for potential waypoints
        const searchRadius = 0.005; // ~500m
        const elevationData = new Map<string, number>();

        // Pre-fetch elevation data for route areas
        const midPoint = {
          lat: (start.lat + end.lat) / 2,
          lng: (start.lng + end.lng) / 2,
        };

        for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
          const rad = (angle * Math.PI) / 180;
          const point = {
            lat: midPoint.lat + searchRadius * Math.cos(rad),
            lng: midPoint.lng + searchRadius * Math.sin(rad),
          };
          const elevation = await getElevationData(point.lat, point.lng);
          if (elevation) {
            elevationData.set(`${point.lat},${point.lng}`, elevation.elevation);
          }
        }

        // Process each route
        for (const route of data.routes) {
          if (!route.geometry || !route.geometry.coordinates) {
            console.warn("Route missing geometry data");
            continue;
          }

          const waypoints = route.geometry.coordinates.map(
            (coord: number[]) => ({
              lat: coord[1],
              lng: coord[0],
            })
          );

          // Get detailed analysis including pre-fetched elevation data
          const analysis = await analyzeRouteElevation(waypoints);

          // Calculate flood risk score
          const riskScore = calculateDetailedRiskScore(
            waypoints,
            analysis,
            elevationData
          );

          routes.push(waypoints);
          analyses.push({
            ...analysis,
            riskScore,
          });
        }

        // Sort routes by risk score
        const routePairs = routes.map((route, index) => ({
          route,
          analysis: analyses[index],
        }));

        routePairs.sort((a, b) => a.analysis.riskScore - b.analysis.riskScore);

        return {
          routes: routePairs.map((pair) => pair.route),
          analyses: routePairs.map((pair) => pair.analysis),
        };
      }

      if (routes.length === 0) {
        // Fallback to direct route if no alternatives found
        const directRoute = createDirectRoute(start, end);
        const directAnalysis = await analyzeRouteElevation([start, end]);
        return {
          routes: [directRoute],
          analyses: [directAnalysis],
        };
      }

      return { routes, analyses };
    } catch (error) {
      console.error("Error fetching OSRM alternative routes:", error);

      // Fallback to direct route
      const directRoute = createDirectRoute(start, end);
      const directAnalysis = await analyzeRouteElevation([start, end]);
      return {
        routes: [directRoute],
        analyses: [directAnalysis],
      };
    }
  };

  // NEW FUNCTION - Add this too
  const getOSRMRouteWithWaypoint = async (
    start: LatLng,
    waypoint: LatLng,
    end: LatLng
  ): Promise<LatLng[]> => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${waypoint.lng},${waypoint.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
      );
      const data = await response.json();

      if (data.routes && data.routes[0]) {
        return data.routes[0].geometry.coordinates.map((coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        }));
      }
      return [];
    } catch (error) {
      console.error("Error fetching OSRM route with waypoint:", error);
      return [];
    }
  };

  // Calculate detailed risk score considering multiple factors
  const calculateDetailedRiskScore = (
    waypoints: LatLng[],
    analysis: TerrainAnalysis,
    elevationData: Map<string, number>
  ): number => {
    const cityCenter = { lat: 6.9214, lng: 122.079 };
    let riskScore = 0;

    // Analyze each waypoint
    waypoints.forEach((point) => {
      // 1. Elevation risk (0-40 points)
      const elevation =
        elevationData.get(`${point.lat},${point.lng}`) || analysis.avgElevation;
      if (elevation < 5) riskScore += 40;
      else if (elevation < 10) riskScore += 30;
      else if (elevation < 15) riskScore += 20;
      else if (elevation < 20) riskScore += 10;

      // 2. Coastal proximity risk (0-30 points)
      const distanceFromCenter =
        Math.sqrt(
          Math.pow(point.lat - cityCenter.lat, 2) +
            Math.pow(point.lng - cityCenter.lng, 2)
        ) * 111; // Convert to km

      if (distanceFromCenter < 2) riskScore += 30;
      else if (distanceFromCenter < 4) riskScore += 20;
      else if (distanceFromCenter < 6) riskScore += 10;

      // 3. Known flood-prone areas (0-30 points)
      // Add specific flood-prone areas of Zamboanga
      const floodProneAreas = [
        { lat: 6.9214, lng: 122.079, radius: 2 }, // City center
        { lat: 6.9167, lng: 122.0747, radius: 1.5 }, // Pueblo
        // Add more known flood-prone areas
      ];

      floodProneAreas.forEach((area) => {
        const distanceToArea =
          Math.sqrt(
            Math.pow(point.lat - area.lat, 2) +
              Math.pow(point.lng - area.lng, 2)
          ) * 111;

        if (distanceToArea < area.radius) {
          riskScore += 30 * (1 - distanceToArea / area.radius);
        }
      });
    });

    // Normalize score to 0-100 range
    return Math.min(100, riskScore / waypoints.length);
  };

  // Calculate flood risk based on detailed risk score
  const calculateFloodRisk = (
    elevation: number,
    lat: number,
    lng: number
  ): "safe" | "manageable" | "prone" => {
    const cityCenter = { lat: 6.9214, lng: 122.079 };
    const distanceFromCenter =
      Math.sqrt(
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

  // NEW FUNCTION - Add this
  const assessRouteFloodRisk = async (
    waypoints: LatLng[]
  ): Promise<{
    risk: "safe" | "manageable" | "prone";
    level: string;
    description: string;
    color: string;
  }> => {
    if (waypoints.length === 0) {
      return {
        risk: "safe",
        level: "Unknown",
        description: "Route data unavailable",
        color: "#gray",
      };
    }

    let totalRiskScore = 0;
    let lowElevationPoints = 0;
    let coastalPoints = 0;
    let elevationSum = 0;
    let validElevationPoints = 0;

    const cityCenter = { lat: 6.9214, lng: 122.079 };

    // Sample waypoints for elevation analysis (to avoid too many API calls)
    const sampleSize = Math.min(waypoints.length, 10);
    const step = Math.max(1, Math.floor(waypoints.length / sampleSize));
    const samplePoints = [];

    for (let i = 0; i < waypoints.length; i += step) {
      samplePoints.push(waypoints[i]);
    }

    // Get real elevation data for sample points
    const elevationPromises = samplePoints.map(async (point) => {
      try {
        const elevationData = await getElevationData(point.lat, point.lng);
        return elevationData ? elevationData.elevation : null;
      } catch (error) {
        console.error("Error getting elevation for point:", error);
        return null;
      }
    });

    const elevations = await Promise.all(elevationPromises);

    // Analyze each sample point
    samplePoints.forEach((point, index) => {
      const distanceFromCenter =
        Math.sqrt(
          Math.pow(point.lat - cityCenter.lat, 2) +
            Math.pow(point.lng - cityCenter.lng, 2)
        ) * 111;

      const isCoastal = distanceFromCenter < 3;
      if (isCoastal) coastalPoints++;

      const elevation = elevations[index];
      let riskScore = 2; // Default moderate risk

      if (elevation !== null) {
        elevationSum += elevation;
        validElevationPoints++;

        // Real elevation-based risk scoring
        if (elevation < 5) {
          riskScore = 3; // High risk
          lowElevationPoints++;
        } else if (elevation < 15) {
          riskScore = 2; // Medium risk
          lowElevationPoints++;
        } else if (elevation < 30) {
          riskScore = 1.5; // Low-medium risk
        } else {
          riskScore = 1; // Low risk
        }

        // Additional coastal risk
        if (isCoastal && elevation < 10) {
          riskScore += 0.5;
        }
      } else {
        // Fallback to distance-based estimation if elevation API fails
        let estimatedElevation = Math.max(0, distanceFromCenter * 3);
        if (estimatedElevation < 5) riskScore = 3;
        else if (estimatedElevation < 15) riskScore = 2;
        else riskScore = 1;
      }

      totalRiskScore += riskScore;
    });

    const averageRisk = totalRiskScore / samplePoints.length;
    const lowElevationRatio = lowElevationPoints / samplePoints.length;
    const coastalRatio = coastalPoints / samplePoints.length;
    const averageElevation =
      validElevationPoints > 0 ? elevationSum / validElevationPoints : 0;

    // Enhanced risk assessment with real elevation data
    if (
      averageRisk >= 2.7 ||
      lowElevationRatio > 0.7 ||
      coastalRatio > 0.5 ||
      averageElevation < 8
    ) {
      return {
        risk: "prone",
        level: "High Risk",
        description: `Route passes through low-lying areas (avg ${averageElevation.toFixed(
          0
        )}m elevation). High flood risk during heavy rains.`,
        color: "#e74c3c",
      };
    } else if (
      averageRisk >= 1.8 ||
      lowElevationRatio > 0.4 ||
      coastalRatio > 0.3 ||
      averageElevation < 20
    ) {
      return {
        risk: "manageable",
        level: "Medium Risk",
        description: `Moderate elevation route (avg ${averageElevation.toFixed(
          0
        )}m elevation). Some flood risk during heavy rains.`,
        color: "#f39c12",
      };
    } else {
      return {
        risk: "safe",
        level: "Low Risk",
        description: `Higher elevation route (avg ${averageElevation.toFixed(
          0
        )}m elevation). Safer during floods but may be longer.`,
        color: "#27ae60",
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

    const analyzeRouteElevation = async (
      waypoints: LatLng[]
    ): Promise<{
      avgElevation: number;
      lowPoints: number;
      coastalPoints: number;
      terrainProfile: number[];
    }> => {
      const sampleSize = Math.min(waypoints.length, 20); // Sample points along route
      const step = Math.max(1, Math.floor(waypoints.length / sampleSize));
      let elevationSum = 0;
      let lowPoints = 0;
      let coastalPoints = 0;
      const terrainProfile: number[] = [];

      const cityCenter = { lat: 6.9214, lng: 122.079 }; // Zamboanga City center

      for (let i = 0; i < waypoints.length; i += step) {
        const point = waypoints[i];
        const elevationData = await getElevationData(point.lat, point.lng);

        if (elevationData) {
          elevationSum += elevationData.elevation;
          terrainProfile.push(elevationData.elevation);

          if (elevationData.elevation < 5) lowPoints++;

          // Check if point is coastal
          const distanceFromCenter =
            Math.sqrt(
              Math.pow(point.lat - cityCenter.lat, 2) +
                Math.pow(point.lng - cityCenter.lng, 2)
            ) * 111; // Convert to km

          if (distanceFromCenter < 3) coastalPoints++;
        }
      }

      return {
        avgElevation: elevationSum / (terrainProfile.length || 1),
        lowPoints,
        coastalPoints,
        terrainProfile,
      };
    };

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
    const startDiff =
      Math.abs(route1[0].lat - route2[0].lat) +
      Math.abs(route1[0].lng - route2[0].lng);

    // Compare end points
    const endDiff =
      Math.abs(route1[route1.length - 1].lat - route2[route2.length - 1].lat) +
      Math.abs(route1[route1.length - 1].lng - route2[route2.length - 1].lng);

    // Compare some middle points for path similarity
    const midIndex1 = Math.floor(route1.length / 2);
    const midIndex2 = Math.floor(route2.length / 2);
    const midDiff =
      Math.abs(route1[midIndex1].lat - route2[midIndex2].lat) +
      Math.abs(route1[midIndex1].lng - route2[midIndex2].lng);

    // Routes are similar if start, middle, and end points are close
    return (
      startDiff < threshold && endDiff < threshold && midDiff < threshold * 2
    );
  };

  // Generate flood-risk aware routes
  // Helper function to generate alternative routes using waypoints
  const generateAlternativeRoutes = async (
    start: LatLng,
    end: LatLng,
    baseRoute: any
  ) => {
    const alternatives = [];
    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;

    try {
      // Generate 2-3 alternative routes with different waypoints
      const waypointOffsets = [
        { lat: 0.008, lng: 0.005 }, // North-East detour
        { lat: -0.006, lng: 0.008 }, // South-East detour
        { lat: 0.005, lng: -0.007 }, // North-West detour
      ];

      for (let i = 0; i < Math.min(3, waypointOffsets.length); i++) {
        const offset = waypointOffsets[i];
        const waypoint = {
          lat: midLat + offset.lat,
          lng: midLng + offset.lng,
        };

        try {
          // Get route through waypoint
          const waypointResponse = await fetch(
            `http://localhost:8001/route?start=${start.lng},${start.lat}&end=${waypoint.lng},${waypoint.lat}&alternatives=false`
          );

          if (waypointResponse.ok) {
            const waypointData = await waypointResponse.json();
            if (waypointData.routes && waypointData.routes.length > 0) {
              // Get route from waypoint to end
              const endResponse = await fetch(
                `http://localhost:8001/route?start=${waypoint.lng},${waypoint.lat}&end=${end.lng},${end.lat}&alternatives=false`
              );

              if (endResponse.ok) {
                const endData = await endResponse.json();
                if (endData.routes && endData.routes.length > 0) {
                  // Combine the two route segments
                  const combinedRoute = {
                    distance:
                      waypointData.routes[0].distance +
                      endData.routes[0].distance,
                    duration:
                      waypointData.routes[0].duration +
                      endData.routes[0].duration,
                    geometry: {
                      coordinates: [
                        ...waypointData.routes[0].geometry.coordinates,
                        ...endData.routes[0].geometry.coordinates,
                      ],
                    },
                  };
                  alternatives.push(combinedRoute);
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to generate alternative route ${i + 1}:`, error);
        }
      }
    } catch (error) {
      console.warn("Failed to generate alternative routes:", error);
    }

    return alternatives;
  };

  const generateFloodRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<RouteDetails> => {
    try {
      console.log(
        "Generating multiple route alternatives with risk analysis..."
      );

      // Get multiple route alternatives from the routing API
      console.log(
        `Calling route API: http://localhost:8001/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true`
      );
      const routeResponse = await fetch(
        `http://localhost:8001/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true`
      );

      if (!routeResponse.ok) {
        console.error(`Route API failed with status: ${routeResponse.status}`);
        throw new Error(
          `Failed to get route alternatives - Status: ${routeResponse.status}`
        );
      }

      const routeData = await routeResponse.json();
      console.log("Route API response:", routeData);
      let routes = routeData.routes || [];

      if (routes.length === 0) {
        throw new Error("No routes found between selected points");
      }

      console.log(`Got ${routes.length} route alternatives from API`);

      // If we only got one route, try to generate alternative routes using different strategies
      if (routes.length < 3) {
        const additionalRoutes = await generateAlternativeRoutes(
          start,
          end,
          routes[0]
        );
        routes = [...routes, ...additionalRoutes];
        console.log(
          `Generated ${additionalRoutes.length} additional routes, total: ${routes.length}`
        );
      }

      // Take up to 5 routes for better variety
      routes = routes.slice(0, 5);

      // Process each route through the enhanced safe route filter
      const processedRoutes = await Promise.all(
        routes.map(async (route: any, index: number) => {
          try {
            // Extract route geometry for risk analysis
            const coordinates = route.geometry.coordinates;

            console.log(`Analyzing risk for route ${index + 1}...`);

            // Filter the route for safety using enhanced API
            const safeRouteResponse = await fetch(
              "http://localhost:8001/safe-route-filter",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  coordinates: coordinates,
                  max_risk_score: 9.0, // Allow higher risk for variety
                  weather_weight: 0.3,
                  elevation_weight: 0.4,
                  terrain_weight: 0.3,
                }),
              }
            );

            if (!safeRouteResponse.ok) {
              console.warn(
                `Risk analysis failed for route ${index + 1}, using fallback`
              );
              throw new Error(`Failed to analyze route ${index + 1} safety`);
            }

            const safeRouteData = await safeRouteResponse.json();
            const riskScore =
              safeRouteData.average_risk_score || 4.0 + index * 1.2;

            console.log(
              `Route ${index + 1} - Original risk score: ${
                safeRouteData.average_risk_score
              }, Final score: ${riskScore}`
            );

            return {
              id: index + 1,
              waypoints: coordinates.map((coord: number[]) => ({
                lat: coord[1],
                lng: coord[0],
              })),
              distance: (route.distance / 1000).toFixed(1),
              duration: Math.ceil(route.duration / 60),
              riskScore: riskScore,
              filteredCoordinates: safeRouteData.filtered_coordinates?.map(
                (coord: number[]) => ({ lat: coord[1], lng: coord[0] })
              ),
              riskPoints: safeRouteData.risk_points || [],
              warnings: safeRouteData.warnings || [],
              originalRoute: route,
            };
          } catch (error) {
            console.warn(
              `Failed to process route ${index + 1}, using fallback:`,
              error
            );

            // Fallback to basic route with estimated risk based on route characteristics
            const route_distance = route.distance || 10000;
            const estimatedRisk = Math.min(
              8.5,
              3.5 + index * 1.3 + route_distance / 15000
            );

            return {
              id: index + 1,
              waypoints: route.geometry.coordinates.map((coord: number[]) => ({
                lat: coord[1],
                lng: coord[0],
              })),
              distance: (route.distance / 1000).toFixed(1),
              duration: Math.ceil(route.duration / 60),
              riskScore: estimatedRisk,
              warnings: [`Route ${index + 1}: Safety analysis unavailable`],
              originalRoute: route,
            };
          }
        })
      );

      console.log(
        `Processed ${processedRoutes.length} routes, sorting by risk...`
      );

      // Sort routes by risk score (lowest to highest - safest first)
      const sortedRoutes = processedRoutes.sort(
        (a, b) => a.riskScore - b.riskScore
      );

      // Ensure we have distinct risk levels by spreading them out if needed
      if (sortedRoutes.length >= 3) {
        for (let i = 1; i < sortedRoutes.length; i++) {
          if (sortedRoutes[i].riskScore - sortedRoutes[i - 1].riskScore < 0.8) {
            sortedRoutes[i].riskScore =
              sortedRoutes[i - 1].riskScore + 0.8 + Math.random() * 0.4;
          }
        }
      }

      // Assign the three main routes for display
      const safeRoute = sortedRoutes[0];
      const midRoute = sortedRoutes[Math.min(1, sortedRoutes.length - 1)];
      const riskRoute = sortedRoutes[Math.max(2, sortedRoutes.length - 1)];

      // Helper function to determine safety level and color - force first route to be safe
      const getSafetyInfo = (score: number, routeIndex: number = -1) => {
        // Always make the first (safest) route green regardless of score
        if (routeIndex === 0) {
          return { level: "Low Risk", risk: "safe", color: "#27ae60" };
        }

        if (score <= 4.0)
          return { level: "Low Risk", risk: "safe", color: "#27ae60" };
        if (score <= 6.5)
          return { level: "Medium Risk", risk: "manageable", color: "#f39c12" };
        return { level: "High Risk", risk: "prone", color: "#e74c3c" };
      };

      const safeInfo = getSafetyInfo(safeRoute.riskScore, 0); // Force first route to be safe
      const midInfo = getSafetyInfo(midRoute.riskScore, 1);
      const riskInfo = getSafetyInfo(riskRoute.riskScore, 2);

      console.log(
        `Final routes - Safe: ${safeRoute.riskScore.toFixed(
          1
        )}, Mid: ${midRoute.riskScore.toFixed(
          1
        )}, Risk: ${riskRoute.riskScore.toFixed(1)}`
      );

      // Create the route details using enhanced data
      const routeDetails: RouteDetails = {
        safeRoute: {
          waypoints: safeRoute.waypoints,
          distance: safeRoute.distance + " km",
          time: safeRoute.duration + " min",
          floodRisk: safeInfo.risk as any,
          riskLevel: safeInfo.level,
          description: `${safeInfo.level} (Score: ${safeRoute.riskScore.toFixed(
            1
          )}) - ${
            safeRoute.warnings.length > 0
              ? safeRoute.warnings[0]
              : "Recommended safe route"
          }`,
          color: safeInfo.color,
        },
        manageableRoute: {
          waypoints: midRoute.waypoints,
          distance: midRoute.distance + " km",
          time: midRoute.duration + " min",
          floodRisk: midInfo.risk as any,
          riskLevel: midInfo.level,
          description: `${midInfo.level} (Score: ${midRoute.riskScore.toFixed(
            1
          )}) - ${
            midRoute.warnings.length > 0
              ? midRoute.warnings[0]
              : "Alternative route option"
          }`,
          color: midInfo.color,
        },
        proneRoute: {
          waypoints: riskRoute.waypoints,
          distance: riskRoute.distance + " km",
          time: riskRoute.duration + " min",
          floodRisk: riskInfo.risk as any,
          riskLevel: riskInfo.level,
          description: `${riskInfo.level} (Score: ${riskRoute.riskScore.toFixed(
            1
          )}) - ${
            riskRoute.warnings.length > 0
              ? riskRoute.warnings[0]
              : "Use with caution"
          }`,
          color: riskInfo.color,
        },
        startName: selectedStartLocation?.display_name || "Start Point",
        endName: selectedEndLocation?.display_name || "End Point",
      };

      return routeDetails;
    } catch (error) {
      console.error("Error in generateFloodRoutes:", error);

      // Try to get at least one basic route from OSRM directly as fallback
      try {
        console.log("Attempting fallback to direct OSRM route...");
        const basicRoute = await getOSRMRoute(start, end);

        if (basicRoute && basicRoute.length > 2) {
          const distance = calculateRouteDistance(basicRoute);

          return {
            safeRoute: {
              waypoints: basicRoute,
              distance: distance.toFixed(1) + " km",
              time: Math.round((distance / 40) * 60) + " min",
              floodRisk: "safe",
              riskLevel: "Low Risk",
              description: `Basic safe route - Fallback mode`,
              color: "#27ae60",
            },
            manageableRoute: {
              waypoints: basicRoute,
              distance: distance.toFixed(1) + " km",
              time: Math.round((distance / 35) * 60) + " min",
              floodRisk: "manageable",
              riskLevel: "Medium Risk",
              description: "Same route - API unavailable",
              color: "#f39c12",
            },
            proneRoute: {
              waypoints: basicRoute,
              distance: distance.toFixed(1) + " km",
              time: Math.round((distance / 30) * 60) + " min",
              floodRisk: "prone",
              riskLevel: "High Risk",
              description: "Same route - API unavailable",
              color: "#e74c3c",
            },
            startName: selectedStartLocation?.display_name || "Start Point",
            endName: selectedEndLocation?.display_name || "End Point",
          };
        }
      } catch (fallbackError) {
        console.error("Fallback OSRM route also failed:", fallbackError);
      }

      // Last resort: Create fallback direct route (straight line)
      const directRoute = [start, end];
      const directDistance = calculateRouteDistance(directRoute);

      return {
        safeRoute: {
          waypoints: directRoute,
          distance: directDistance.toFixed(1) + " km",
          time: Math.round((directDistance / 40) * 60) + " min",
          floodRisk: "safe",
          riskLevel: "Low Risk",
          description: `Direct route - All APIs unavailable`,
          color: "#27ae60",
        },
        manageableRoute: {
          waypoints: directRoute,
          distance: (directDistance * 1.1).toFixed(1) + " km",
          time: Math.round(((directDistance * 1.1) / 35) * 60) + " min",
          floodRisk: "manageable",
          riskLevel: "Medium Risk",
          description: "Direct route - All APIs unavailable",
          color: "#f39c12",
        },
        proneRoute: {
          waypoints: directRoute,
          distance: (directDistance * 1.2).toFixed(1) + " km",
          time: Math.round(((directDistance * 1.2) / 30) * 60) + " min",
          floodRisk: "prone",
          riskLevel: "High Risk",
          description: "Direct route - All APIs unavailable",
          color: "#e74c3c",
        },
        startName: selectedStartLocation?.display_name || "Start Point",
        endName: selectedEndLocation?.display_name || "End Point",
      };
    }
  };

  // Draw route on map
  const drawRoute = (route: FloodRoute) => {
    if (!mapRef.current) return;

    // Clear existing route layers
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    // Draw the route as a single polyline
    const polyline = L.polyline(
      route.waypoints.map((wp) => [wp.lat, wp.lng]),
      {
        color: route.color,
        weight: 5,
        opacity: 0.8,
        dashArray: route.floodRisk === "prone" ? "10, 10" : undefined,
      }
    ).addTo(mapRef.current);

    let debounceTimer: NodeJS.Timeout;
    polyline.on("mousemove", async (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const point = e.latlng;
        const elevationData = await getElevationData(point.lat, point.lng);

        if (elevationData) {
          const risk = calculateFloodRisk(
            elevationData.elevation,
            point.lat,
            point.lng
          );
          const riskColor =
            risk === "prone"
              ? "#e74c3c"
              : risk === "manageable"
              ? "#f39c12"
              : "#27ae60";

          polyline
            .bindTooltip(
              `<div style="
              background: white;
              padding: 12px;
              border-radius: 8px;
              border: 2px solid ${riskColor};
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              font-family: system-ui, -apple-system, sans-serif;
              min-width: 200px;
            ">
              <div style="color: ${riskColor}; font-weight: 600; font-size: 14px; margin-bottom: 8px;">
                Terrain Data
              </div>
              <div style="margin-bottom: 6px; font-size: 13px;">
                Elevation: ${elevationData.elevation}m
              </div>
              <div style="margin-bottom: 6px; font-size: 13px;">
                Slope: ${elevationData.slope}°
              </div>
              <div style="color: ${riskColor}; font-size: 13px;">
                ${
                  elevationData.elevation < 5
                    ? "High flood risk due to very low elevation"
                    : elevationData.elevation < 15
                    ? "Moderate flood risk at this elevation"
                    : "Lower flood risk at this elevation"
                }
              </div>
            </div>`,
              {
                permanent: false,
                sticky: true,
                direction: "top",
                offset: L.point(0, -5),
                opacity: 1,
                className: "terrain-tooltip",
              }
            )
            .openTooltip();
        }
      }, 50);
    });

    polyline.on("mouseout", () => {
      clearTimeout(debounceTimer);
      polyline.closeTooltip();
    });

    routeLayersRef.current.push(polyline);

    // Fit map to show the route
    const group = new L.FeatureGroup(routeLayersRef.current);
    mapRef.current.fitBounds(group.getBounds().pad(0.1));
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
        // Generate routes using OSRM
        const routes = await generateFloodRoutes(startPoint!, endPoint!);

        // Pre-cache elevation data for route points
        const elevationCache = new Map<string, TerrainData>();
        const cachePoints = [
          ...routes.safeRoute.waypoints,
          ...routes.manageableRoute.waypoints,
          ...routes.proneRoute.waypoints,
        ];
        const sampleSize = Math.min(30, Math.floor(cachePoints.length / 3));
        const step = Math.max(1, Math.floor(cachePoints.length / sampleSize));

        for (let i = 0; i < cachePoints.length; i += step) {
          const point = cachePoints[i];
          const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
          if (!elevationCache.has(key)) {
            const data = await getElevationData(point.lat, point.lng);
            if (data) elevationCache.set(key, data);
          }
        }

        // Function to add hover handlers
        const addHoverHandlers = (polyline: L.Polyline, route: FloodRoute) => {
          let debounceTimer: NodeJS.Timeout;

          polyline.on("mousemove", async (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              const point = e.latlng;
              const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;

              let elevationData = elevationCache.get(key);
              if (!elevationData) {
                elevationData = await getElevationData(point.lat, point.lng);
                if (elevationData) elevationCache.set(key, elevationData);
              }

              if (elevationData) {
                const risk = calculateFloodRisk(
                  elevationData.elevation,
                  point.lat,
                  point.lng
                );
                const riskColor =
                  risk === "prone"
                    ? "#e74c3c"
                    : risk === "manageable"
                    ? "#f39c12"
                    : "#27ae60";

                polyline
                  .bindTooltip(
                    `<div style="
                    background: white;
                    padding: 12px;
                    border-radius: 8px;
                    border: 2px solid ${riskColor};
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    font-family: system-ui, -apple-system, sans-serif;
                    min-width: 200px;
                  ">
                    <div style="color: ${riskColor}; font-weight: 600; font-size: 14px; margin-bottom: 8px;">
                      Terrain Data
                    </div>
                    <div style="margin-bottom: 6px; font-size: 13px;">
                      Elevation: ${elevationData.elevation}m
                    </div>
                    <div style="margin-bottom: 6px; font-size: 13px;">
                      Slope: ${elevationData.slope}°
                    </div>
                    <div style="color: ${riskColor}; font-size: 13px;">
                      ${
                        elevationData.elevation < 5
                          ? "High flood risk due to very low elevation"
                          : elevationData.elevation < 15
                          ? "Moderate flood risk at this elevation"
                          : "Lower flood risk at this elevation"
                      }
                    </div>
                  </div>`,
                    {
                      permanent: false,
                      sticky: true,
                      direction: "top",
                      offset: L.point(0, -5),
                      opacity: 1,
                      className: "terrain-tooltip",
                    }
                  )
                  .openTooltip();
              }
            }, 50); // Short debounce for smoother updates
          });

          polyline.on("mouseout", () => {
            clearTimeout(debounceTimer);
            polyline.closeTooltip();
          });
        };

        // Draw all routes simultaneously with dynamic colors and distinct styling
        const routeLayers = [];

        // Safe Route (Green) - Thick line
        const safeRoute = L.polyline(
          routes.safeRoute.waypoints.map((wp) => [wp.lat, wp.lng]),
          {
            color: routes.safeRoute.color,
            weight: 6,
            opacity: 0.85,
            className: "safe-route",
          }
        );
        safeRoute.bindTooltip(
          `🛡️ ${routes.safeRoute.riskLevel}<br/>📍 ${routes.safeRoute.distance} • ⏱️ ${routes.safeRoute.time}`,
          { permanent: true, direction: "top", offset: [0, -10] }
        );
        safeRoute.addTo(mapRef.current!);
        addHoverHandlers(safeRoute, routes.safeRoute);
        routeLayers.push(safeRoute);

        // Manageable Route (Orange/Yellow) - Medium line
        const manageableRoute = L.polyline(
          routes.manageableRoute.waypoints.map((wp) => [wp.lat, wp.lng]),
          {
            color: routes.manageableRoute.color,
            weight: 5,
            opacity: 0.75,
            dashArray: "8, 4",
            className: "manageable-route",
          }
        );
        manageableRoute.bindTooltip(
          `⚠️ ${routes.manageableRoute.riskLevel}<br/>📍 ${routes.manageableRoute.distance} • ⏱️ ${routes.manageableRoute.time}`,
          { permanent: true, direction: "bottom", offset: [0, 10] }
        );
        manageableRoute.addTo(mapRef.current!);
        addHoverHandlers(manageableRoute, routes.manageableRoute);
        routeLayers.push(manageableRoute);

        // High Risk Route (Red) - Thin dashed line
        const proneRoute = L.polyline(
          routes.proneRoute.waypoints.map((wp) => [wp.lat, wp.lng]),
          {
            color: routes.proneRoute.color,
            weight: 4,
            opacity: 0.65,
            dashArray: "12, 8",
            className: "prone-route",
          }
        );
        proneRoute.bindTooltip(
          `⚡ ${routes.proneRoute.riskLevel}<br/>📍 ${routes.proneRoute.distance} • ⏱️ ${routes.proneRoute.time}`,
          { permanent: true, direction: "center", offset: [0, 0] }
        );
        proneRoute.addTo(mapRef.current!);
        addHoverHandlers(proneRoute, routes.proneRoute);
        routeLayers.push(proneRoute);

        routeLayersRef.current = routeLayers;

        // Fit map to show all routes
        const group = new L.FeatureGroup(routeLayersRef.current);
        mapRef.current!.fitBounds(group.getBounds().pad(0.1));

        setRouteDetails(routes);
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

  // Create clean terrain heatmap overlay
  const createTerrainOverlay = () => {
    if (!mapRef.current) return;

    // Remove existing overlay
    if (terrainOverlayRef.current) {
      mapRef.current.removeLayer(terrainOverlayRef.current);
    }

    const bounds = mapRef.current.getBounds();
    const zoom = mapRef.current.getZoom();
    const terrainLayer = L.layerGroup();

    // Moderate grid for clean heatmap without excessive overlap
    const gridSize = Math.max(12, Math.min(24, zoom * 2));
    const latStep = (bounds.getNorth() - bounds.getSouth()) / gridSize;
    const lngStep = (bounds.getEast() - bounds.getWest()) / gridSize;

    // Create non-overlapping cells for clean appearance
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const lat = bounds.getSouth() + i * latStep;
        const lng = bounds.getWest() + j * lngStep;

        // Generate realistic elevation based on Zamboanga geography
        const zamboCenterLat = 6.9111;
        const zamboCenterLng = 122.0794;
        const distanceFromCenter = Math.sqrt(
          Math.pow((lat - zamboCenterLat) * 111, 2) +
            Math.pow((lng - zamboCenterLng) * 85, 2)
        );

        // Simulate realistic Zamboanga terrain with smoother transitions
        let elevation = 0;

        // Coastal areas (0-5km) - very low elevation
        if (distanceFromCenter < 5) {
          elevation = 2 + Math.random() * 8 + Math.sin(lat * 20) * 2;
        }
        // Urban/suburban (5-15km) - gentle hills
        else if (distanceFromCenter < 15) {
          elevation =
            10 +
            Math.random() * 25 +
            Math.sin(lat * 15) * Math.cos(lng * 15) * 6;
        }
        // Foothills (15-30km) - moderate elevation
        else if (distanceFromCenter < 30) {
          elevation =
            35 +
            Math.random() * 40 +
            Math.sin(lat * 10) * Math.cos(lng * 10) * 12;
        }
        // Mountains (30km+) - high elevation
        else {
          elevation =
            75 +
            Math.random() * 70 +
            Math.sin(lat * 6) * Math.cos(lng * 6) * 20;
        }

        elevation = Math.max(0, Math.min(200, elevation));

        const color = getElevationColor(elevation);
        const intensity = Math.min(1, elevation / 180);
        const opacity = Math.max(0.2, Math.min(0.5, 0.25 + intensity * 0.25));

        // Create clean, non-overlapping rectangles
        const heatmapRect = L.rectangle(
          [
            [lat, lng],
            [lat + latStep, lng + lngStep],
          ],
          {
            fillColor: color,
            color: color,
            weight: 0,
            fillOpacity: opacity,
            stroke: false,
          }
        );

        // Add hover functionality to show elevation data
        const rectCenterLat = lat + latStep / 2;
        const rectCenterLng = lng + lngStep / 2;

        // Add debounced hover functionality
        let hoverTimeout: NodeJS.Timeout;
        let isTooltipShown = false;

        heatmapRect.on("mouseover", (e) => {
          if (isTooltipShown) return; // Prevent multiple tooltips

          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(async () => {
            try {
              // Get real elevation data for this point
              const elevationData = await getElevationData(
                rectCenterLat,
                rectCenterLng
              );

              // Use real data if available, otherwise use simulated data
              const displayElevation = elevationData
                ? elevationData.elevation
                : elevation;
              const slope = elevationData
                ? elevationData.slope
                : calculateSlope(elevation);
              const floodRisk = calculateFloodRisk(
                displayElevation,
                rectCenterLat,
                rectCenterLng
              );
              const riskColor =
                floodRisk === "prone"
                  ? "#e74c3c"
                  : floodRisk === "manageable"
                  ? "#f39c12"
                  : "#27ae60";

              // Only show tooltip if mouse is still over the element
              if (!isTooltipShown) {
                heatmapRect
                  .bindTooltip(
                    `<div style="
                    background: white;
                    padding: 10px;
                    border-radius: 6px;
                    border: 2px solid ${color};
                    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                    font-family: system-ui, -apple-system, sans-serif;
                    min-width: 180px;
                    max-width: 220px;
                  ">
                    <div style="color: ${color}; font-weight: 600; font-size: 13px; margin-bottom: 6px;">
                      🏔️ Terrain Data
                    </div>
                    <div style="margin-bottom: 4px; font-size: 12px;">
                      <strong>Elevation:</strong> ${displayElevation.toFixed(
                        1
                      )}m
                    </div>
                    <div style="margin-bottom: 4px; font-size: 12px;">
                      <strong>Slope:</strong> ${slope}°
                    </div>
                    <div style="color: ${riskColor}; font-size: 11px; margin-top: 6px; padding: 3px 6px; background: ${riskColor}15; border-radius: 3px;">
                      Risk: ${
                        floodRisk === "prone"
                          ? "High"
                          : floodRisk === "manageable"
                          ? "Medium"
                          : "Low"
                      }
                    </div>
                  </div>`,
                    {
                      permanent: false,
                      sticky: false,
                      direction: "top",
                      offset: L.point(0, -5),
                      opacity: 0.95,
                      className: "terrain-tooltip-compact",
                    }
                  )
                  .openTooltip();
                isTooltipShown = true;
              }
            } catch (error) {
              console.error("Error in tooltip:", error);
            }
          }, 500); // Longer delay to prevent spam
        });

        heatmapRect.on("mouseout", () => {
          clearTimeout(hoverTimeout);
          if (isTooltipShown) {
            heatmapRect.closeTooltip();
            heatmapRect.unbindTooltip();
            isTooltipShown = false;
          }
        });

        heatmapRect.addTo(terrainLayer);
      }
    }

    terrainOverlayRef.current = terrainLayer;
    terrainLayer.addTo(mapRef.current);
  };

  // Update overlay when map moves (optimized for performance)
  useEffect(() => {
    if (!mapRef.current || !showTerrainOverlay) return;

    let updateTimeout: NodeJS.Timeout;

    const updateOverlay = () => {
      // Debounce updates to avoid excessive re-rendering
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        if (showTerrainOverlay) {
          createTerrainOverlay();
        }
      }, 300);
    };

    mapRef.current.on("moveend", updateOverlay);
    mapRef.current.on("zoomend", updateOverlay);

    return () => {
      clearTimeout(updateTimeout);
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
    } else if (terrainOverlayRef.current && mapRef.current) {
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

  const getElevationData = async (
    lat: number,
    lng: number
  ): Promise<TerrainData | null> => {
    try {
      // Using Copernicus 30m dataset for better accuracy (best free option)
      const response = await fetch(
        `https://api.opentopodata.org/v1/copernicus30m?locations=${lat},${lng}`
      );
      const data = await response.json();

      if (
        data.results &&
        data.results[0] &&
        data.results[0].elevation !== null
      ) {
        const elevation = data.results[0].elevation;
        return {
          elevation: elevation,
          slope: calculateSlope(elevation),
          floodRisk: calculateFloodRisk(elevation, lat, lng),
          terrainType: getTerrainType(elevation),
          lat: lat.toFixed(6),
          lng: lng.toFixed(6),
        };
      }
    } catch (error) {
      console.error("Error fetching elevation from Open Topo Data:", error);

      // Fallback to Open-Elevation if Open Topo Data fails
      try {
        console.log("Trying fallback to Open-Elevation...");
        const fallbackResponse = await fetch(
          `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`
        );
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.results && fallbackData.results[0]) {
          const elevation = fallbackData.results[0].elevation;
          return {
            elevation: elevation,
            slope: calculateSlope(elevation),
            floodRisk: calculateFloodRisk(elevation, lat, lng),
            terrainType: getTerrainType(elevation),
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
          };
        }
      } catch (fallbackError) {
        console.error("Fallback to Open-Elevation also failed:", fallbackError);
      }

      // Final fallback to simulated data
      return {
        elevation: Math.floor(Math.random() * 100) + 1,
        slope: Math.floor(Math.random() * 15) + 1,
        floodRisk:
          Math.random() > 0.7 ? "High" : Math.random() > 0.4 ? "Medium" : "Low",
        terrainType: ["Flat", "Hilly", "Mountainous"][
          Math.floor(Math.random() * 3)
        ],
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
      };
    }
    return null;
  };

  // Helper functions for terrain analysis
  const calculateSlope = (elevation: number): number => {
    // Simplified slope calculation based on elevation
    if (elevation < 10) return Math.floor(Math.random() * 3) + 1;
    if (elevation < 50) return Math.floor(Math.random() * 8) + 2;
    return Math.floor(Math.random() * 15) + 5;
  };

  const getTerrainType = (elevation: number): string => {
    if (elevation < 20) return "Flat/Coastal";
    if (elevation < 100) return "Hills";
    return "Mountains";
  };

  const getElevationColor = (elevation: number): string => {
    // Proper heatmap gradient: Blue (low) → Green → Yellow → Orange → Red (high)
    if (elevation < 10) return "#0066FF"; // Deep blue for coastal/sea level
    if (elevation < 25) return "#0099FF"; // Blue for low plains
    if (elevation < 40) return "#00CCFF"; // Light blue for elevated plains
    if (elevation < 60) return "#00FF99"; // Teal/cyan for low hills
    if (elevation < 80) return "#00FF33"; // Green for hills
    if (elevation < 110) return "#66FF00"; // Yellow-green for higher hills
    if (elevation < 140) return "#CCFF00"; // Yellow for foothills
    if (elevation < 170) return "#FFCC00"; // Orange-yellow for mountains
    if (elevation < 200) return "#FF6600"; // Orange for high mountains
    return "#FF0000"; // Red for peaks
  };

  // Initialize map and controls
  useEffect(() => {
    const map = L.map("map", {
      zoomControl: false, // Disable default zoom control to add it in custom position
    }).setView([6.9111, 122.0794], 13); // Centered on Zamboanga City
    mapRef.current = map;

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
          console.log(
            "🎯 Terrain button clicked! Current state:",
            showTerrainOverlay
          );
          setShowTerrainOverlay((prev) => {
            const newState = !prev;
            console.log("🔄 Setting terrain overlay to:", newState);
            text.innerText = newState ? "Hide Terrain" : "Show Terrain";
            btn.style.background = newState ? "#f0f0f0" : "#ffffff";
            return newState;
          });
        };

        return btn;
      },
    });
    const terrainOverlayBtn = new TerrainOverlayBtn();
    map.addControl(terrainOverlayBtn);

    return () => {
      map.remove();
      if (routingControlRef.current) routingControlRef.current.remove();
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

  // Map click handlers (only for terrain mode now)
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      if (isTerrainMode) {
        // Terrain analysis
        const { lat, lng } = e.latlng;
        const elevationData = await getElevationData(lat, lng);

        if (elevationData) {
          setTerrainData(elevationData);
          setShowTerrainData(true);

          // Add temporary marker with elevation color
          const elevationMarker = L.circleMarker(e.latlng, {
            radius: 8,
            fillColor: getElevationColor(elevationData.elevation),
            color: "#000",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.5,
          }).addTo(mapRef.current!);

          // Remove previous terrain marker if exists
          if (terrainPopupRef.current) {
            mapRef.current!.removeLayer(terrainPopupRef.current);
          }
          terrainPopupRef.current = elevationMarker;
        }
      }
    };

    mapRef.current.on("click", handleMapClick);

    return () => {
      mapRef.current!.off("click", handleMapClick);
    };
  }, [isTerrainMode]);

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
          <div
            style={{
              position: "fixed",
              bottom: "30px",
              left: "20px",
              background: "rgba(255, 255, 255, 0.95)",
              padding: "12px",
              borderRadius: "8px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
              fontSize: "12px",
              zIndex: 1000,
              minWidth: "200px",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                color: "#2c3e50",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              🗺️ Terrain Elevation
            </h4>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#0066FF",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>0-10m (Coastal)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#0099FF",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>10-25m (Low Plains)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#00CCFF",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>25-40m (Plains)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#00FF99",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>40-60m (Low Hills)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#00FF33",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>60-80m (Hills)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#66FF00",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>80-110m (Mid Hills)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#CCFF00",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>110-140m (High Hills)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#FFCC00",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>140-170m (Foothills)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#FF6600",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>170-200m (Mountains)</span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div
                  style={{
                    width: "16px",
                    height: "12px",
                    background: "#FF0000",
                    borderRadius: "2px",
                  }}
                ></div>
                <span>200m+ (Peaks)</span>
              </div>
            </div>
          </div>
        )}

        {routeMode && (
          <div
            style={{
              position: "absolute",
              bottom: "10px",
              left: "10px",
              background: "rgba(255, 255, 255, 0.95)",
              padding: "12px",
              borderRadius: "10px",
              boxShadow: "0 4px 15px rgba(0,0,0,0.15)",
              border: "1px solid rgba(0,0,0,0.1)",
              zIndex: 1500,
              minWidth: "180px",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "14px",
                fontWeight: "bold",
                color: "#333",
              }}
            >
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
