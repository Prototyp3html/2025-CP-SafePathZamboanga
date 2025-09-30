import { useState, useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    mapViewConfigLogged?: boolean;
  }
}
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
import { localRoutingService } from "../services/localRouting";
import {
  fetchZamboangaPlaces,
  type ZamboangaPlace,
  type ZamboangaPlaceGroup,
} from "../utils/zamboangaPlaces";

const IMPORTANT_POI_GROUPS = new Set<ZamboangaPlaceGroup>([
  "shopping",
  "health",
  "education",
  "transport",
  "lodging",
  "services",
  "finance",
]);

const MID_PRIORITY_POI_GROUPS = new Set<ZamboangaPlaceGroup>([
  "food",
  "worship",
]);

const CORE_POI_GROUPS = new Set<ZamboangaPlaceGroup>([
  "shopping",
  "health",
  "transport",
  "lodging",
  "education",
]);

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

interface TerrainRoadFeature {
  type: "Feature";
  properties: {
    osm_id: string;
    road_id: number;
    length_m: number;
    elev_mean: number;
    elev_min: number;
    elev_max: number;
    flooded: string;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

interface TerrainRoadsData {
  type: "FeatureCollection";
  features: TerrainRoadFeature[];
}

interface TerrainFeatureMeta {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  roadId: string;
  flooded: boolean;
  elevation: number | null;
  length: number;
}

interface TerrainSpatialIndex {
  cellSize: number;
  index: Map<string, number[]>;
}

interface RouteTerrainStats {
  floodLength: number;
  safeLength: number;
  unknownLength: number;
  totalLength: number;
  floodedRatio: number;
  safeRatio: number;
  averageElevation: number | null;
  usedRoadIds: Set<string>;
  sampleCount: number;
  riskCategory: "safe" | "manageable" | "prone";
}

type FloodPreference = "prefer" | "avoid" | "neutral";

interface TerrainRouteOptions {
  excludeRoadIds?: Set<string>;
}

interface TerrainWaypointPreference {
  latPreference?: number;
  lngPreference?: number;
  floodPreference?: FloodPreference;
  minElevation?: number;
  maxElevation?: number;
  elevationWeight?: number;
  corridorWidthKm?: number;
  positionBias?: number;
}

interface TerrainWaypointCandidate {
  point: LatLng;
  roadId: string;
  elevation: number;
  flooded: boolean;
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

type LatLngBounds = {
  lat: { min: number; max: number };
  lng: { min: number; max: number };
};

const CITY_CENTER: LatLng = { lat: 6.91, lng: 122.08 };
const BALANCED_CITY_BOUNDS: LatLngBounds = {
  lat: { min: 6.85, max: 7.15 },
  lng: { min: 122.0, max: 122.15 },
};
const SAFE_CITY_BOUNDS: LatLngBounds = {
  lat: { min: 6.86, max: 7.1 },
  lng: { min: 122.01, max: 122.14 },
};

const clampValue = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clampPointToBounds = (point: LatLng, bounds: LatLngBounds): LatLng => ({
  lat: clampValue(point.lat, bounds.lat.min, bounds.lat.max),
  lng: clampValue(point.lng, bounds.lng.min, bounds.lng.max),
});

const computeMidpoint = (start: LatLng, end: LatLng): LatLng => ({
  lat: (start.lat + end.lat) / 2,
  lng: (start.lng + end.lng) / 2,
});

const biasTowardCityCenter = (point: LatLng, factor: number): LatLng => ({
  lat: point.lat + (CITY_CENTER.lat - point.lat) * factor,
  lng: point.lng + (CITY_CENTER.lng - point.lng) * factor,
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const POI_GROUP_STYLES: Record<
  ZamboangaPlaceGroup,
  { color: string; accent: string; emoji: string; label: string }
> = {
  food: {
    color: "#f97316",
    accent: "#fb923c",
    emoji: "🍽️",
    label: "Food & Drinks",
  },
  lodging: {
    color: "#7c3aed",
    accent: "#a78bfa",
    emoji: "🛏️",
    label: "Hotels & Stays",
  },
  shopping: {
    color: "#2563eb",
    accent: "#60a5fa",
    emoji: "🛍️",
    label: "Shops & Malls",
  },
  health: {
    color: "#dc2626",
    accent: "#f87171",
    emoji: "🩺",
    label: "Health Services",
  },
  education: {
    color: "#059669",
    accent: "#34d399",
    emoji: "🎓",
    label: "Schools & Universities",
  },
  services: {
    color: "#4b5563",
    accent: "#9ca3af",
    emoji: "🏢",
    label: "City Services",
  },
  finance: {
    color: "#b45309",
    accent: "#f59e0b",
    emoji: "💱",
    label: "Banks & Money",
  },
  leisure: {
    color: "#db2777",
    accent: "#f472b6",
    emoji: "🎡",
    label: "Leisure Spots",
  },
  worship: {
    color: "#9333ea",
    accent: "#c084fc",
    emoji: "🕌",
    label: "Places of Worship",
  },
  transport: {
    color: "#0f766e",
    accent: "#14b8a6",
    emoji: "🚌",
    label: "Transport Hubs",
  },
};

const isWithinBounds = (point: LatLng, bounds: LatLngBounds): boolean =>
  point.lat >= bounds.lat.min &&
  point.lat <= bounds.lat.max &&
  point.lng >= bounds.lng.min &&
  point.lng <= bounds.lng.max;

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const calculateDistanceMeters = (pointA: LatLng, pointB: LatLng): number => {
  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLng = toRadians(pointB.lng - pointA.lng);
  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c * 1000;
};

const sampleRoutePoints = (route: LatLng[], samples = 25): LatLng[] => {
  if (route.length <= samples) {
    return route;
  }

  const sampled: LatLng[] = [];
  const step = (route.length - 1) / (samples - 1);

  for (let i = 0; i < samples; i++) {
    const index = Math.min(route.length - 1, Math.round(i * step));
    sampled.push(route[index]);
  }

  return sampled;
};

const calculateOverlapRatio = (routeA: LatLng[], routeB: LatLng[]): number => {
  if (routeA.length < 2 || routeB.length < 2) {
    return 0;
  }

  const sampledA = sampleRoutePoints(routeA, 30);
  const sampledB = sampleRoutePoints(routeB, 30);
  const thresholdMeters = 120; // Treat anything closer than ~120m as overlapping

  let overlapCount = 0;
  let totalCount = 0;

  const countOverlaps = (source: LatLng[], target: LatLng[]) => {
    let count = 0;
    for (const point of source) {
      let minDistance = Infinity;
      for (const candidate of target) {
        const distance = calculateDistanceMeters(point, candidate);
        if (distance < minDistance) {
          minDistance = distance;
        }
        if (minDistance <= thresholdMeters) {
          break;
        }
      }
      if (minDistance <= thresholdMeters) {
        count++;
      }
    }
    return count;
  };

  overlapCount += countOverlaps(sampledA, sampledB);
  totalCount += sampledA.length;

  overlapCount += countOverlaps(sampledB, sampledA);
  totalCount += sampledB.length;

  return totalCount > 0 ? overlapCount / totalCount : 0;
};

const TERRAIN_INDEX_CELL_SIZE = 0.01;
const DEFAULT_TERRAIN_SEARCH_RADIUS_METERS = 120;

const getTerrainCellKey = (latIndex: number, lngIndex: number): string =>
  `${latIndex}:${lngIndex}`;

const buildTerrainSpatialIndex = (
  roads: TerrainRoadFeature[]
): { metas: TerrainFeatureMeta[]; spatialIndex: TerrainSpatialIndex } => {
  const metas: TerrainFeatureMeta[] = [];
  const index = new Map<string, number[]>();

  roads.forEach((road, idx) => {
    if (road.geometry.type !== "LineString") {
      return;
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    road.geometry.coordinates.forEach(([lng, lat]) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return;
      }

      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    if (!Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
      return;
    }

    const roadIdRaw =
      road.properties.road_id ?? road.properties.osm_id ?? String(idx);
    const roadId = String(roadIdRaw);
    const floodedValue = `${road.properties.flooded ?? ""}`.toLowerCase();
    const flooded =
      floodedValue === "1" ||
      floodedValue === "true" ||
      floodedValue === "yes";
    const elevationValue = Number(road.properties.elev_mean);
    const elevation =
      Number.isFinite(elevationValue) && elevationValue > -5000
        ? elevationValue
        : null;

    const meta: TerrainFeatureMeta = {
      minLat,
      maxLat,
      minLng,
      maxLng,
      roadId,
      flooded,
      elevation,
      length: Number(road.properties.length_m) || 0,
    };

    metas.push(meta);

    const cellSize = TERRAIN_INDEX_CELL_SIZE;
    const latStart = Math.floor(minLat / cellSize);
    const latEnd = Math.floor(maxLat / cellSize);
    const lngStart = Math.floor(minLng / cellSize);
    const lngEnd = Math.floor(maxLng / cellSize);

    for (let latIdx = latStart; latIdx <= latEnd; latIdx++) {
      for (let lngIdx = lngStart; lngIdx <= lngEnd; lngIdx++) {
        const key = getTerrainCellKey(latIdx, lngIdx);
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key)!.push(idx);
      }
    }
  });

  return {
    metas,
    spatialIndex: {
      cellSize: TERRAIN_INDEX_CELL_SIZE,
      index,
    },
  };
};

const pointToSegmentDistanceMeters = (
  point: LatLng,
  startCoord: [number, number],
  endCoord: [number, number]
): number => {
  const metersPerDegLat = 111320;
  const metersPerDegLng =
    111320 * Math.max(Math.cos(toRadians(point.lat)), 0.0001);

  const startX = (startCoord[0] - point.lng) * metersPerDegLng;
  const startY = (startCoord[1] - point.lat) * metersPerDegLat;
  const endX = (endCoord[0] - point.lng) * metersPerDegLng;
  const endY = (endCoord[1] - point.lat) * metersPerDegLat;

  const segX = endX - startX;
  const segY = endY - startY;
  const segLengthSq = segX * segX + segY * segY;

  let t = 0;
  if (segLengthSq > 0) {
    t = ((-startX) * segX + (-startY) * segY) / segLengthSq;
    t = Math.max(0, Math.min(1, t));
  }

  const projX = startX + segX * t;
  const projY = startY + segY * t;

  const diffX = projX;
  const diffY = projY;

  return Math.sqrt(diffX * diffX + diffY * diffY);
};

const findNearestTerrainFeature = (
  point: LatLng,
  searchRadiusMeters: number,
  features: TerrainRoadFeature[],
  metas: TerrainFeatureMeta[],
  spatialIndex: TerrainSpatialIndex | null
): { featureIndex: number; distance: number } | null => {
  if (!features.length || !metas.length) {
    return null;
  }

  const latRadiusDeg = searchRadiusMeters / 111000;
  const lngRadiusDeg =
    searchRadiusMeters /
    (111000 * Math.max(Math.cos(toRadians(point.lat)), 0.0001));

  const candidateSet = new Set<number>();

  if (spatialIndex) {
    const { cellSize, index } = spatialIndex;
    const latStart = Math.floor((point.lat - latRadiusDeg) / cellSize);
    const latEnd = Math.floor((point.lat + latRadiusDeg) / cellSize);
    const lngStart = Math.floor((point.lng - lngRadiusDeg) / cellSize);
    const lngEnd = Math.floor((point.lng + lngRadiusDeg) / cellSize);

    for (let latIdx = latStart; latIdx <= latEnd; latIdx++) {
      for (let lngIdx = lngStart; lngIdx <= lngEnd; lngIdx++) {
        const key = getTerrainCellKey(latIdx, lngIdx);
        const matches = index.get(key);
        if (matches) {
          matches.forEach((idx) => candidateSet.add(idx));
        }
      }
    }
  }

  if (!candidateSet.size) {
    for (let i = 0; i < features.length; i++) {
      candidateSet.add(i);
    }
  }

  let closestIndex = -1;
  let closestDistance = Infinity;

  candidateSet.forEach((idx) => {
    const meta = metas[idx];
    if (!meta) {
      return;
    }

    if (
      point.lat < meta.minLat - latRadiusDeg ||
      point.lat > meta.maxLat + latRadiusDeg ||
      point.lng < meta.minLng - lngRadiusDeg ||
      point.lng > meta.maxLng + lngRadiusDeg
    ) {
      return;
    }

    const geometry = features[idx].geometry;
    if (!geometry || geometry.type !== "LineString") {
      return;
    }

    const coords = geometry.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      const distance = pointToSegmentDistanceMeters(point, coords[i], coords[i + 1]);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = idx;
      }
    }
  });

  if (closestIndex === -1 || closestDistance > searchRadiusMeters) {
    return null;
  }

  return { featureIndex: closestIndex, distance: closestDistance };
};

const computeRouteTerrainStats = (
  waypoints: LatLng[],
  features: TerrainRoadFeature[],
  metas: TerrainFeatureMeta[],
  spatialIndex: TerrainSpatialIndex | null,
  options: { sampleLimit?: number; searchRadiusMeters?: number } = {}
): RouteTerrainStats | null => {
  if (waypoints.length < 2 || !features.length || !metas.length) {
    return null;
  }

  const sampleLimit = options.sampleLimit ?? 60;
  const searchRadius =
    options.searchRadiusMeters ?? DEFAULT_TERRAIN_SEARCH_RADIUS_METERS;

  const step = Math.max(1, Math.floor((waypoints.length - 1) / sampleLimit));
  let totalLength = 0;
  let floodedLength = 0;
  let safeLength = 0;
  let unknownLength = 0;
  let elevationSum = 0;
  let elevationWeight = 0;
  const usedRoadIds = new Set<string>();
  let samples = 0;

  for (let i = 0; i < waypoints.length - 1; i += step) {
    const nextIndex = Math.min(i + step, waypoints.length - 1);
    const segmentStart = waypoints[i];
    const segmentEnd = waypoints[nextIndex];

    const segmentLength = calculateDistanceMeters(segmentStart, segmentEnd);
    if (!Number.isFinite(segmentLength) || segmentLength <= 0) {
      continue;
    }

    totalLength += segmentLength;
    samples++;

    const midpoint = {
      lat: (segmentStart.lat + segmentEnd.lat) / 2,
      lng: (segmentStart.lng + segmentEnd.lng) / 2,
    };

    const nearest = findNearestTerrainFeature(
      midpoint,
      searchRadius,
      features,
      metas,
      spatialIndex
    );

    if (nearest) {
      const meta = metas[nearest.featureIndex];
      usedRoadIds.add(meta.roadId);
      if (meta.flooded) {
        floodedLength += segmentLength;
      } else {
        safeLength += segmentLength;
      }

      if (meta.elevation !== null) {
        elevationSum += meta.elevation * segmentLength;
        elevationWeight += segmentLength;
      }
    } else {
      unknownLength += segmentLength;
    }
  }

  if (totalLength === 0) {
    return null;
  }

  const floodedRatio = floodedLength / totalLength;
  const safeRatio = safeLength / totalLength;
  const averageElevation =
    elevationWeight > 0 ? elevationSum / elevationWeight : null;

  let riskCategory: "safe" | "manageable" | "prone";
  if (floodedRatio <= 0.18) {
    riskCategory = "safe";
  } else if (floodedRatio <= 0.45) {
    riskCategory = "manageable";
  } else {
    riskCategory = "prone";
  }

  if (unknownLength / totalLength > 0.35 && riskCategory === "safe") {
    riskCategory = "manageable";
  }

  return {
    floodLength: floodedLength,
    safeLength,
    unknownLength,
    totalLength,
    floodedRatio,
    safeRatio,
    averageElevation,
    usedRoadIds,
    sampleCount: samples,
    riskCategory,
  };
};

const pickTerrainWaypoint = (
  roads: TerrainRoadFeature[],
  start: LatLng,
  end: LatLng,
  options: TerrainWaypointPreference & { excludeRoadIds?: Set<string> }
): TerrainWaypointCandidate | null => {
  if (!roads || roads.length === 0) {
    return null;
  }

  const {
    latPreference = 0,
    lngPreference = 0,
    floodPreference = "neutral",
    minElevation,
    maxElevation,
    elevationWeight = 0,
    corridorWidthKm = 1.5,
    positionBias = 0.5,
    excludeRoadIds,
  } = options;

  const midpoint = computeMidpoint(start, end);
  const averageLat = (start.lat + end.lat) / 2;
  const kmPerDegree = (EARTH_RADIUS_KM * Math.PI) / 180;
  const lngFactor = kmPerDegree * Math.cos(toRadians(averageLat));

  const startVec = { x: 0, y: 0 };
  const endVec = {
    x: (end.lng - start.lng) * lngFactor,
    y: (end.lat - start.lat) * kmPerDegree,
  };

  const segmentLength = Math.sqrt(endVec.x * endVec.x + endVec.y * endVec.y);
  const segmentLengthSq = segmentLength > 0 ? segmentLength * segmentLength : 1;

  let bestCandidate: TerrainWaypointCandidate | null = null;
  let bestScore = -Infinity;

  for (const road of roads) {
    if (
      road.geometry.type !== "LineString" ||
      road.geometry.coordinates.length === 0
    ) {
      continue;
    }

    const roadId = String(road.properties.road_id ?? road.properties.osm_id);
    if (excludeRoadIds && excludeRoadIds.has(roadId)) {
      continue;
    }

    const midIndex = Math.floor(road.geometry.coordinates.length / 2);
    const candidateCoord = road.geometry.coordinates[midIndex];
    const waypoint = { lat: candidateCoord[1], lng: candidateCoord[0] };

    if (!isWithinBounds(waypoint, SAFE_CITY_BOUNDS)) {
      continue;
    }

    const withinLatBand =
      waypoint.lat >= Math.min(start.lat, end.lat) - 0.03 &&
      waypoint.lat <= Math.max(start.lat, end.lat) + 0.03;
    const withinLngBand =
      waypoint.lng >= Math.min(start.lng, end.lng) - 0.03 &&
      waypoint.lng <= Math.max(start.lng, end.lng) + 0.03;

    if (!withinLatBand || !withinLngBand) {
      continue;
    }

    const pointVec = {
      x: (waypoint.lng - start.lng) * lngFactor,
      y: (waypoint.lat - start.lat) * kmPerDegree,
    };

    const cross = Math.abs(endVec.x * pointVec.y - endVec.y * pointVec.x);
    const distanceKm = segmentLength > 0 ? cross / segmentLength : 0;

    if (distanceKm > corridorWidthKm) {
      continue;
    }

    const projection =
      (pointVec.x * endVec.x + pointVec.y * endVec.y) / segmentLengthSq;
    const clampedProjection = Math.max(0, Math.min(1, projection));

    if (clampedProjection < -0.1 || clampedProjection > 1.1) {
      continue;
    }

    const elevation = road.properties.elev_mean ?? 0;
    if (minElevation !== undefined && elevation < minElevation) {
      continue;
    }
    if (maxElevation !== undefined && elevation > maxElevation) {
      continue;
    }

    const flooded = road.properties.flooded === "1";
    if (floodPreference === "avoid" && flooded) {
      continue;
    }
    if (floodPreference === "prefer" && !flooded) {
      continue;
    }

    let score = 0;
    score -= distanceKm * 35;
    score -= Math.abs(clampedProjection - positionBias) * 40;

    const latDeltaKm = (waypoint.lat - midpoint.lat) * kmPerDegree;
    const lngDeltaKm =
      (waypoint.lng - midpoint.lng) * kmPerDegree * Math.cos(toRadians(midpoint.lat));

    score += latPreference * latDeltaKm * 5;
    score += lngPreference * lngDeltaKm * 5;

    if (elevationWeight !== 0) {
      score += elevation * elevationWeight;
    } else if (floodPreference !== "prefer") {
      score += elevation * 0.5;
    } else {
      score -= elevation * 0.3;
    }

    if (floodPreference === "prefer") {
      score += flooded ? 25 : -15;
    } else if (floodPreference === "avoid") {
      score += flooded ? -25 : 10;
    }

    const roadLengthKm = (road.properties.length_m ?? 0) / 1000;
    score += Math.min(roadLengthKm, 3) * 1.5;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        point: clampPointToBounds(waypoint, SAFE_CITY_BOUNDS),
        roadId,
        elevation,
        flooded,
      };
    }
  }

  return bestCandidate;
};

export const MapView = ({ onModalOpen }: MapViewProps) => {
  // Configuration for routing services
  const BACKEND_URL =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
  const USE_LOCAL_OSRM = import.meta.env.VITE_USE_LOCAL_OSRM === "true"; // Use environment variable to control local OSRM

  // Only log configuration once per session and load terrain data
  useEffect(() => {
    if (!window.mapViewConfigLogged) {
      console.log(`🗺️ MapView Configuration:
        - Backend URL: ${BACKEND_URL}
        - Use Local OSRM: ${USE_LOCAL_OSRM}
        - Local OSRM endpoint: ${BACKEND_URL}/osrm/route
        - Local Routing Service: http://localhost:8001/route
        - Note: If local OSRM fails, will automatically fallback to external services
      `);
      window.mapViewConfigLogged = true;
    }

    // Load terrain roads data for enhanced routing
    loadTerrainRoadsData();

    // Restore input values from localStorage on component mount
    const savedStartInput = localStorage.getItem("safepath_start_input");
    const savedEndInput = localStorage.getItem("safepath_end_input");
    if (savedStartInput) setStartLocationInput(savedStartInput);
    if (savedEndInput) setEndLocationInput(savedEndInput);
  }, []);

  // Function to call the local routing service on port 8001
  const getLocalRoutingServiceRoute = async (start: LatLng, end: LatLng) => {
    try {
      console.log(
        `🚀 Calling local routing service: ${start.lat},${start.lng} -> ${end.lat},${end.lng}`
      );

      const response = await fetch(
        `http://localhost:8001/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Local routing service error: ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ Local routing service response:", data);

      return data;
    } catch (error) {
      console.error("❌ Local routing service failed:", error);
      return null;
    }
  };

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
  const [places, setPlaces] = useState<ZamboangaPlace[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState<
    LocationSuggestion[]
  >([]);
  const [isSearchingMapLocations, setIsSearchingMapLocations] =
    useState(false);
  const [showMapSearchResults, setShowMapSearchResults] = useState(false);
  const [mapSearchError, setMapSearchError] = useState<string | null>(null);
  const [activePlace, setActivePlace] = useState<ZamboangaPlace | null>(null);

  // Identical terrain notification
  const [
    showIdenticalTerrainNotification,
    setShowIdenticalTerrainNotification,
  ] = useState(false);
  const [safestFastestMode, setSafestFastestMode] = useState(false);

  // Elevation API management
  const [apiFailureCount, setApiFailureCount] = useState(0);
  const [useOfflineMode, setUseOfflineMode] = useState(false);
  const elevationCacheRef = useRef<Map<string, TerrainData>>(new Map());

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
  // Initialize state with localStorage persistence
  const [selectedStartLocation, setSelectedStartLocation] =
    useState<LocationSuggestion | null>(() => {
      try {
        const saved = localStorage.getItem("safepath_start_location");
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    });
  const [selectedEndLocation, setSelectedEndLocation] =
    useState<LocationSuggestion | null>(() => {
      try {
        const saved = localStorage.getItem("safepath_end_location");
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    });
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);

  // Educational pathfinding visualization states
  const [isEducationalMode, setIsEducationalMode] = useState(false);
  const [pathfindingStep, setPathfindingStep] = useState<
    "idle" | "calculating" | "finding-safe" | "showing-risk" | "complete"
  >("idle");
  const [exploredNodes, setExploredNodes] = useState<LatLng[]>([]);
  const [currentSearchNode, setCurrentSearchNode] = useState<LatLng | null>(
    null
  );
  const [pathFound, setPathFound] = useState<LatLng[]>([]);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);

  // Terrain roads data for enhanced routing
  const [terrainRoadsData, setTerrainRoadsData] =
    useState<TerrainRoadsData | null>(null);
  const [terrainRoadsLoaded, setTerrainRoadsLoaded] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);

  const terrainRoadsMetaRef = useRef<TerrainFeatureMeta[]>([]);
  const terrainSpatialIndexRef = useRef<TerrainSpatialIndex | null>(null);

  const evaluateTerrainForRoute = useCallback(
    (waypoints: LatLng[] | null | undefined): RouteTerrainStats | null => {
      if (!terrainRoadsData || !waypoints || waypoints.length < 2) {
        return null;
      }

      return computeRouteTerrainStats(
        waypoints,
        terrainRoadsData.features,
        terrainRoadsMetaRef.current,
        terrainSpatialIndexRef.current
      );
    },
    [terrainRoadsData]
  );

  let distinctRouteRoadIds: Set<string> = new Set();

  const mapRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const circleMarkersRef = useRef<L.CircleMarker[]>([]);
  const layersRef = useRef<Record<string, L.TileLayer>>({});
  const terrainPopupRef = useRef<L.CircleMarker | null>(null);
  const droppedPinMarkerRef = useRef<L.Marker | null>(null);
  const autoRoutePendingRef = useRef(false);
  const terrainOverlayRef = useRef<L.LayerGroup | null>(null);
  const routeLayersRef = useRef<L.Polyline[]>([]);
  const poiLayerRef = useRef<L.LayerGroup | null>(null);
  const poiIconCacheRef = useRef<Record<string, L.DivIcon>>({});
  const poiMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const poiPlacesRef = useRef<Map<string, ZamboangaPlace>>(new Map());
  const mapSearchDebounceRef = useRef<number | null>(null);
  const latestMapSearchQueryRef = useRef<string>("");
  const mapSearchBlurTimeoutRef = useRef<number | null>(null);

  // GraphHopper rate limiting
  const lastGraphHopperRequest = useRef<number>(0);
  const GRAPHHOPPER_DELAY = 1000; // 1 second delay between requests
  const GRAPHHOPPER_RETRY_DELAY = 5000; // 5 seconds after 429 error

  // Persist start location to localStorage
  useEffect(() => {
    if (selectedStartLocation) {
      localStorage.setItem(
        "safepath_start_location",
        JSON.stringify(selectedStartLocation)
      );
      localStorage.setItem(
        "safepath_start_input",
        selectedStartLocation.display_name
      );
    } else {
      localStorage.removeItem("safepath_start_location");
      localStorage.removeItem("safepath_start_input");
    }
  }, [selectedStartLocation]);

  // Persist end location to localStorage
  useEffect(() => {
    if (selectedEndLocation) {
      localStorage.setItem(
        "safepath_end_location",
        JSON.stringify(selectedEndLocation)
      );
      localStorage.setItem(
        "safepath_end_input",
        selectedEndLocation.display_name
      );
    } else {
      localStorage.removeItem("safepath_end_location");
      localStorage.removeItem("safepath_end_input");
    }
  }, [selectedEndLocation]);

  // Cleanup function for component unmount (page navigation)
  useEffect(() => {
    return () => {
      // Clear route-related state when navigating away to prevent stale data
      setRouteDetails(null);
      setShowRouteModal(false);
      setRouteMode(false);

      // Destinations persist across navigation for better UX
      // Users can manually clear them using the "Clear Destinations" button
      console.log(
        "🔄 MapView unmounting - route state cleared, destinations preserved"
      );
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mapSearchDebounceRef.current) {
        window.clearTimeout(mapSearchDebounceRef.current);
      }
      if (mapSearchBlurTimeoutRef.current) {
        window.clearTimeout(mapSearchBlurTimeoutRef.current);
      }
    };
  }, []);

  // Restore start location coordinates and markers when selectedStartLocation is loaded
  useEffect(() => {
    if (!selectedStartLocation || !mapRef.current || !isMapReady) return;

    try {
      const coordinates = {
        lat: parseFloat(selectedStartLocation.lat),
        lng: parseFloat(selectedStartLocation.lon),
      };
      setStartPoint(coordinates);

      // Add marker to map using the same styling as the route markers
      const startMarker = L.divIcon({
        className: "modern-location-pin start-pin",
        html: `<div style="
          width: 32px; 
          height: 32px; 
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          position: relative;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(45deg);
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
          "></div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([coordinates.lat, coordinates.lng], {
        icon: startMarker,
      });

      const mapInstance = mapRef.current;
      if (mapInstance && mapInstance.getContainer()) {
        try {
          marker.addTo(mapInstance);
          marker.bindPopup(`Start: ${selectedStartLocation.display_name}`);
          markersRef.current.push(marker);
        } catch (markerError) {
          console.error("Error adding start marker:", markerError);
        }
      }
    } catch (error) {
      console.error("Error in start location useEffect:", error);
    }
  }, [selectedStartLocation, isMapReady]);

  // Restore end location coordinates and markers when selectedEndLocation is loaded
  useEffect(() => {
    if (!selectedEndLocation || !mapRef.current || !isMapReady) return;

    try {
      const coordinates = {
        lat: parseFloat(selectedEndLocation.lat),
        lng: parseFloat(selectedEndLocation.lon),
      };
      setEndPoint(coordinates);

      // Add marker to map using the same styling as the route markers
      const endMarker = L.divIcon({
        className: "modern-location-pin end-pin",
        html: `<div style="
          width: 32px; 
          height: 32px; 
          background: linear-gradient(135deg, #dc2626, #b91c1c);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          position: relative;
        ">
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(45deg);
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
          "></div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([coordinates.lat, coordinates.lng], {
        icon: endMarker,
      });

      const mapInstance = mapRef.current;
      if (mapInstance && mapInstance.getContainer()) {
        try {
          marker.addTo(mapInstance);
          marker.bindPopup(`End: ${selectedEndLocation.display_name}`);
          markersRef.current.push(marker);
        } catch (markerError) {
          console.error("Error adding end marker:", markerError);
        }
      }
    } catch (error) {
      console.error("Error in end location useEffect:", error);
    }
  }, [selectedEndLocation, isMapReady]);

  // Modern CSS-based icons for better consistency and visual appeal
  const startIcon = L.divIcon({
    className: "modern-location-pin start-pin",
    html: `<div style="
      width: 32px; 
      height: 32px; 
      background: linear-gradient(135deg, #22c55e, #16a34a);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
      "></div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const endIcon = L.divIcon({
    className: "modern-location-pin end-pin",
    html: `<div style="
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #ef4444, #dc2626);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        width: 12px;
        height: 12px;
        background: white;
        border-radius: 50%;
      "></div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const droppedPinIcon = L.divIcon({
    className: "modern-location-pin dropped-pin",
    html: `<div style="
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        width: 10px;
        height: 10px;
        background: white;
        border-radius: 50%;
      "></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -24],
  });

  const shouldShowPlaceAtZoom = useCallback(
    (place: ZamboangaPlace, zoom: number) => {
      if (zoom >= 16) {
        return true;
      }

      if (zoom >= 14) {
        return place.group !== "leisure";
      }

      if (zoom >= 12) {
        return (
          IMPORTANT_POI_GROUPS.has(place.group) ||
          MID_PRIORITY_POI_GROUPS.has(place.group)
        );
      }

      return CORE_POI_GROUPS.has(place.group);
    },
    []
  );

  const updatePoiVisibility = useCallback(() => {
    const map = mapRef.current;
    const layerGroup = poiLayerRef.current;

    if (!map || !layerGroup) {
      return;
    }

    const currentZoom = map.getZoom();
    const markerMap = poiMarkersRef.current;

    markerMap.forEach((marker, placeId) => {
      const place = poiPlacesRef.current.get(placeId);
      if (!place) {
        return;
      }

      const shouldDisplay = shouldShowPlaceAtZoom(place, currentZoom);
      const hasLayer = layerGroup.hasLayer(marker);

      if (shouldDisplay && !hasLayer) {
        layerGroup.addLayer(marker);
      } else if (!shouldDisplay && hasLayer) {
        layerGroup.removeLayer(marker);
        if (marker.isPopupOpen()) {
          marker.closePopup();
        }
      }
    });
  }, [shouldShowPlaceAtZoom]);

  // Zamboanga City location search using local database (simplified working version)
  const searchLocations = async (
    query: string
  ): Promise<LocationSuggestion[]> => {
    if (query.length < 2) return [];

    try {
      console.log(`🔍 Searching for "${query}" in local Zamboanga database...`);

      // Use the local Zamboanga City database (async version)
      const zamboCityResults = await searchZamboCityLocations(query, 5);

      if (!Array.isArray(zamboCityResults)) {
        console.error(
          "❌ Local search returned invalid data:",
          zamboCityResults
        );
        return [];
      }

      const suggestions = zamboCityResults.map(
        (location: ZamboCityLocation, index: number) => ({
          display_name: location.displayName,
          lat: location.lat.toString(),
          lon: location.lng.toString(),
          place_id: `zambo_${location.name
            .toLowerCase()
            .replace(/\s+/g, "_")}_${index}`,
          type: location.type,
          isLocal: true,
        })
      );

      console.log(
        `✅ Found ${suggestions.length} local Zamboanga locations for "${query}"`
      );
      return suggestions;
    } catch (error) {
      console.error("Error searching Zamboanga City locations:", error);
      return [];
    }
  };

  const handleMapSearchInputChange = (value: string) => {
    setMapSearchQuery(value);

    if (mapSearchDebounceRef.current) {
      window.clearTimeout(mapSearchDebounceRef.current);
      mapSearchDebounceRef.current = null;
    }

    const trimmed = value.trim();
    latestMapSearchQueryRef.current = trimmed;

    if (trimmed.length < 2) {
      setIsSearchingMapLocations(false);
      setMapSearchResults([]);
      setShowMapSearchResults(false);
      setMapSearchError(null);
      return;
    }

    setMapSearchError(null);
    setShowMapSearchResults(true);
    setIsSearchingMapLocations(true);

    mapSearchDebounceRef.current = window.setTimeout(async () => {
      try {
        const suggestions = await searchLocations(trimmed);

        if (latestMapSearchQueryRef.current !== trimmed) {
          return;
        }

        setMapSearchResults(suggestions);
        setMapSearchError(null);
      } catch (error) {
        console.error("Error searching map locations:", error);
        if (latestMapSearchQueryRef.current === trimmed) {
          setMapSearchResults([]);
          setMapSearchError(
            "We couldn't reach the live search service right now."
          );
        }
      } finally {
        if (latestMapSearchQueryRef.current === trimmed) {
          setIsSearchingMapLocations(false);
        }
      }
    }, 350);
  };

  const handleMapSearchFocus = () => {
    if (mapSearchBlurTimeoutRef.current) {
      window.clearTimeout(mapSearchBlurTimeoutRef.current);
      mapSearchBlurTimeoutRef.current = null;
    }

    if (mapSearchResults.length > 0 || mapSearchError) {
      setShowMapSearchResults(true);
    }
  };

  const handleMapSearchBlur = () => {
    if (mapSearchBlurTimeoutRef.current) {
      window.clearTimeout(mapSearchBlurTimeoutRef.current);
    }

    mapSearchBlurTimeoutRef.current = window.setTimeout(() => {
      setShowMapSearchResults(false);
    }, 150);
  };

  const handleMapSearchResultSelect = (suggestion: LocationSuggestion) => {
    if (mapSearchDebounceRef.current) {
      window.clearTimeout(mapSearchDebounceRef.current);
      mapSearchDebounceRef.current = null;
    }

    if (mapSearchBlurTimeoutRef.current) {
      window.clearTimeout(mapSearchBlurTimeoutRef.current);
      mapSearchBlurTimeoutRef.current = null;
    }

    setMapSearchQuery(suggestion.display_name);
    setShowMapSearchResults(false);
    setMapSearchResults([]);
    setIsSearchingMapLocations(false);
    setMapSearchError(null);

    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);

    if (!mapRef.current || Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }

    latestMapSearchQueryRef.current = suggestion.display_name;

    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16));
    setActivePlace(null);
    removeDroppedPinMarker();

    const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const popupId = Math.random().toString(36).slice(2, 10);
    const setStartId = `search-set-start-${popupId}`;
    const setEndId = `search-set-end-${popupId}`;
    const routeId = `search-route-${popupId}`;

    const marker = L.marker([lat, lng], {
      icon: droppedPinIcon,
      bubblingMouseEvents: false,
    }).addTo(mapRef.current);

    droppedPinMarkerRef.current = marker;

    const popupHtml = `
      <div style="min-width: 220px; font-family: system-ui;">
        <div style="font-weight: 600; margin-bottom: 4px; color: #1f2937;">
          ${escapeHtml(suggestion.display_name)}
        </div>
        <div style="font-size: 12px; color: #4b5563; margin-bottom: 10px;">
          ${coordsText}
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="${setStartId}"
            style="background: #22c55e; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
            Set as Start
          </button>
          <button id="${setEndId}"
            style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
            Set as Destination
          </button>
          <button id="${routeId}"
            style="background: #2563eb; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
            Route From My Location
          </button>
        </div>
      </div>`;

    marker.bindPopup(popupHtml, {
      autoPan: true,
      closeButton: true,
      className: "dropped-pin-popup",
    });

    marker.on("popupopen", () => {
      const startBtn = document.getElementById(setStartId);
      const endBtn = document.getElementById(setEndId);
      const routeBtn = document.getElementById(routeId);

      if (startBtn) {
        startBtn.addEventListener("click", () => {
          handleSelectStartLocation(suggestion);
          setRouteMode(false);
          setIsTerrainMode(false);
          setShowRoutePlannerModal(true);
          marker.closePopup();
        });
      }

      if (endBtn) {
        endBtn.addEventListener("click", () => {
          handleSelectEndLocation(suggestion);
          setRouteMode(false);
          setIsTerrainMode(false);
          setShowRoutePlannerModal(true);
          marker.closePopup();
        });
      }

      if (routeBtn) {
        routeBtn.addEventListener("click", () => {
          autoRoutePendingRef.current = true;
          handleSelectEndLocation(suggestion);
          setRouteMode(false);
          setIsTerrainMode(false);
          setShowRoutePlannerModal(false);
          useCurrentLocationAsStart();
          marker.closePopup();
        });
      }
    });

    marker.openPopup();
  };

  // Load terrain roads data for enhanced routing
  const loadTerrainRoadsData = async (): Promise<void> => {
    if (terrainRoadsLoaded) return;

    try {
      console.log("🗺️ Loading terrain roads data...");
      const response = await fetch("/data/terrain_roads.geojson");

      if (!response.ok) {
        throw new Error(`Failed to load terrain roads: ${response.status}`);
      }

      const data: TerrainRoadsData = await response.json();

      console.log(`✅ Loaded ${data.features.length} terrain road features`);
      console.log("📊 Sample road data:", {
        totalFeatures: data.features.length,
        floodedRoads: data.features.filter((f) => f.properties.flooded === "1")
          .length,
        safeRoads: data.features.filter((f) => f.properties.flooded === "0")
          .length,
        averageLength:
          (
            data.features.reduce((sum, f) => sum + f.properties.length_m, 0) /
            data.features.length
          ).toFixed(2) + "m",
      });

      const { metas, spatialIndex } = buildTerrainSpatialIndex(data.features);
      terrainRoadsMetaRef.current = metas;
      terrainSpatialIndexRef.current = spatialIndex;

      console.log(
        `🧭 Built terrain spatial index with ${spatialIndex.index.size} cells`
      );

      setTerrainRoadsData(data);
      setTerrainRoadsLoaded(true);
    } catch (error) {
      console.error("❌ Failed to load terrain roads data:", error);
      setTerrainRoadsLoaded(true); // Mark as loaded to prevent retry loops
    }
  };

  // Terrain-aware routing using the local roads network
  const getTerrainAwareRoute = async (
    start: LatLng,
    end: LatLng,
    priorityMode:
      | "safe"
      | "balanced"
      | "direct"
      | "manageable"
      | "flood_prone" = "balanced",
    options: TerrainRouteOptions = {}
  ): Promise<LatLng[]> => {
    console.log(`🛣️ Calculating terrain-aware ${priorityMode} route...`);

    const { excludeRoadIds } = options;
    const reservedRoadIds = new Set<string>();

    const registerReservedRoads = () => {
      if (!excludeRoadIds || reservedRoadIds.size === 0) {
        return;
      }
      reservedRoadIds.forEach((id) => excludeRoadIds.add(id));
    };

    const selectWaypoint = (
      preference: TerrainWaypointPreference
    ): LatLng | null => {
      if (!terrainRoadsData) {
        return null;
      }

      const exclusionSet = new Set<string>();
      if (excludeRoadIds) {
        excludeRoadIds.forEach((id) => exclusionSet.add(id));
      }
      reservedRoadIds.forEach((id) => exclusionSet.add(id));

      const candidate = pickTerrainWaypoint(
        terrainRoadsData.features,
        start,
        end,
        {
          ...preference,
          excludeRoadIds: exclusionSet,
        }
      );

      if (candidate) {
        reservedRoadIds.add(candidate.roadId);
        return candidate.point;
      }

      return null;
    };

    let strategicWaypoints: LatLng[] = [];

    if (terrainRoadsData) {
      switch (priorityMode) {
        case "safe": {
          const primary = selectWaypoint({
            floodPreference: "avoid",
            minElevation: 6,
            elevationWeight: 2.2,
            latPreference: 0.9,
            lngPreference: 0.35,
            corridorWidthKm: 1.2,
            positionBias: 0.45,
          });
          const secondary = selectWaypoint({
            floodPreference: "avoid",
            minElevation: 5,
            elevationWeight: 1.8,
            latPreference: 0.7,
            lngPreference: 0.25,
            corridorWidthKm: 1.4,
            positionBias: 0.7,
          });
          strategicWaypoints = [primary, secondary].filter(
            Boolean
          ) as LatLng[];
          console.log(
            `🛡️ Safe route waypoints selected: ${strategicWaypoints.length}`
          );
          break;
        }
        case "manageable": {
          const primary = selectWaypoint({
            floodPreference: "neutral",
            minElevation: 3,
            maxElevation: 8,
            elevationWeight: 0.8,
            latPreference: 0.25,
            lngPreference: -0.8,
            corridorWidthKm: 1.3,
            positionBias: 0.45,
          });
          const secondary = selectWaypoint({
            floodPreference: "neutral",
            minElevation: 2,
            maxElevation: 7,
            elevationWeight: 0.6,
            latPreference: 0.15,
            lngPreference: -0.9,
            corridorWidthKm: 1.6,
            positionBias: 0.7,
          });
          strategicWaypoints = [primary, secondary].filter(
            Boolean
          ) as LatLng[];
          console.log(
            `⚠️ Manageable route waypoints selected: ${strategicWaypoints.length}`
          );
          break;
        }
        case "flood_prone": {
          const primary = selectWaypoint({
            floodPreference: "prefer",
            maxElevation: 5,
            elevationWeight: -1.3,
            latPreference: -0.8,
            lngPreference: -0.35,
            corridorWidthKm: 1.8,
            positionBias: 0.5,
          });
          const secondary = selectWaypoint({
            floodPreference: "prefer",
            maxElevation: 6,
            elevationWeight: -1.0,
            latPreference: -0.6,
            lngPreference: -0.65,
            corridorWidthKm: 2.0,
            positionBias: 0.75,
          });
          strategicWaypoints = [primary, secondary].filter(
            Boolean
          ) as LatLng[];

          if (strategicWaypoints.length === 0) {
            const midpoint = computeMidpoint(start, end);
            const coastalBias = clampPointToBounds(
              {
                lat: Math.max(6.87, Math.min(7.04, midpoint.lat - 0.018)),
                lng: Math.max(122.02, Math.min(122.13, midpoint.lng - 0.02)),
              },
              SAFE_CITY_BOUNDS
            );
            strategicWaypoints = [coastalBias];
          }

          console.log(
            `🚨 Flood-prone route waypoints selected: ${strategicWaypoints.length}`
          );
          break;
        }
        case "direct": {
          strategicWaypoints = [];
          console.log(`🚀 Using direct route with no waypoints`);
          break;
        }
        case "balanced":
        default: {
          const midpoint = computeMidpoint(start, end);
          const cityWaypoint = biasTowardCityCenter(midpoint, 0.1);
          if (isWithinBounds(cityWaypoint, BALANCED_CITY_BOUNDS)) {
            strategicWaypoints = [cityWaypoint];
          }
          console.log(
            `⚖️ Using ${strategicWaypoints.length} city-center waypoints for balanced route`
          );
          break;
        }
      }
    } else {
      console.warn(
        "⚠️ Terrain roads data not loaded, falling back to standard routing"
      );
    }

    if (strategicWaypoints.length > 0) {
      console.log(
        `📍 Generated ${strategicWaypoints.length} strategic waypoints for ${priorityMode} route:`
      );
      strategicWaypoints.forEach((wp, i) => {
        console.log(`   Waypoint ${i + 1}: lat=${wp.lat}, lng=${wp.lng}`);
        if (wp.lat < 6.8 || wp.lat > 7.2 || wp.lng < 122.0 || wp.lng > 122.3) {
          console.error(`   ❌ Waypoint ${i + 1} is outside Zamboanga bounds!`);
        }
      });
    }

    try {
      if (USE_LOCAL_OSRM) {
        console.log(
          `🏠 Attempting local OSRM for ${priorityMode} route with ${strategicWaypoints.length} waypoints...`
        );
        const route = await getLocalOSRMRoute(start, end, strategicWaypoints);

        if (route.length > 1) {
          if (terrainRoadsData) {
            analyzeRouteRisk(route);
          }
          registerReservedRoads();
          return route;
        }

        console.warn(
          `⚠️ Local OSRM returned insufficient data for ${priorityMode}, falling back to external services`
        );
      }
    } catch (localError) {
      console.warn(
        `⚠️ Local OSRM unavailable for ${priorityMode} route:`,
        (localError as Error).message
      );
    }

    try {
      console.log(
        `🌐 Using external routing for ${priorityMode} route with terrain-based waypoints...`
      );

      let route: LatLng[] = [];

      if (strategicWaypoints.length > 0) {
        console.log(
          `📍 Using ${strategicWaypoints.length} terrain-based waypoints for ${priorityMode} route`
        );
        route = await getRouteFromAPI(start, end, strategicWaypoints);
      } else {
        const midpoint = computeMidpoint(start, end);

        if (priorityMode === "safe") {
          const safeWaypoint = clampPointToBounds(
            biasTowardCityCenter(midpoint, 0.2),
            SAFE_CITY_BOUNDS
          );
          route = await getRouteFromAPI(start, end, [safeWaypoint]);
        } else if (priorityMode === "manageable") {
          const manageableWaypoint = clampPointToBounds(
            { lat: midpoint.lat + 0.004, lng: midpoint.lng - 0.02 },
            SAFE_CITY_BOUNDS
          );
          route = await getRouteFromAPI(start, end, [manageableWaypoint]);
        } else if (priorityMode === "flood_prone") {
          const floodWaypoint = clampPointToBounds(
            {
              lat: Math.max(6.87, midpoint.lat - 0.02),
              lng: Math.max(122.02, midpoint.lng - 0.03),
            },
            SAFE_CITY_BOUNDS
          );
          route = await getRouteFromAPI(start, end, [floodWaypoint]);
        } else if (priorityMode === "direct") {
          route = await getRouteFromAPI(start, end, []);
        } else {
          const balancedWaypoint = clampPointToBounds(
            { lat: midpoint.lat + 0.005, lng: midpoint.lng },
            SAFE_CITY_BOUNDS
          );
          route = await getRouteFromAPI(start, end, [balancedWaypoint]);
        }
      }

      if (terrainRoadsData && route.length > 0) {
        analyzeRouteRisk(route);
      }

      if (route.length > 1) {
        registerReservedRoads();
        return route;
      }

      console.warn(
        `⚠️ External routing returned insufficient data for ${priorityMode}, returning fallback line`
      );
      return [start, end];
    } catch (error) {
      console.error(`❌ All routing failed for ${priorityMode} route:`, error);

      console.log(
        `📍 Creating fallback straight line for ${priorityMode} route`
      );
      return [start, end];
    }
  };

  // Analyze a route against terrain roads data for risk assessment
  const analyzeRouteRisk = (route: LatLng[]): void => {
    if (!terrainRoadsData || route.length === 0) return;

    let floodedSegments = 0;
    let totalSegments = 0;
    let riskScore = 0;

    // Check each route segment against nearby terrain roads
    for (let i = 0; i < route.length - 1; i++) {
      const segmentStart = route[i];
      const segmentEnd = route[i + 1];
      totalSegments++;

      // Find nearby terrain roads (within ~100m)
      const nearbyRoads = terrainRoadsData.features.filter((road) => {
        return road.geometry.coordinates.some((coord) => {
          const distance = Math.sqrt(
            Math.pow(coord[1] - segmentStart.lat, 2) +
              Math.pow(coord[0] - segmentStart.lng, 2)
          );
          return distance < 0.001; // ~100m threshold
        });
      });

      // Assess flood risk for this segment
      const floodedNearby = nearbyRoads.filter(
        (road) => road.properties.flooded === "1"
      );
      if (floodedNearby.length > 0) {
        floodedSegments++;
        riskScore += floodedNearby.length;
      }
    }

    const floodRiskPercentage =
      totalSegments > 0 ? (floodedSegments / totalSegments) * 100 : 0;

    console.log("🔍 Route Risk Analysis:", {
      totalSegments,
      floodedSegments,
      floodRiskPercentage: floodRiskPercentage.toFixed(1) + "%",
      riskScore,
      riskLevel:
        floodRiskPercentage < 20
          ? "Low"
          : floodRiskPercentage < 50
          ? "Medium"
          : "High",
    });
  };

  // Local OSRM route function for Zamboanga PBF data
  const getLocalOSRMRoute = async (
    start: LatLng,
    end: LatLng,
    waypoints: LatLng[] = []
  ): Promise<LatLng[]> => {
    try {
      // Build waypoints string
      const allPoints = [start, ...waypoints, end];
      const coordinatesStr = allPoints
        .map((point) => `${point.lng},${point.lat}`)
        .join(";");

      // Use your backend's local OSRM endpoint
      const localOSRMUrl = `${BACKEND_URL}/osrm/route?start=${start.lng},${
        start.lat
      }&end=${end.lng},${end.lat}${
        waypoints.length > 0
          ? `&waypoints=${waypoints
              .map((wp) => `${wp.lng},${wp.lat}`)
              .join(";")}`
          : ""
      }&alternatives=true`;

      console.log(`🗺️ Local OSRM URL: ${localOSRMUrl}`);
      console.log(
        `🗺️ Coordinates: Start=[${start.lng}, ${start.lat}] End=[${end.lng}, ${end.lat}]`
      );

      const response = await fetch(localOSRMUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Local OSRM API returned ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      console.log("🗺️ Local OSRM Response:", data);
      console.log("🔍 Response structure check:", {
        hasRoutes: !!data.routes,
        routesLength: data.routes?.length || 0,
        firstRoute: data.routes?.[0] ? "present" : "missing",
        geometry: data.routes?.[0]?.geometry ? "present" : "missing",
        coordinates: data.routes?.[0]?.geometry?.coordinates
          ? "present"
          : "missing",
        coordinatesLength: data.routes?.[0]?.geometry?.coordinates?.length || 0,
        osrmCode: data.code,
        osrmMessage: data.message,
      });

      // Check for OSRM response structure
      if (data.routes && data.routes[0] && data.routes[0].geometry) {
        let coordinates = [];

        // Handle different OSRM response formats
        if (data.routes[0].geometry.coordinates) {
          // GeoJSON format
          coordinates = data.routes[0].geometry.coordinates;
        } else if (data.routes[0].geometry.type === "LineString") {
          // Alternative GeoJSON format
          coordinates = data.routes[0].geometry.coordinates;
        } else {
          throw new Error("Unsupported geometry format in OSRM response");
        }

        // Convert coordinates from OSRM format [lng, lat] to LatLng {lat, lng}
        const route = coordinates.map((coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        }));

        // VALIDATION: Check if route is valid and reaches the destination
        if (route.length < 2) {
          throw new Error("Route too short - likely invalid");
        }

        // Check if route actually reaches near the destination
        const lastPoint = route[route.length - 1];
        const distanceToEnd = Math.sqrt(
          Math.pow(lastPoint.lat - end.lat, 2) +
            Math.pow(lastPoint.lng - end.lng, 2)
        );

        // If route doesn't get within ~500m of destination, it's likely a dead end
        if (distanceToEnd > 0.005) {
          // ~500m in degrees
          console.warn(
            `⚠️ Route doesn't reach destination (${distanceToEnd.toFixed(
              6
            )} deg away)`
          );
          throw new Error("Route does not reach destination - likely dead end");
        }

        // APPLY ROUTE SIMPLIFICATION to reduce excessive waypoints
        const simplifiedRoute = simplifyRoute(route, 0.0001);

        console.log(
          `✅ Local OSRM Success: Got ${route.length} waypoints, simplified to ${simplifiedRoute.length} for Zamboanga route`
        );
        return simplifiedRoute;
      }

      // Check for error in response
      if (data.code && data.code !== "Ok") {
        const errorMsg = data.message || "No route found";
        console.warn(`⚠️ OSRM routing issue: ${data.code} - ${errorMsg}`);
        throw new Error(`OSRM Error: ${data.code} - ${errorMsg}`);
      }

      console.warn("⚠️ Local OSRM response missing expected route structure");
      throw new Error("No valid route found in local OSRM response");
    } catch (error) {
      // Don't spam console with expected routing failures
      if (
        error.message.includes("RequestError") ||
        error.message.includes("NoRoute")
      ) {
        console.warn(
          "⚠️ Local OSRM route not available (trying fallback):",
          error.message
        );
      } else {
        console.error("❌ Local OSRM failed:", error);
      }
      throw error;
    }
  };

  // Get multiple distinct routes using local OSRM with different waypoint strategies
  const getLocalOSRMDistinctRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<{ safe: LatLng[]; manageable: LatLng[]; prone: LatLng[] }> => {
    console.log(
      "🗺️ Getting distinct routes using local OSRM with strategic waypoints..."
    );

    const routes = {
      safe: null as LatLng[] | null,
      manageable: null as LatLng[] | null,
      prone: null as LatLng[] | null,
    };

    try {
      // Strategy 1: Try to get multiple alternatives from OSRM directly first
      console.log("  Strategy 1: Requesting alternatives from OSRM...");
      const localOSRMUrl = `${BACKEND_URL}/osrm/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true&alternative.max_paths=3`;

      const response = await fetch(localOSRMUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();

        if (data.routes && data.routes.length >= 2) {
          console.log(
            `  ✅ Got ${data.routes.length} alternative routes from OSRM`
          );

          // Use the alternatives as distinct routes
          for (let i = 0; i < Math.min(3, data.routes.length); i++) {
            const routeData = data.routes[i];
            if (routeData.geometry && routeData.geometry.coordinates) {
              const route = routeData.geometry.coordinates.map(
                (coord: number[]) => ({
                  lat: coord[1],
                  lng: coord[0],
                })
              );

              // Validate route reaches destination
              const lastPoint = route[route.length - 1];
              const distanceToEnd = Math.sqrt(
                Math.pow(lastPoint.lat - end.lat, 2) +
                  Math.pow(lastPoint.lng - end.lng, 2)
              );

              if (distanceToEnd <= 0.005 && route.length >= 2) {
                // Valid route
                if (i === 0) routes.safe = route;
                else if (i === 1) routes.manageable = route;
                else if (i === 2) routes.prone = route;
              }
            }
          }

          // If we got good alternatives, return them
          if (routes.safe && routes.manageable) {
            console.log(
              "  🎉 Successfully got distinct routes from OSRM alternatives!"
            );
            return {
              safe: routes.safe || [],
              manageable: routes.manageable || [],
              prone: routes.prone || [],
            };
          }
        }
      }

      console.log(
        "  Strategy 1 failed, falling back to waypoint strategies..."
      );

      // Strategy 2: Direct route (will be used as safe route)
      console.log("  Strategy 2: Direct route for safe path...");
      routes.safe = await getLocalOSRMRoute(start, end, []);

      // Strategy 3: EXTREME Northern arc route for manageable
      console.log("  Strategy 3: Extreme northern arc for manageable path...");
      const distance = Math.sqrt(
        Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
      );

      // Create a wide northern arc with multiple waypoints for guaranteed divergence
      const northWaypoints = [];
      const arcRadius = distance * 0.8; // Much larger arc - 80% of distance

      // Early divergence point - force route north immediately
      northWaypoints.push({
        lat: start.lat + arcRadius * 0.6, // Strong northward push from start
        lng: start.lng + (end.lng - start.lng) * 0.2, // 20% progress eastward
      });

      // Mid-route northern peak
      northWaypoints.push({
        lat: (start.lat + end.lat) / 2 + arcRadius * 0.7, // Peak of northern arc
        lng: (start.lng + end.lng) / 2, // Centered longitude
      });

      // Late northern waypoint before destination
      northWaypoints.push({
        lat: end.lat + arcRadius * 0.4, // Still north of destination
        lng: start.lng + (end.lng - start.lng) * 0.8, // 80% progress eastward
      });

      routes.manageable = await getLocalOSRMRoute(start, end, northWaypoints);

      // Strategy 4: EXTREME Southern arc route for prone
      console.log("  Strategy 4: Extreme southern arc for flood-prone path...");

      const southWaypoints = [];

      // Early southern divergence - force route south immediately
      southWaypoints.push({
        lat: start.lat - arcRadius * 0.5, // Strong southward push from start
        lng: start.lng + (end.lng - start.lng) * 0.25, // 25% progress eastward
      });

      // Mid-route southern dip
      southWaypoints.push({
        lat: (start.lat + end.lat) / 2 - arcRadius * 0.6, // Deep southern dip
        lng: (start.lng + end.lng) / 2 + arcRadius * 0.2, // Slight eastern offset
      });

      // Late southern waypoint before destination
      southWaypoints.push({
        lat: end.lat - arcRadius * 0.3, // Still south of destination
        lng: start.lng + (end.lng - start.lng) * 0.75, // 75% progress eastward
      });

      routes.prone = await getLocalOSRMRoute(start, end, southWaypoints);
    } catch (error) {
      console.warn("Some local OSRM routes failed, will use fallbacks:", error);
    }

    // Fill in any missing routes with EXTREME alternative strategies
    if (!routes.manageable && routes.safe) {
      console.log(
        "  Fallback: Using EXTREME eastern detour for manageable route..."
      );
      try {
        const distance = Math.sqrt(
          Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
        );

        // Create extreme eastern detour with multiple waypoints
        const extremeEastWaypoints = [
          {
            lat: start.lat + distance * 0.3, // North-east from start
            lng: start.lng + distance * 1.0, // WAY east - 100% of distance
          },
          {
            lat: (start.lat + end.lat) / 2, // Mid-route
            lng: Math.max(start.lng, end.lng) + distance * 0.8, // Far eastern detour
          },
          {
            lat: end.lat - distance * 0.2, // Approach from south-east
            lng: end.lng + distance * 0.6, // Still far east
          },
        ];

        routes.manageable = await getLocalOSRMRoute(
          start,
          end,
          extremeEastWaypoints
        );
      } catch (error) {
        console.log("  Extreme eastern fallback failed");
      }
    }

    if (!routes.prone && routes.safe) {
      console.log(
        "  Fallback: Using EXTREME western coastal detour for flood-prone route..."
      );
      try {
        const distance = Math.sqrt(
          Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
        );

        // Create extreme western coastal detour with multiple waypoints
        const extremeWestWaypoints = [
          {
            lat: start.lat - distance * 0.4, // South-west from start
            lng: start.lng - distance * 0.9, // WAY west - 90% of distance
          },
          {
            lat: (start.lat + end.lat) / 2 - distance * 0.3, // Deep southern dip
            lng: Math.min(start.lng, end.lng) - distance * 0.7, // Far western coastal
          },
          {
            lat: end.lat + distance * 0.1, // Approach from north-west
            lng: end.lng - distance * 0.5, // Still west of destination
          },
        ];

        routes.prone = await getLocalOSRMRoute(
          start,
          end,
          extremeWestWaypoints
        );
      } catch (error) {
        console.log("  Extreme western fallback failed");
      }
    }

    return {
      safe: routes.safe || [],
      manageable: routes.manageable || [],
      prone: routes.prone || [],
    };
  };

  // Generate guaranteed distinct routes using strategic waypoints when routing services fail
  const generateDistinctAlternativeRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<{ safe: LatLng[]; manageable: LatLng[]; prone: LatLng[] }> => {
    console.log("🛣️ Generating guaranteed distinct alternative routes...");

    const routes = {
      safe: [] as LatLng[],
      manageable: [] as LatLng[],
      prone: [] as LatLng[],
    };

    const distance = Math.sqrt(
      Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
    );

    // Strategy 1: Direct route (safest - shortest path)
    try {
      routes.safe = await getLocalOSRMRoute(start, end, []);
      console.log(`✅ Safe direct route: ${routes.safe.length} points`);
    } catch (error) {
      console.warn("Direct route failed, no fallback");
      routes.safe = []; // No fallback
    }

    // Strategy 2: Northern arc route (manageable - longer but safer elevation)
    try {
      const northWaypoints = [];
      // Create a wide northern arc with multiple control points
      for (let i = 0.2; i <= 0.8; i += 0.2) {
        const progress = i;
        const arcHeight = distance * 0.6; // Large arc - 60% of distance
        const midLat = start.lat + (end.lat - start.lat) * progress;
        const midLng = start.lng + (end.lng - start.lng) * progress;

        // Calculate perpendicular offset for northern arc
        const routeAngle = Math.atan2(end.lng - start.lng, end.lat - start.lat);
        const perpAngle = routeAngle + Math.PI / 2;

        const waypointLat =
          midLat +
          Math.cos(perpAngle) * arcHeight * Math.sin(progress * Math.PI);
        const waypointLng =
          midLng +
          Math.sin(perpAngle) * arcHeight * Math.sin(progress * Math.PI);

        northWaypoints.push({ lat: waypointLat, lng: waypointLng });
      }

      routes.manageable = await getLocalOSRMRoute(start, end, northWaypoints);
      console.log(`✅ Northern arc route: ${routes.manageable.length} points`);
    } catch (error) {
      console.warn("Northern arc route failed, no fallback");
      routes.manageable = []; // No fallback
    }

    // Strategy 3: Southern/coastal route (prone - longer coastal route)
    try {
      const southWaypoints = [];
      // Create a wide southern arc with coastal waypoints
      for (let i = 0.25; i <= 0.75; i += 0.25) {
        const progress = i;
        const arcHeight = distance * 0.5; // Large southern arc
        const midLat = start.lat + (end.lat - start.lat) * progress;
        const midLng = start.lng + (end.lng - start.lng) * progress;

        // Calculate perpendicular offset for southern arc (opposite direction)
        const routeAngle = Math.atan2(end.lng - start.lng, end.lat - start.lat);
        const perpAngle = routeAngle - Math.PI / 2; // Southern side

        const waypointLat =
          midLat +
          Math.cos(perpAngle) * arcHeight * Math.sin(progress * Math.PI);
        const waypointLng =
          midLng +
          Math.sin(perpAngle) * arcHeight * Math.sin(progress * Math.PI);

        southWaypoints.push({ lat: waypointLat, lng: waypointLng });
      }

      routes.prone = await getLocalOSRMRoute(start, end, southWaypoints);
      console.log(`✅ Southern coastal route: ${routes.prone.length} points`);
    } catch (error) {
      console.warn("Southern coastal route failed, no fallback");
      routes.prone = []; // No fallback
    }

    console.log(
      `🛣️ Generated distinct routes: Safe(${routes.safe.length}), Manageable(${routes.manageable.length}), Prone(${routes.prone.length})`
    );

    return routes;
  };

  // STRICT ROUTE DISTINCTNESS VALIDATION - checks actual path diversity
  const validateRouteDistinctness = (routes: any[]): boolean => {
    console.log("🔍 Performing strict route distinctness validation...");

    if (routes.length < 2) return true; // Single route is always distinct

    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const route1 = routes[i];
        const route2 = routes[j];

        if (
          !route1.waypoints ||
          !route2.waypoints ||
          route1.waypoints.length < 5 ||
          route2.waypoints.length < 5
        ) {
          console.warn(
            `⚠️ Route ${i + 1} or ${
              j + 1
            } has insufficient waypoints for validation`
          );
          continue;
        }

        // Calculate path similarity using multiple metrics
        const pathSimilarity = calculatePathSimilarity(
          route1.waypoints,
          route2.waypoints
        );

        // Check direction divergence at key points
        const directionDivergence = calculateDirectionDivergence(
          route1.waypoints,
          route2.waypoints
        );

        // Calculate area between paths
        const areaBetweenPaths = calculateAreaBetweenPaths(
          route1.waypoints,
          route2.waypoints
        );

        console.log(
          `Route ${i + 1} vs ${j + 1}: Similarity=${pathSimilarity.toFixed(
            1
          )}%, Direction=${directionDivergence.toFixed(
            1
          )}°, Area=${areaBetweenPaths.toFixed(2)}km²`
        );

        // STRICT CRITERIA: Routes must be significantly different
        if (
          pathSimilarity > 60 ||
          directionDivergence < 15 ||
          areaBetweenPaths < 0.5
        ) {
          console.warn(
            `❌ Routes ${i + 1} and ${
              j + 1
            } are too similar - Similarity: ${pathSimilarity.toFixed(
              1
            )}%, Divergence: ${directionDivergence.toFixed(
              1
            )}°, Area: ${areaBetweenPaths.toFixed(2)}km²`
          );
          return false;
        }
      }
    }

    console.log("✅ All routes pass strict distinctness validation");
    return true;
  };

  // Calculate path similarity percentage
  const calculatePathSimilarity = (
    path1: LatLng[],
    path2: LatLng[]
  ): number => {
    const samplePoints = Math.min(20, Math.min(path1.length, path2.length));
    let similarPoints = 0;
    const tolerance = 0.001; // ~100m tolerance

    for (let i = 0; i < samplePoints; i++) {
      const progress = i / (samplePoints - 1);
      const idx1 = Math.floor(progress * (path1.length - 1));
      const idx2 = Math.floor(progress * (path2.length - 1));

      const point1 = path1[idx1];
      const point2 = path2[idx2];

      const distance = Math.sqrt(
        Math.pow(point1.lat - point2.lat, 2) +
          Math.pow(point1.lng - point2.lng, 2)
      );

      if (distance < tolerance) {
        similarPoints++;
      }
    }

    return (similarPoints / samplePoints) * 100;
  };

  // Calculate average direction divergence between paths
  const calculateDirectionDivergence = (
    path1: LatLng[],
    path2: LatLng[]
  ): number => {
    const sampleSegments = Math.min(
      10,
      Math.min(path1.length - 1, path2.length - 1)
    );
    let totalDivergence = 0;

    for (let i = 0; i < sampleSegments; i++) {
      const progress = i / (sampleSegments - 1);
      const idx1 = Math.floor(progress * (path1.length - 2));
      const idx2 = Math.floor(progress * (path2.length - 2));

      // Calculate direction vectors
      const dir1 = {
        lat: path1[idx1 + 1].lat - path1[idx1].lat,
        lng: path1[idx1 + 1].lng - path1[idx1].lng,
      };
      const dir2 = {
        lat: path2[idx2 + 1].lat - path2[idx2].lat,
        lng: path2[idx2 + 1].lng - path2[idx2].lng,
      };

      // Calculate angle between directions
      const angle1 = Math.atan2(dir1.lng, dir1.lat);
      const angle2 = Math.atan2(dir2.lng, dir2.lat);

      let angleDiff = Math.abs(angle1 - angle2) * (180 / Math.PI);
      if (angleDiff > 180) angleDiff = 360 - angleDiff;

      totalDivergence += angleDiff;
    }

    return totalDivergence / sampleSegments;
  };

  // Calculate area between two paths
  const calculateAreaBetweenPaths = (
    path1: LatLng[],
    path2: LatLng[]
  ): number => {
    const samplePoints = Math.min(15, Math.min(path1.length, path2.length));
    let totalArea = 0;

    for (let i = 0; i < samplePoints - 1; i++) {
      const progress1 = i / (samplePoints - 1);
      const progress2 = (i + 1) / (samplePoints - 1);

      const idx1_1 = Math.floor(progress1 * (path1.length - 1));
      const idx1_2 = Math.floor(progress2 * (path1.length - 1));
      const idx2_1 = Math.floor(progress1 * (path2.length - 1));
      const idx2_2 = Math.floor(progress2 * (path2.length - 1));

      // Calculate quadrilateral area between path segments
      const p1 = path1[idx1_1];
      const p2 = path1[idx1_2];
      const p3 = path2[idx2_2];
      const p4 = path2[idx2_1];

      // Shoelace formula for polygon area
      const area =
        Math.abs(
          p1.lng * p2.lat -
            p2.lng * p1.lat +
            (p2.lng * p3.lat - p3.lng * p2.lat) +
            (p3.lng * p4.lat - p4.lng * p3.lat) +
            (p4.lng * p1.lat - p1.lng * p4.lat)
        ) / 2;

      totalArea += area;
    }

    // Convert to km² (approximate)
    return totalArea * 111 * 111;
  };

  const getRouteFromAPI = async (
    start: LatLng,
    end: LatLng,
    waypoints: LatLng[] = []
  ): Promise<LatLng[]> => {
    // First try LOCAL OSRM (most accurate for Zamboanga), then GraphHopper, then public OSRM
    if (USE_LOCAL_OSRM) {
      try {
        console.log(
          "🚀 Trying local OSRM first for Zamboanga-specific routing..."
        );
        return await getLocalOSRMRoute(start, end, waypoints);
      } catch (localError) {
        console.warn(
          "🔄 Local OSRM failed, falling back to external services:",
          localError.message
        );
        // Continue to external services instead of throwing
      }
    } else {
      console.log(
        "📍 Local OSRM disabled via configuration, using external services..."
      );
    }

    // Try GraphHopper first (better for routing with waypoints)
    try {
      const apiKey = import.meta.env.VITE_GRAPHHOPPER_API_KEY;
      if (apiKey && apiKey !== "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea") {
        console.log("🗺️ Using GraphHopper for routing...");
        return await getGraphHopperRoute(start, end, waypoints);
      }
      console.log("⚠️ No valid GraphHopper API key, trying public OSRM...");
    } catch (graphHopperError) {
      console.warn(
        "🔄 GraphHopper failed, falling back to public OSRM:",
        graphHopperError.message
      );
    }

    // Fallback to public OSRM
    try {
      console.log("🌐 Using public OSRM for routing...");
      return await getOSRMRoute(start, end, waypoints);
    } catch (osrmError) {
      console.error("❌ All routing services failed:", osrmError.message);
      throw new Error("No routing service available");
    }
  };

  const getGraphHopperRoute = async (
    start: LatLng,
    end: LatLng,
    waypoints: LatLng[] = []
  ): Promise<LatLng[]> => {
    try {
      // Build the waypoints array for GraphHopper API
      const allPoints = [start, ...waypoints, end];
      const pointParams = allPoints
        .map((point, index) => `point=${point.lat},${point.lng}`)
        .join("&");

      const apiKey =
        import.meta.env.VITE_GRAPHHOPPER_API_KEY ||
        "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea";
      const response = await fetch(
        `https://graphhopper.com/api/1/route?${pointParams}&vehicle=car&key=${apiKey}&calc_points=true&alternative_route.max_paths=3`
      );

      if (!response.ok) {
        throw new Error(`GraphHopper API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.paths && data.paths[0] && data.paths[0].points) {
        // GraphHopper returns encoded polyline by default, but we requested calc_points=true
        // Convert coordinates from GraphHopper format
        const route = data.paths[0].points.coordinates.map(
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

        // Apply route simplification to reduce excessive waypoints
        const finalRoute = filteredRoute.length > 1 ? filteredRoute : route;
        const simplifiedRoute = simplifyRoute(finalRoute, 0.0001);

        return simplifiedRoute;
      }
      return [];
    } catch (error) {
      console.error("Error fetching GraphHopper route:", error);
      return [];
    }
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

        // Apply route simplification to reduce excessive waypoints
        const finalRoute = filteredRoute.length > 1 ? filteredRoute : route;
        const simplifiedRoute = simplifyRoute(finalRoute, 0.0001);

        return simplifiedRoute;
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

  // Local OSRM alternative routes for better Zamboanga-specific routing
  const getLocalOSRMAlternativeRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<RouteAnalysis> => {
    try {
      // Use your backend's local OSRM endpoint for alternatives
      const response = await fetch(
        `${BACKEND_URL}/osrm/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          `Local OSRM alternatives API returned ${response.status}`
        );
      }

      const data = await response.json();
      console.log("🗺️ Local OSRM Alternative Routes Response:", data);

      const routes: LatLng[][] = [];
      const analyses = [];

      if (
        data.source === "local_osrm" &&
        data.routes &&
        data.routes.length > 0
      ) {
        console.log(
          `✅ Local OSRM returned ${data.routes.length} alternative routes for Zamboanga`
        );

        // Process each route from local OSRM
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

          // Get detailed analysis for local route
          const analysis = await analyzeRouteElevation(waypoints);
          routes.push(waypoints);
          analyses.push(analysis);
        }

        // Sort routes by risk score if we have multiple
        if (routes.length > 1) {
          const routePairs = routes.map((route, index) => ({
            route,
            analysis: analyses[index],
          }));

          // Sort by average elevation (higher is generally safer in flood-prone areas)
          routePairs.sort(
            (a, b) => b.analysis.avgElevation - a.analysis.avgElevation
          );

          return {
            routes: routePairs.map((pair) => pair.route),
            analyses: routePairs.map((pair) => pair.analysis),
          };
        }

        return { routes, analyses };
      }

      throw new Error("No valid routes found in local OSRM response");
    } catch (error) {
      console.error("❌ Local OSRM alternatives failed:", error);
      throw error;
    }
  };

  const getAlternativeRoutesFromAPI = async (
    start: LatLng,
    end: LatLng
  ): Promise<RouteAnalysis> => {
    // First try LOCAL OSRM alternatives, then GraphHopper, then public OSRM
    if (USE_LOCAL_OSRM) {
      try {
        console.log(
          "🚀 Trying local OSRM alternatives first for Zamboanga-specific routing..."
        );
        return await getLocalOSRMAlternativeRoutes(start, end);
      } catch (localError) {
        console.warn(
          "🔄 Local OSRM alternatives failed, falling back to GraphHopper:",
          localError.message
        );
      }
    } else {
      console.log(
        "📍 Local OSRM disabled via configuration, using external alternatives..."
      );
    }

    try {
      const apiKey = import.meta.env.VITE_GRAPHHOPPER_API_KEY;
      if (apiKey && apiKey !== "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea") {
        return await getGraphHopperAlternativeRoutes(start, end);
      }
      throw new Error("No GraphHopper API key");
    } catch (graphHopperError) {
      console.warn(
        "🔄 GraphHopper alternatives failed, falling back to public OSRM:",
        graphHopperError.message
      );
      return await getOSRMAlternativeRoutes(start, end);
    }
  };

  const getGraphHopperAlternativeRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<RouteAnalysis> => {
    try {
      // Get multiple route alternatives with GraphHopper
      const apiKey =
        import.meta.env.VITE_GRAPHHOPPER_API_KEY ||
        "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea";
      const response = await fetch(
        `https://graphhopper.com/api/1/route?point=${start.lat},${start.lng}&point=${end.lat},${end.lng}&vehicle=car&key=${apiKey}&calc_points=true&alternative_route.max_paths=3&instructions=true`
      );

      if (!response.ok) {
        throw new Error(`GraphHopper API returned ${response.status}`);
      }

      const data = await response.json();
      const routes: LatLng[][] = [];
      const analyses = [];

      if (data.paths && data.paths.length > 0) {
        console.log(
          `GraphHopper returned ${data.paths.length} alternative routes`
        );

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

        // Process each path (GraphHopper uses "paths" instead of "routes")
        for (const path of data.paths) {
          if (!path.points || !path.points.coordinates) {
            console.warn("Path missing geometry data");
            continue;
          }

          const waypoints = path.points.coordinates.map((coord: number[]) => ({
            lat: coord[1],
            lng: coord[0],
          }));

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
        // No valid routes found - don't create direct fallback
        console.warn("No valid GraphHopper routes found for this route");
        return {
          routes: [],
          analyses: [],
        };
      }

      return { routes, analyses };
    } catch (error) {
      console.error("Error fetching GraphHopper alternative routes:", error);

      // Don't fallback to direct route
      return {
        routes: [],
        analyses: [],
      };
    }
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
        // No valid routes found - don't create direct fallback
        console.warn("No valid OSRM routes found for this route");
        return {
          routes: [],
          analyses: [],
        };
      }

      return { routes, analyses };
    } catch (error) {
      console.error("Error fetching OSRM alternative routes:", error);

      // Don't fallback to direct route
      return {
        routes: [],
        analyses: [],
      };
    }
  };

  // Local OSRM route with waypoints for Zamboanga-specific routing
  const getLocalOSRMRouteWithWaypoint = async (
    start: LatLng,
    waypoint: LatLng,
    end: LatLng
  ): Promise<LatLng[]> => {
    try {
      // Use your backend's local OSRM endpoint with waypoints
      const response = await fetch(
        `${BACKEND_URL}/osrm/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&waypoints=${waypoint.lng},${waypoint.lat}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Local OSRM waypoint API returned ${response.status}`);
      }

      const data = await response.json();
      console.log("🗺️ Local OSRM Waypoint Response:", data);

      // Check for OSRM response structure
      if (data.routes && data.routes[0] && data.routes[0].geometry) {
        let coordinates = [];

        // Handle different OSRM response formats
        if (data.routes[0].geometry.coordinates) {
          // GeoJSON format
          coordinates = data.routes[0].geometry.coordinates;
        } else if (data.routes[0].geometry.type === "LineString") {
          // Alternative GeoJSON format
          coordinates = data.routes[0].geometry.coordinates;
        } else {
          throw new Error(
            "Unsupported geometry format in OSRM waypoint response"
          );
        }

        // Convert coordinates from OSRM format [lng, lat] to LatLng {lat, lng}
        const route = coordinates.map((coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        }));

        console.log(
          `✅ Local OSRM waypoint success: Got ${route.length} waypoints for Zamboanga route`
        );
        return route;
      }

      // Check for error in response
      if (data.code && data.code !== "Ok") {
        throw new Error(
          `OSRM Waypoint Error: ${data.code} - ${
            data.message || "No route found"
          }`
        );
      }

      throw new Error("No valid waypoint route found in local OSRM response");
    } catch (error) {
      console.error("❌ Local OSRM waypoint failed:", error);
      throw error;
    }
  };

  const getRouteWithWaypointFromAPI = async (
    start: LatLng,
    waypoint: LatLng,
    end: LatLng
  ): Promise<LatLng[]> => {
    // First try LOCAL OSRM, then GraphHopper, then public OSRM
    if (USE_LOCAL_OSRM) {
      try {
        console.log(
          "🚀 Trying local OSRM waypoint first for Zamboanga-specific routing..."
        );
        return await getLocalOSRMRouteWithWaypoint(start, waypoint, end);
      } catch (localError) {
        console.warn(
          "🔄 Local OSRM waypoint failed, falling back to GraphHopper:",
          localError.message
        );
      }
    } else {
      console.log(
        "📍 Local OSRM disabled via configuration, using external waypoint routing..."
      );
    }

    try {
      const apiKey = import.meta.env.VITE_GRAPHHOPPER_API_KEY;
      if (apiKey && apiKey !== "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea") {
        return await getGraphHopperRouteWithWaypoint(start, waypoint, end);
      }
      throw new Error("No GraphHopper API key");
    } catch (graphHopperError) {
      console.warn(
        "🔄 GraphHopper waypoint failed, falling back to public OSRM:",
        graphHopperError.message
      );
      return await getOSRMRouteWithWaypoint(start, waypoint, end);
    }
  };

  const getGraphHopperRouteWithWaypoint = async (
    start: LatLng,
    waypoint: LatLng,
    end: LatLng
  ): Promise<LatLng[]> => {
    try {
      const apiKey =
        import.meta.env.VITE_GRAPHHOPPER_API_KEY ||
        "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea";
      const response = await fetch(
        `https://graphhopper.com/api/1/route?point=${start.lat},${start.lng}&point=${waypoint.lat},${waypoint.lng}&point=${end.lat},${end.lng}&vehicle=car&key=${apiKey}&calc_points=true`
      );
      const data = await response.json();

      if (data.paths && data.paths[0] && data.paths[0].points) {
        return data.paths[0].points.coordinates.map((coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        }));
      }
      return [];
    } catch (error) {
      console.error("Error fetching GraphHopper route with waypoint:", error);
      return [];
    }
  };

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

  // NEW FUNCTION - Simplify route to reduce excessive waypoints
  const simplifyRoute = (
    waypoints: LatLng[],
    tolerance: number = 0.0001
  ): LatLng[] => {
    if (waypoints.length <= 2) return waypoints;

    console.log(`🔧 Simplifying route from ${waypoints.length} waypoints...`);

    // First, apply distance-based filtering to remove very close points
    const distanceFiltered = [waypoints[0]]; // Always keep start

    for (let i = 1; i < waypoints.length - 1; i++) {
      const prev = distanceFiltered[distanceFiltered.length - 1];
      const current = waypoints[i];

      // Calculate distance between points
      const distance = Math.sqrt(
        Math.pow(current.lat - prev.lat, 2) +
          Math.pow(current.lng - prev.lng, 2)
      );

      // Only keep points that are at least 50m apart (roughly 0.0005 degrees)
      if (distance > 0.0005) {
        distanceFiltered.push(current);
      }
    }

    distanceFiltered.push(waypoints[waypoints.length - 1]); // Always keep end

    // Then apply Douglas-Peucker simplification for smooth curves
    const douglasPeucker = (points: LatLng[], epsilon: number): LatLng[] => {
      if (points.length <= 2) return points;

      // Find the point with the maximum distance from the line between start and end
      let maxDistance = 0;
      let maxIndex = 0;
      const start = points[0];
      const end = points[points.length - 1];

      for (let i = 1; i < points.length - 1; i++) {
        const point = points[i];
        const distance = perpendicularDistance(point, start, end);

        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }

      // If max distance is greater than epsilon, recursively simplify
      if (maxDistance > epsilon) {
        const leftSegment = douglasPeucker(
          points.slice(0, maxIndex + 1),
          epsilon
        );
        const rightSegment = douglasPeucker(points.slice(maxIndex), epsilon);

        // Combine segments (remove duplicate middle point)
        return [...leftSegment.slice(0, -1), ...rightSegment];
      } else {
        // If no point is far enough, just return start and end
        return [start, end];
      }
    };

    // Helper function to calculate perpendicular distance from point to line
    const perpendicularDistance = (
      point: LatLng,
      lineStart: LatLng,
      lineEnd: LatLng
    ): number => {
      const x0 = point.lng;
      const y0 = point.lat;
      const x1 = lineStart.lng;
      const y1 = lineStart.lat;
      const x2 = lineEnd.lng;
      const y2 = lineEnd.lat;

      const numerator = Math.abs(
        (y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1
      );
      const denominator = Math.sqrt(
        Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2)
      );

      return denominator === 0 ? 0 : numerator / denominator;
    };

    const simplified = douglasPeucker(distanceFiltered, tolerance);

    console.log(
      `✅ Route simplified: ${waypoints.length} → ${distanceFiltered.length} → ${simplified.length} waypoints`
    );

    return simplified;
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

  // Validate route connectivity
  const validateRoute = (
    waypoints: LatLng[],
    expectedStart: LatLng,
    expectedEnd: LatLng
  ): LatLng[] => {
    if (!waypoints || waypoints.length < 2) {
      console.warn("Invalid route - too few waypoints");
      return [expectedStart, expectedEnd];
    }

    // Check distance from expected start/end
    const startDist =
      Math.sqrt(
        Math.pow(waypoints[0].lat - expectedStart.lat, 2) +
          Math.pow(waypoints[0].lng - expectedStart.lng, 2)
      ) * 111000; // meters

    const endDist =
      Math.sqrt(
        Math.pow(waypoints[waypoints.length - 1].lat - expectedEnd.lat, 2) +
          Math.pow(waypoints[waypoints.length - 1].lng - expectedEnd.lng, 2)
      ) * 111000; // meters

    // If route is severely off, return simple direct route
    if (startDist > 5000 || endDist > 5000) {
      console.warn(
        `Route validation failed - start: ${startDist}m, end: ${endDist}m off`
      );
      return [expectedStart, expectedEnd];
    }

    // Fix start/end points if slightly off
    const fixedWaypoints = [...waypoints];
    if (startDist > 500) fixedWaypoints[0] = expectedStart;
    if (endDist > 500) fixedWaypoints[fixedWaypoints.length - 1] = expectedEnd;

    return fixedWaypoints;
  };

  // Generate helper function to create curved routes between two points
  const createCurvedRoute = (
    start: LatLng,
    end: LatLng,
    curveDirection: "north" | "south" | "east" | "west" | "direct",
    curveIntensity: number = 0.3
  ): LatLng[] => {
    // Calculate route length to scale curve appropriately
    const routeDistance = Math.sqrt(
      Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
    );

    const baseOffset = routeDistance * curveIntensity;

    let waypoints: LatLng[] = [start];

    if (curveDirection === "direct") {
      // Simple direct route with just start and end
      waypoints.push(end);
    } else {
      // Create curved routes with multiple control points for smooth curves
      const numPoints = 8; // More points for smoother, more distinct curves

      for (let i = 1; i < numPoints; i++) {
        const progress = i / numPoints;

        // Linear interpolation between start and end
        let lat = start.lat + (end.lat - start.lat) * progress;
        let lng = start.lng + (end.lng - start.lng) * progress;

        // Apply curve offset (strongest at midpoint with smooth falloff)
        const curveStrength = Math.sin(progress * Math.PI) * baseOffset;

        switch (curveDirection) {
          case "north":
            lat += curveStrength;
            break;
          case "south":
            lat -= curveStrength;
            break;
          case "east":
            lng += curveStrength;
            break;
          case "west":
            lng -= curveStrength;
            break;
        }

        waypoints.push({ lat, lng });
      }

      waypoints.push(end);
    }

    return waypoints;
  };

  // Enhanced route validation to prevent chaotic routes - VERY LENIENT for real roads
  const validateRouteIsNotChaotic = (
    routeWaypoints: LatLng[],
    originalStart: LatLng,
    originalEnd: LatLng,
    isGraphHopperRoute: boolean = false
  ): boolean => {
    if (routeWaypoints.length < 2) return false;

    const directDistance = calculateRouteDistance([originalStart, originalEnd]);
    const routeDistance = calculateRouteDistance(routeWaypoints);

    // Check 1: Route length should be reasonable compared to direct distance
    // EXTREMELY generous limits for real road routing - GraphHopper roads can be very long due to real constraints
    let maxRouteMultiplier;
    if (isGraphHopperRoute) {
      // Super lenient for GraphHopper - trust the routing engine more
      maxRouteMultiplier =
        directDistance < 1
          ? 50
          : directDistance < 5
          ? 30
          : directDistance < 10
          ? 20
          : directDistance < 20
          ? 15
          : 12;
    } else {
      // Still generous for geometric routes
      maxRouteMultiplier =
        directDistance < 1
          ? 20
          : directDistance < 5
          ? 15
          : directDistance < 10
          ? 12
          : directDistance < 20
          ? 10
          : 8;
    }

    if (routeDistance > directDistance * maxRouteMultiplier) {
      console.log(
        `    ❌ Route too long${
          isGraphHopperRoute ? " (GraphHopper)" : " (Geometric)"
        }: ${routeDistance.toFixed(1)}km vs ${directDistance.toFixed(
          1
        )}km direct (${(routeDistance / directDistance).toFixed(
          1
        )}x > ${maxRouteMultiplier}x limit)`
      );
      return false;
    }

    // Check 2: Route shouldn't deviate too far from direct line at any point
    // EXTREMELY lenient for real road routing - roads naturally curve and detour massively around obstacles
    const maxAllowedDeviation = isGraphHopperRoute
      ? Math.max(20.0, directDistance * 5.0) // GraphHopper routes: 20km min or 500% deviation allowed!
      : Math.max(10.0, directDistance * 3.0); // Geometric: 10km min or 300% deviation

    let maxDeviation = 0;
    for (let i = 0; i < routeWaypoints.length; i++) {
      const progress = i / (routeWaypoints.length - 1);
      const expectedLat =
        originalStart.lat + (originalEnd.lat - originalStart.lat) * progress;
      const expectedLng =
        originalStart.lng + (originalEnd.lng - originalStart.lng) * progress;

      const actualPoint = routeWaypoints[i];
      const deviation =
        Math.sqrt(
          Math.pow(actualPoint.lat - expectedLat, 2) +
            Math.pow(actualPoint.lng - expectedLng, 2)
        ) * 111; // km

      maxDeviation = Math.max(maxDeviation, deviation);
    }

    if (maxDeviation > maxAllowedDeviation) {
      console.log(
        `    ❌ Route deviates too far${
          isGraphHopperRoute ? " (GraphHopper)" : " (Geometric)"
        }: max deviation ${maxDeviation.toFixed(
          1
        )}km > allowed ${maxAllowedDeviation.toFixed(1)}km`
      );
      return false;
    }

    // Check 3: DEAD-END PREVENTION - Start and end points must connect properly
    const startDeviation =
      Math.sqrt(
        Math.pow(routeWaypoints[0].lat - originalStart.lat, 2) +
          Math.pow(routeWaypoints[0].lng - originalStart.lng, 2)
      ) * 111000; // meters

    const endDeviation =
      Math.sqrt(
        Math.pow(
          routeWaypoints[routeWaypoints.length - 1].lat - originalEnd.lat,
          2
        ) +
          Math.pow(
            routeWaypoints[routeWaypoints.length - 1].lng - originalEnd.lng,
            2
          )
      ) * 111000; // meters

    // STRICT dead-end prevention: Route MUST reach destination
    if (startDeviation > 5000) {
      console.log(
        `    ❌ DEAD-END: Route doesn't start near origin: ${startDeviation.toFixed(
          0
        )}m away`
      );
      return false;
    }

    if (endDeviation > 5000) {
      console.log(
        `    ❌ DEAD-END: Route doesn't reach destination: ${endDeviation.toFixed(
          0
        )}m away`
      );
      return false;
    }

    // Check 4: Route must make continuous progress toward destination (no loops/backtracking)
    let progressTowardEnd = 0;
    for (let i = 1; i < routeWaypoints.length; i++) {
      const prevPoint = routeWaypoints[i - 1];
      const currentPoint = routeWaypoints[i];

      const prevDistToEnd = Math.sqrt(
        Math.pow(prevPoint.lat - originalEnd.lat, 2) +
          Math.pow(prevPoint.lng - originalEnd.lng, 2)
      );

      const currentDistToEnd = Math.sqrt(
        Math.pow(currentPoint.lat - originalEnd.lat, 2) +
          Math.pow(currentPoint.lng - originalEnd.lng, 2)
      );

      if (currentDistToEnd < prevDistToEnd) {
        progressTowardEnd++;
      }
    }

    const progressRatio = progressTowardEnd / (routeWaypoints.length - 1);
    if (progressRatio < 0.3) {
      console.log(
        `    ❌ DEAD-END: Route doesn't progress toward destination: ${(
          progressRatio * 100
        ).toFixed(1)}% progress`
      );
      return false;
    }

    console.log(
      `    ✅ Route validation PASSED${
        isGraphHopperRoute ? " (GraphHopper)" : " (Geometric)"
      }: ${routeDistance.toFixed(1)}km (${(
        routeDistance / directDistance
      ).toFixed(
        1
      )}x < ${maxRouteMultiplier}x), max deviation ${maxDeviation.toFixed(
        1
      )}km < ${maxAllowedDeviation.toFixed(1)}km limit`
    );
    return true;
  };

  // Create clean geometric route with proper road-like waypoints
  const createCleanGeometricRoute = (
    start: LatLng,
    end: LatLng,
    routeType: "safe" | "manageable" | "prone"
  ): LatLng[] => {
    console.log(`    Creating clean geometric ${routeType} route...`);

    const directDistance = calculateRouteDistance([start, end]);
    const numWaypoints = Math.max(
      3,
      Math.min(8, Math.floor(directDistance * 3))
    ); // 3-8 waypoints based on distance

    const waypoints: LatLng[] = [start];

    // Create MUCH STRONGER offset pattern based on route type for clear visual separation
    let offsetMultiplier = 0;
    if (routeType === "safe") {
      offsetMultiplier = 1.5; // Strong northern offset (major roads north)
    } else if (routeType === "manageable") {
      offsetMultiplier = 0; // Central path
    } else {
      offsetMultiplier = -1.5; // Strong southern offset (coastal roads south)
    }

    // Calculate perpendicular direction
    const routeAngle = Math.atan2(end.lng - start.lng, end.lat - start.lat);
    const perpAngle = routeAngle + Math.PI / 2;

    // MUCH LARGER base offset for clear visual separation
    const baseOffset = Math.max(0.02, directDistance * 0.25); // Minimum 2km offset, 25% of distance

    for (let i = 1; i < numWaypoints - 1; i++) {
      const progress = i / (numWaypoints - 1);

      // Linear interpolation along direct route
      const baseLat = start.lat + (end.lat - start.lat) * progress;
      const baseLng = start.lng + (end.lng - start.lng) * progress;

      // Add smooth curve offset (strongest at midpoint)
      const curveStrength = Math.sin(progress * Math.PI); // Smooth curve 0->1->0
      const currentOffset = baseOffset * offsetMultiplier * curveStrength;

      const lat = baseLat + Math.cos(perpAngle) * currentOffset;
      const lng = baseLng + Math.sin(perpAngle) * currentOffset;

      waypoints.push({ lat, lng });
    }

    waypoints.push(end);

    console.log(
      `    Created clean geometric route: ${waypoints.length} waypoints, ${routeType} type`
    );
    return waypoints;
  };

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // CLEAN UP DEAD-END SEGMENTS - Remove branches and segments that don't lead to destination
  const removeDeadEndSegments = (
    rawWaypoints: LatLng[],
    start: LatLng,
    end: LatLng
  ): LatLng[] => {
    if (rawWaypoints.length < 3) return rawWaypoints;

    console.log(
      `    Cleaning dead-end segments from ${rawWaypoints.length} waypoints...`
    );

    // Step 1: Find the main path by tracking continuous progress toward destination
    const cleanedWaypoints: LatLng[] = [rawWaypoints[0]]; // Always include start

    let currentBestIndex = 0;
    let bestDistanceToEnd = Math.sqrt(
      Math.pow(rawWaypoints[0].lat - end.lat, 2) +
        Math.pow(rawWaypoints[0].lng - end.lng, 2)
    );

    // Look ahead and only keep waypoints that get us closer to the destination
    for (let i = 1; i < rawWaypoints.length - 1; i++) {
      const currentPoint = rawWaypoints[i];
      const distanceToEnd = Math.sqrt(
        Math.pow(currentPoint.lat - end.lat, 2) +
          Math.pow(currentPoint.lng - end.lng, 2)
      );

      // Only add waypoint if it's making progress OR if it's a necessary detour
      if (distanceToEnd <= bestDistanceToEnd + 0.01) {
        // Allow small detours (1km tolerance)
        cleanedWaypoints.push(currentPoint);
        if (distanceToEnd < bestDistanceToEnd) {
          bestDistanceToEnd = distanceToEnd;
          currentBestIndex = cleanedWaypoints.length - 1;
        }
      }
      // Skip waypoints that lead away from destination (dead-ends)
    }

    // Always include the end point
    cleanedWaypoints.push(rawWaypoints[rawWaypoints.length - 1]);

    console.log(
      `    Removed ${
        rawWaypoints.length - cleanedWaypoints.length
      } dead-end waypoints, kept ${cleanedWaypoints.length}`
    );
    return cleanedWaypoints;
  };

  // Smart routing with Local OSRM (Zamboanga-specific), then fallbacks
  const tryRouteFromAPI = async (
    waypoints: LatLng[],
    routeName: string,
    timeout: number = 3000
  ): Promise<LatLng[] | null> => {
    const directDistance = calculateRouteDistance([
      waypoints[0],
      waypoints[waypoints.length - 1],
    ]);

    console.log(
      `  Trying routing for ${routeName} (${directDistance.toFixed(1)}km)...`
    );

    if (USE_LOCAL_OSRM) {
      try {
        // First try LOCAL OSRM (most accurate for Zamboanga)
        return await tryLocalOSRMRouting(waypoints, routeName, timeout);
      } catch (localError) {
        console.log(
          `  Local OSRM failed for ${routeName}, trying public OSRM...`
        );
      }
    } else {
      console.log(
        `  Local OSRM disabled for ${routeName}, using external services...`
      );
    }

    try {
      // Then try public OSRM (free, no rate limits)
      return await tryOSRMRouting(waypoints, routeName, timeout);
    } catch (osrmError) {
      console.log(
        `  Public OSRM failed for ${routeName}, trying GraphHopper fallback...`
      );
      try {
        return await tryGraphHopperRouting(waypoints, routeName, timeout);
      } catch (ghError) {
        console.log(`  All routing services failed for ${routeName}`);
        return null;
      }
    }
  };

  const tryLocalOSRMRouting = async (
    waypoints: LatLng[],
    routeName: string,
    timeout: number
  ): Promise<LatLng[] | null> => {
    const start = waypoints[0];
    const end = waypoints[waypoints.length - 1];
    const intermediateWaypoints = waypoints.slice(1, -1);

    const waypointParam =
      intermediateWaypoints.length > 0
        ? `&waypoints=${intermediateWaypoints
            .map((wp) => `${wp.lng},${wp.lat}`)
            .join(";")}`
        : "";

    const fetchPromise = fetch(
      `${BACKEND_URL}/osrm/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}${waypointParam}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${routeName} Local OSRM timeout`)),
        timeout
      )
    );

    const response = (await Promise.race([
      fetchPromise,
      timeoutPromise,
    ])) as Response;

    if (!response.ok) {
      throw new Error(`Local OSRM API returned ${response.status}`);
    }

    const data = await response.json();

    if (
      data.source === "local_osrm" &&
      data.routes &&
      data.routes[0] &&
      data.routes[0].geometry
    ) {
      const rawWaypoints = data.routes[0].geometry.coordinates.map(
        (coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        })
      );

      const validatedRoute = validateRoute(
        rawWaypoints,
        waypoints[0],
        waypoints[waypoints.length - 1]
      );
      console.log(
        `    ✅ Local OSRM Success: ${routeName} - ${validatedRoute.length} waypoints (Zamboanga-specific)`
      );
      return validatedRoute;
    }

    throw new Error("No route geometry from local OSRM");
  };

  const tryOSRMRouting = async (
    waypoints: LatLng[],
    routeName: string,
    timeout: number
  ): Promise<LatLng[] | null> => {
    const waypointStr = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(";");

    const fetchPromise = fetch(
      `https://router.project-osrm.org/route/v1/driving/${waypointStr}?overview=full&geometries=geojson&continue_straight=true`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      }
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${routeName} OSRM timeout`)), timeout)
    );

    const response = (await Promise.race([
      fetchPromise,
      timeoutPromise,
    ])) as Response;

    if (!response.ok) {
      throw new Error(`OSRM API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.routes && data.routes[0] && data.routes[0].geometry) {
      const rawWaypoints = data.routes[0].geometry.coordinates.map(
        (coord: number[]) => ({
          lat: coord[1],
          lng: coord[0],
        })
      );

      // CLEAN UP: Remove dead-end segments first
      const cleanedWaypoints = removeDeadEndSegments(
        rawWaypoints,
        waypoints[0],
        waypoints[waypoints.length - 1]
      );

      // CRITICAL: Validate route is not chaotic
      const isValid = validateRouteIsNotChaotic(
        cleanedWaypoints,
        waypoints[0],
        waypoints[waypoints.length - 1],
        true
      );

      if (!isValid) {
        throw new Error(`Route is chaotic - rejecting`);
      }

      console.log(
        `    ✓ ${routeName} OSRM success: ${cleanedWaypoints.length} points, clean route (removed dead-ends)`
      );
      return cleanedWaypoints;
    }

    throw new Error("No route geometry");
  };

  const tryGraphHopperRouting = async (
    waypoints: LatLng[],
    routeName: string,
    timeout: number
  ): Promise<LatLng[] | null> => {
    try {
      // Rate limiting - ensure delay between requests
      const now = Date.now();
      const timeSinceLastRequest = now - lastGraphHopperRequest.current;
      if (timeSinceLastRequest < GRAPHHOPPER_DELAY) {
        const delayTime = GRAPHHOPPER_DELAY - timeSinceLastRequest;
        console.log(
          `  Rate limiting: waiting ${delayTime}ms before GraphHopper request...`
        );
        await delay(delayTime);
      }
      lastGraphHopperRequest.current = Date.now();

      // Build GraphHopper URL with waypoints
      const pointParams = waypoints
        .map((wp) => `point=${wp.lat},${wp.lng}`)
        .join("&");
      const apiKey =
        import.meta.env.VITE_GRAPHHOPPER_API_KEY ||
        "585bccb3-2df7-4dcb-b5bf-fc40a8bf4eea";
      const apiUrl = `https://graphhopper.com/api/1/route?${pointParams}&vehicle=car&key=${apiKey}&calc_points=true`;

      // Use Promise.race for timeout
      const fetchPromise = fetch(apiUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${routeName} GraphHopper timeout`)),
          timeout
        )
      );

      const response = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as Response;

      if (!response.ok) {
        if (response.status === 429) {
          console.log(
            `    ✗ ${routeName} GraphHopper rate limited (429) - backing off...`
          );
          // Increase delay for future requests
          lastGraphHopperRequest.current = Date.now() + 2000; // Extra 2 second penalty
        } else {
          console.log(
            `    ✗ ${routeName} GraphHopper failed: HTTP ${response.status}`
          );
        }
        return null;
      }

      const data = await response.json();

      // Check for GraphHopper error response
      if (data.message || data.error) {
        console.log(
          `    ✗ ${routeName} GraphHopper API error: ${
            data.message || data.error
          }`
        );
        return null;
      }

      if (
        data.paths &&
        data.paths[0] &&
        data.paths[0].points &&
        data.paths[0].points.coordinates
      ) {
        const rawWaypoints = data.paths[0].points.coordinates.map(
          (coord: number[]) => ({
            lat: coord[1],
            lng: coord[0],
          })
        );

        // CLEAN UP: Remove dead-end segments first
        const cleanedWaypoints = removeDeadEndSegments(
          rawWaypoints,
          waypoints[0],
          waypoints[waypoints.length - 1]
        );

        // CRITICAL: Validate route is not chaotic
        const isValid = validateRouteIsNotChaotic(
          cleanedWaypoints,
          waypoints[0],
          waypoints[waypoints.length - 1],
          true
        ); // Mark as GraphHopper route

        if (!isValid) {
          console.log(
            `    ✗ ${routeName} GraphHopper route is chaotic - rejecting`
          );
          return null;
        }

        console.log(
          `    ✓ ${routeName} GraphHopper success: ${cleanedWaypoints.length} points, clean route (removed dead-ends)`
        );
        return cleanedWaypoints;
      }

      console.log(`    ✗ ${routeName} GraphHopper failed: No route geometry`);
      return null;
    } catch (error) {
      console.log(`    ✗ ${routeName} GraphHopper error:`, error.message);
      return null;
    }
  };

  // Get elevation data for a specific point with enhanced caching and fallback
  const getPointElevation = async (
    lat: number,
    lng: number
  ): Promise<number> => {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

    // Check cache first
    if (elevationCacheRef.current.has(cacheKey)) {
      const cachedData = elevationCacheRef.current.get(cacheKey);
      return cachedData ? cachedData.elevation : 10; // Default fallback
    }

    try {
      const elevationData = await getElevationData(lat, lng);
      return elevationData ? elevationData.elevation : 10;
    } catch (error) {
      // Fallback to geographic estimation
      const cityCenter = { lat: 6.9214, lng: 122.079 };
      const distanceFromCenter =
        Math.sqrt(
          Math.pow(lat - cityCenter.lat, 2) + Math.pow(lng - cityCenter.lng, 2)
        ) * 111;

      // Zamboanga geography: coastal areas are lower, inland/hills are higher
      return Math.max(
        2,
        Math.min(50, distanceFromCenter * 8 + Math.random() * 5)
      );
    }
  };

  // Find route waypoints that GUARANTEE separation even for short distances
  const findTerrainBasedWaypoints = async (
    start: LatLng,
    end: LatLng,
    riskPreference: "safe" | "moderate" | "prone"
  ): Promise<LatLng[]> => {
    console.log(
      `  Finding ${riskPreference} waypoints with guaranteed separation...`
    );

    // Calculate route distance and determine separation strategy
    const directDistance =
      Math.sqrt(
        Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
      ) * 111; // km

    console.log(`    Route distance: ${directDistance.toFixed(1)}km`);

    // For short distances (<3km), use FORCED geometric separation
    if (directDistance < 3) {
      console.log(
        `    Short distance detected - using forced geometric separation`
      );
      return createForcedSeparationWaypoints(start, end, riskPreference);
    }

    // For longer distances, use terrain-based selection
    const gridSize = Math.max(3, Math.min(7, Math.floor(directDistance * 2))); // Adaptive grid size
    const waypoints: Array<{
      lat: number;
      lng: number;
      elevation: number;
      risk: number;
      separation: number;
    }> = [];

    // Create expanded search area for better waypoint diversity
    const searchRadius = Math.max(0.01, directDistance * 0.2); // 20% of route distance as search radius

    // Sample elevations in an expanded area around the direct route
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        // Create waypoints in a wider area, not just on direct line
        const baseProgress = i / (gridSize - 1);
        const offsetProgress = (j - gridSize / 2) / gridSize;

        const baseLat = start.lat + (end.lat - start.lat) * baseProgress;
        const baseLng = start.lng + (end.lng - start.lng) * baseProgress;

        // Add perpendicular offset for route diversity
        const perpOffset = offsetProgress * searchRadius;
        const angle = Math.atan2(end.lng - start.lng, end.lat - start.lat);

        const lat = baseLat + Math.cos(angle + Math.PI / 2) * perpOffset;
        const lng = baseLng + Math.sin(angle + Math.PI / 2) * perpOffset;

        // Skip waypoints too close to start/end
        const distToStart =
          Math.sqrt(
            Math.pow(lat - start.lat, 2) + Math.pow(lng - start.lng, 2)
          ) * 111;
        const distToEnd =
          Math.sqrt(Math.pow(lat - end.lat, 2) + Math.pow(lng - end.lng, 2)) *
          111;

        if (distToStart < 0.5 || distToEnd < 0.5) continue; // Skip if too close

        const elevation = await getPointElevation(lat, lng);

        // Calculate risk score based on elevation and proximity to coast
        const cityCenter = { lat: 6.9214, lng: 122.079 };
        const distanceFromCenter =
          Math.sqrt(
            Math.pow(lat - cityCenter.lat, 2) +
              Math.pow(lng - cityCenter.lng, 2)
          ) * 111;

        let riskScore = 0;

        // Elevation risk (lower = more risky)
        if (elevation < 5) riskScore += 3;
        else if (elevation < 15) riskScore += 2;
        else if (elevation < 30) riskScore += 1;

        // Coastal proximity risk
        if (distanceFromCenter < 2) riskScore += 2;
        else if (distanceFromCenter < 4) riskScore += 1;

        // Calculate separation from direct route (for diversity bonus)
        const directLineLat = start.lat + (end.lat - start.lat) * baseProgress;
        const directLineLng = start.lng + (end.lng - start.lng) * baseProgress;
        const separationFromDirect =
          Math.sqrt(
            Math.pow(lat - directLineLat, 2) + Math.pow(lng - directLineLng, 2)
          ) * 111000; // meters

        waypoints.push({
          lat,
          lng,
          elevation,
          risk: riskScore,
          separation: separationFromDirect,
        });
      }
    }

    // Sort waypoints by risk preference AND separation
    let selectedWaypoints: LatLng[];

    if (riskPreference === "safe") {
      // Choose waypoints with lowest risk, prefer some separation
      waypoints.sort(
        (a, b) => a.risk * 1000 + a.separation - (b.risk * 1000 + b.separation)
      );
      selectedWaypoints = waypoints
        .slice(0, 2)
        .map((w) => ({ lat: w.lat, lng: w.lng }));
    } else if (riskPreference === "moderate") {
      // Choose medium risk waypoints with good separation
      waypoints.sort(
        (a, b) =>
          Math.abs(a.risk - 1.5) -
          Math.abs(b.risk - 1.5) +
          (a.separation - b.separation) * 0.001
      );
      selectedWaypoints = waypoints
        .slice(0, 2)
        .map((w) => ({ lat: w.lat, lng: w.lng }));
    } else {
      // 'prone' risk preference
      // Choose highest risk waypoints but ensure some separation
      waypoints.sort(
        (a, b) => b.risk * 1000 - b.separation - (a.risk * 1000 - a.separation)
      );
      selectedWaypoints = waypoints
        .slice(0, 2)
        .map((w) => ({ lat: w.lat, lng: w.lng }));
    }

    console.log(
      `    Selected ${selectedWaypoints.length} ${riskPreference} waypoints with terrain+separation`
    );
    return [start, ...selectedWaypoints, end];
  };

  // Create forced geometric separation for short distances
  const createForcedSeparationWaypoints = (
    start: LatLng,
    end: LatLng,
    riskPreference: "safe" | "moderate" | "prone"
  ): LatLng[] => {
    const { lat: midLat, lng: midLng } = computeMidpoint(start, end);

    // Base offset that scales with distance but has minimum for visibility
    const routeDistance = Math.sqrt(
      Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
    );

    const minOffset = 0.02; // Minimum ~2km offset for clear visual separation
    const baseOffset = Math.max(minOffset, routeDistance * 0.4); // Strong offsets for major road access

    console.log(
      `    Using enhanced base offset: ${(baseOffset * 111).toFixed(0)}m`
    );

    let waypoints: LatLng[];

    if (riskPreference === "safe") {
      // Strong northern route (major roads north of city)
      waypoints = [
        start,
        {
          lat: midLat + baseOffset * 0.8, // Strong northern deviation for major roads
          lng: midLng + baseOffset * 0.3, // Eastern variation for road access
        },
        end,
      ];
    } else if (riskPreference === "moderate") {
      // Strong western route (western road network)
      waypoints = [
        start,
        {
          lat: midLat + baseOffset * 0.2, // Slight northern preference
          lng: midLng - baseOffset * 0.9, // Strong western deviation for major roads
        },
        end,
      ];
    } else {
      // Strong southern/coastal route (coastal road network)
      waypoints = [
        start,
        {
          lat: midLat - baseOffset * 0.7, // Strong southern deviation for coastal access
          lng: midLng - baseOffset * 0.4, // Western variation toward coast
        },
        end,
      ];
    }

    console.log(
      `    Created forced ${riskPreference} route with ${waypoints.length} waypoints`
    );
    return waypoints;
  };

  // Force separation between two routes that are too similar
  const forceRouteSeparation = (
    route1: LatLng[],
    route2: LatLng[],
    start: LatLng,
    end: LatLng,
    routeType: string
  ): LatLng[] => {
    return forceRouteSeparationEnhanced(
      route1,
      route2,
      start,
      end,
      routeType,
      1.0
    );
  };

  // Try alternative GraphHopper routes with different waypoints for better separation
  const tryAlternativeRouteFromAPI = async (
    start: LatLng,
    end: LatLng,
    routeType: string,
    attemptNumber: number
  ): Promise<LatLng[] | null> => {
    console.log(
      `    Trying alternative GraphHopper route for ${routeType}, attempt ${
        attemptNumber + 1
      }...`
    );

    let alternativeWaypoints: LatLng[] = [];

    // Fixed offsets for strong visual separation across alternative routes
    const baseOffset = 0.045; // ~5km offset for STRONG visual separation
    const { lat: midLat, lng: midLng } = computeMidpoint(start, end);

    if (routeType.includes("manageable")) {
      // Try different western waypoints for manageable route with fixed offsets
      const alternatives = [
        [start, { lat: midLat + 0.008, lng: midLng - baseOffset }, end], // Western route
        [start, { lat: midLat - 0.008, lng: midLng - baseOffset * 0.8 }, end], // Southwest route
        [start, { lat: midLat + 0.02, lng: midLng - baseOffset * 1.4 }, end], // Far western route
      ];
      alternativeWaypoints = alternatives[attemptNumber % alternatives.length];
    } else if (routeType.includes("flood_prone")) {
      // Try different coastal/southern waypoints for flood-prone route with fixed offsets
      const alternatives = [
        [start, { lat: midLat - baseOffset * 0.8, lng: midLng - 0.02 }, end], // Southern coastal route
        [start, { lat: midLat - baseOffset * 0.6, lng: midLng - 0.025 }, end], // Coastal western route
        [start, { lat: midLat - baseOffset, lng: midLng + 0.015 }, end], // Far southern route
      ];
      alternativeWaypoints = alternatives[attemptNumber % alternatives.length];
    } else {
      // For safe routes, try northern waypoints with fixed offsets
      const alternatives = [
        [start, { lat: midLat + baseOffset, lng: midLng + 0.01 }, end], // Northern route
        [start, { lat: midLat + baseOffset * 0.8, lng: midLng + 0.025 }, end], // Northeast route
        [start, { lat: midLat + baseOffset * 1.2, lng: midLng - 0.015 }, end], // Northwest route
      ];
      alternativeWaypoints = alternatives[attemptNumber % alternatives.length];
    }

    const result = await tryRouteFromAPI(
      alternativeWaypoints,
      `${routeType} Alternative ${attemptNumber + 1}`,
      5000
    );

    if (result && result.length > 10) {
      console.log(
        `    ✓ Successfully generated alternative road-based route with ${result.length} waypoints`
      );
      return result;
    } else {
      console.log(`    ✗ Alternative route failed or insufficient detail`);
      return null;
    }
  };

  // Enhanced force separation with multiplier for stronger offsets when needed
  const forceRouteSeparationEnhanced = (
    route1: LatLng[],
    route2: LatLng[],
    start: LatLng,
    end: LatLng,
    routeType: string,
    multiplier: number
  ): LatLng[] => {
    console.log(
      `    Forcing separation for ${routeType} with ${multiplier}x offset...`
    );

    const { lat: midLat, lng: midLng } = computeMidpoint(start, end);

    // Determine STRONG offset direction based on route type with enhanced multiplier
    let offsetLat = 0;
    let offsetLng = 0;
    const baseOffset = 0.025 * multiplier; // Base ~2.5km offset for clear visual separation

    if (routeType.includes("safe")) {
      offsetLat = baseOffset; // Strong north (major roads north)
      offsetLng = baseOffset * 0.6; // Eastern variation for road diversity
    } else if (routeType.includes("manageable")) {
      offsetLat = baseOffset * 0.4; // Slight north preference
      offsetLng = -baseOffset; // Strong west (western road network)
    } else {
      offsetLat = -baseOffset; // Strong south (coastal roads)
      offsetLng = -baseOffset * 0.5; // Western variation toward coast
    }

    // Create guaranteed separated route with multiple waypoints for better road following
    const separatedRoute = [
      start,
      {
        lat: start.lat + offsetLat * 0.3,
        lng: start.lng + offsetLng * 0.3,
      },
      {
        lat: midLat + offsetLat,
        lng: midLng + offsetLng,
      },
      {
        lat: midLat + offsetLat * 0.6,
        lng: midLng + offsetLng * 1.2,
      },
      {
        lat: end.lat + offsetLat * 0.2,
        lng: end.lng + offsetLng * 0.2,
      },
      end,
    ];

    console.log(
      `    Created separated route with offset: ${(offsetLat * 111).toFixed(
        0
      )}m lat, ${(offsetLng * 111).toFixed(0)}m lng`
    );
    return separatedRoute;
  };

  const enforceDistinctRoutes = async (
    start: LatLng,
    end: LatLng,
    routes: {
      id: number;
      routeType: string;
      waypoints: LatLng[];
      distance: string;
      duration: number;
      riskScore: number;
      warnings: string[];
      originalRoute: any;
    }[]
  ) => {
    if (routes.length < 2) {
      return routes;
    }

    const priority = ["safe", "manageable", "flood_prone"];
    const midpoint = computeMidpoint(start, end);
    const quarterPoint = computeMidpoint(start, midpoint);
    const threeQuarterPoint = computeMidpoint(midpoint, end);
    const distanceScalar = Math.sqrt(
      Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
    );
    const latScale = clampValue(distanceScalar * 0.6, 0.008, 0.05);
    const lngScale = clampValue(distanceScalar * 0.6, 0.008, 0.06);

    type AnchorKey = "start" | "mid" | "end" | "quarter" | "threeQuarter";

    interface BiasStep {
      anchor: AnchorKey;
      latOffset: number;
      lngOffset: number;
    }

    const anchorPoints: Record<AnchorKey, LatLng> = {
      start,
      mid: midpoint,
      end,
      quarter: quarterPoint,
      threeQuarter: threeQuarterPoint,
    };

    const directionBiases: Record<string, BiasStep[][]> = {
      safe: [
        [
          { anchor: "quarter", latOffset: latScale * 0.7, lngOffset: lngScale * 0.2 },
          { anchor: "mid", latOffset: latScale * 1.1, lngOffset: lngScale * 0.6 },
        ],
        [
          { anchor: "quarter", latOffset: latScale * 0.6, lngOffset: -lngScale * 0.2 },
          { anchor: "threeQuarter", latOffset: latScale * 0.8, lngOffset: lngScale * 0.3 },
        ],
      ],
      manageable: [
        [
          { anchor: "quarter", latOffset: latScale * 0.2, lngOffset: -lngScale * 0.9 },
          { anchor: "mid", latOffset: latScale * 0.5, lngOffset: -lngScale * 1.3 },
        ],
        [
          { anchor: "quarter", latOffset: latScale * 0.35, lngOffset: -lngScale * 0.7 },
          { anchor: "threeQuarter", latOffset: latScale * 0.3, lngOffset: -lngScale * 1.2 },
        ],
      ],
      flood_prone: [
        [
          { anchor: "quarter", latOffset: -latScale * 0.6, lngOffset: -lngScale * 0.4 },
          { anchor: "mid", latOffset: -latScale * 1.0, lngOffset: -lngScale * 0.6 },
        ],
        [
          { anchor: "quarter", latOffset: -latScale * 0.7, lngOffset: lngScale * 0.2 },
          {
            anchor: "threeQuarter",
            latOffset: -latScale * 0.8,
            lngOffset: -lngScale * 0.9,
          },
        ],
      ],
    };

    const buildWaypointSet = (biasSteps: BiasStep[]): LatLng[] =>
      biasSteps.map((step) =>
        clampPointToBounds(
          {
            lat: anchorPoints[step.anchor].lat + step.latOffset,
            lng: anchorPoints[step.anchor].lng + step.lngOffset,
          },
          SAFE_CITY_BOUNDS
        )
      );

    const attemptDirectionalReroute = async (
      routeType: string,
      originalWaypoints: LatLng[]
    ): Promise<LatLng[] | null> => {
      if (!USE_LOCAL_OSRM) {
        return null;
      }

      const candidates = directionBiases[routeType] || [];

      for (const bias of candidates) {
        const waypoints = buildWaypointSet(bias);
        try {
          const rerouted = await getLocalOSRMRoute(start, end, waypoints);
          if (rerouted.length > 1) {
            const overlapWithOriginal = calculateOverlapRatio(
              originalWaypoints,
              rerouted
            );
            if (overlapWithOriginal < 0.45) {
              return rerouted;
            }
          }
        } catch (error) {
          console.warn(
            `Directional reroute failed for ${routeType}, trying next preset...`,
            error
          );
        }
      }

      return null;
    };

    const clonedRoutes = routes.map((route) => ({
      ...route,
      warnings: Array.isArray(route.warnings) ? [...route.warnings] : [],
    }));

    const maxIterations = 2;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let adjustmentsMade = false;

      for (let i = 0; i < clonedRoutes.length; i++) {
        for (let j = i + 1; j < clonedRoutes.length; j++) {
          const routeA = clonedRoutes[i];
          const routeB = clonedRoutes[j];
          const overlap = calculateOverlapRatio(
            routeA.waypoints,
            routeB.waypoints
          );

          if (overlap > 0.55) {
            const indexToAdjust =
              priority.indexOf(routeA.routeType) >= priority.indexOf(routeB.routeType)
                ? i
                : j;

            const routeToAdjust = clonedRoutes[indexToAdjust];
            const rerouted = await attemptDirectionalReroute(
              routeToAdjust.routeType,
              routeToAdjust.waypoints
            );

            if (rerouted && rerouted.length > 1) {
              clonedRoutes[indexToAdjust] = {
                ...routeToAdjust,
                waypoints: rerouted,
              };
              adjustmentsMade = true;
              continue;
            }

            const forcedWaypoints = forceRouteSeparationEnhanced(
              routeA.waypoints,
              routeB.waypoints,
              start,
              end,
              routeToAdjust.routeType,
              1.8
            );

            clonedRoutes[indexToAdjust] = {
              ...routeToAdjust,
              waypoints: forcedWaypoints,
              warnings: [
                ...routeToAdjust.warnings,
                "Route adjusted for clarity to avoid overlapping alternatives",
              ],
            };
            adjustmentsMade = true;
          }
        }
      }

      if (!adjustmentsMade) {
        break;
      }
    }

    return clonedRoutes;
  };

  // Check if routes are too similar (ACTUALLY identical - not just similar)
  const areRoutesTooSimilar = (routes: any[]): boolean => {
    if (routes.length < 2) return false;

    // Check if routes are actually geometric fallbacks (identical paths)
    let allGeometric = true;
    let geometricCount = 0;

    // Check if all routes are geometric fallbacks
    for (let route of routes) {
      // Check multiple indicators of geometric routes
      if (
        route.waypoints &&
        (route.waypoints.length <= 8 || // Geometric routes typically have fewer waypoints
          route.type?.includes("geometric") || // Explicitly marked as geometric
          route.name?.includes("Geometric")) // Named as geometric
      ) {
        geometricCount++;
      } else {
        allGeometric = false; // At least one real GraphHopper route exists
      }
    }

    console.log(
      `Route analysis: ${geometricCount}/${routes.length} routes are geometric`
    );

    // If we have Real GraphHopper routes, don't trigger identical terrain mode
    if (!allGeometric) {
      console.log(
        `✓ Real GraphHopper routes detected - allowing normal distinct routing`
      );
      return false; // Don't trigger identical terrain mode if we have real routes
    }

    // Check elevation similarity - only trigger for VERY identical terrain
    const elevations = routes.map((r) => r.avgElevation);
    const elevationRange = Math.max(...elevations) - Math.min(...elevations);

    // Check distance similarity - only trigger for VERY identical distances
    const distances = routes.map((r) => r.route.distance);
    const avgDistance =
      distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const maxDistanceDeviation = Math.max(
      ...distances.map((d) => Math.abs(d - avgDistance))
    );
    const distanceVariationPercent = (maxDistanceDeviation / avgDistance) * 100;

    console.log(
      `Route similarity check: geometric=${allGeometric}, elevation range=${elevationRange.toFixed(
        1
      )}m, distance variation=${distanceVariationPercent.toFixed(1)}%`
    );

    // ONLY trigger safest/fastest mode for truly identical routes (all geometric fallbacks)
    // Extremely strict criteria - only when ALL routes are geometric AND nearly identical
    const isIdentical =
      allGeometric && elevationRange < 1 && distanceVariationPercent < 3;

    if (isIdentical) {
      console.log(
        `⚠️ All routes are identical geometric fallbacks - switching to safest/fastest mode`
      );
    } else {
      console.log(
        `✓ Routes are sufficiently distinct - using normal flood-risk routing`
      );
    }

    return isIdentical;
  };

  // Generate safest vs fastest routes when terrain is identical
  const generateSafestFastestRoutes = async (start: LatLng, end: LatLng) => {
    console.log("=== GENERATING SAFEST vs FASTEST ROUTES ===");

    const routes: any[] = [];

    const sharedTerrainRoadIds = new Set<string>();

    // SAFEST ROUTE: Prioritize main roads, avoid narrow streets
    console.log("Generating SAFEST route...");
    let safestRoute = await tryRouteFromAPI(
      [start, end],
      "Safest Main Road",
      6000
    );

    if (!safestRoute) {
      // Fallback with waypoint through major intersection
      const midpoint = computeMidpoint(start, end);
      const majorRoadWaypoint = { lat: midpoint.lat + 0.003, lng: midpoint.lng }; // Slight offset to major road
      safestRoute = await tryRouteFromAPI(
        [start, majorRoadWaypoint, end],
        "Safest with Waypoint",
        6000
      );
    }

    if (!safestRoute) {
      console.log("❌ Failed to generate safest route via OSRM");
      return []; // Return empty if no real road route available
    }

    // FASTEST ROUTE: Direct path, allow smaller roads
    console.log("Generating FASTEST route...");
    let fastestRoute = await tryRouteFromAPI(
      [start, end],
      "Fastest Direct",
      4000
    );

    if (!fastestRoute) {
      console.log("❌ Failed to generate fastest route via OSRM");
      return []; // Return empty if no real road route available
    }

    // ENSURE ROUTE DISTINCTNESS: If routes are too similar, create variations
    if (
      fastestRoute &&
      safestRoute &&
      areRoutesSimilar(safestRoute, fastestRoute, 0.001)
    ) {
      console.log("Routes too similar, creating distinct variations...");

      // Try multiple different waypoints for variation
      const midpoint = computeMidpoint(start, end);

      // Northern variation for safest route
      const northWaypoint = { lat: midpoint.lat + 0.008, lng: midpoint.lng };
      const variedSafestRoute = await tryRouteFromAPI(
        [start, northWaypoint, end],
        "Safest Northern",
        6000
      );
      if (
        variedSafestRoute &&
        !areRoutesSimilar(variedSafestRoute, fastestRoute, 0.001)
      ) {
        safestRoute = variedSafestRoute;
      } else {
        // Southern variation as backup
        const southWaypoint = { lat: midpoint.lat - 0.008, lng: midpoint.lng };
        const altVariedRoute = await tryRouteFromAPI(
          [start, southWaypoint, end],
          "Safest Southern",
          6000
        );
        if (
          altVariedRoute &&
          !areRoutesSimilar(altVariedRoute, fastestRoute, 0.001)
        ) {
          safestRoute = altVariedRoute;
        }
      }
    }

    // Calculate metrics for both routes
    const safestDistance = calculateRouteDistance(safestRoute);
    const fastestDistance = calculateRouteDistance(fastestRoute);

    routes.push({
      type: "safest_route",
      name: `Safest Route`,
      waypoints: safestRoute,
      avgElevation: 15, // Default for safest
      route: {
        distance: Math.round(safestDistance * 1000),
        duration: Math.round((safestDistance / 35) * 60), // Slower speed for safety
      },
      plannedWaypoints: safestRoute || [],
      floodRisk: "safe",
      isSafest: true,
    });

    routes.push({
      type: "fastest_route",
      name: `Fastest Route`,
      waypoints: fastestRoute,
      avgElevation: 12, // Default for fastest
      route: {
        distance: Math.round(fastestDistance * 1000),
        duration: Math.round((fastestDistance / 45) * 60), // Faster speed
      },
      plannedWaypoints: fastestRoute || [],
      floodRisk: "manageable",
      isFastest: true,
    });

    // GENERATE THIRD DISTINCT ALTERNATIVE ROUTE
    console.log("Generating ALTERNATIVE distinct route...");
    const midpoint = computeMidpoint(start, end);

    // Try eastern waypoint for different path
    let alternativeRoute = await tryRouteFromAPI(
      [start, { lat: midpoint.lat, lng: midpoint.lng + 0.01 }, end],
      "Alternative Eastern",
      5000
    );

    // If eastern route is too similar, try western
    if (
      !alternativeRoute ||
      areRoutesSimilar(alternativeRoute, safestRoute, 0.001) ||
      areRoutesSimilar(alternativeRoute, fastestRoute, 0.001)
    ) {
      alternativeRoute = await tryRouteFromAPI(
        [start, { lat: midpoint.lat, lng: midpoint.lng - 0.01 }, end],
        "Alternative Western",
        5000
      );
    }

    // If still too similar, try diagonal waypoint
    if (
      !alternativeRoute ||
      areRoutesSimilar(alternativeRoute, safestRoute, 0.001) ||
      areRoutesSimilar(alternativeRoute, fastestRoute, 0.001)
    ) {
      alternativeRoute = await tryRouteFromAPI(
        [
          start,
          { lat: midpoint.lat + 0.006, lng: midpoint.lng + 0.006 },
          end,
        ],
        "Alternative Diagonal",
        5000
      );
    }

    // Fallback to real routing if all API routes are similar
    if (!alternativeRoute) {
      console.log("❌ Failed to generate alternative route via OSRM");
      // Don't add alternative route if we can't get a real road route
    } else {
      const alternativeDistance = calculateRouteDistance(alternativeRoute);

      routes.push({
        type: "alternative_route",
        name: `Alternative Route`,
        waypoints: alternativeRoute,
        avgElevation: 13,
        route: {
          distance: Math.round(alternativeDistance * 1000),
          duration: Math.round((alternativeDistance / 40) * 60),
        },
        plannedWaypoints: alternativeRoute || [],
        floodRisk: "manageable",
      });
    }

    console.log(
      `Generated safest (${safestDistance.toFixed(
        1
      )}km) and fastest (${fastestDistance.toFixed(1)}km) routes`
    );
    return routes;
  };

  // Generate THREE TERRAIN-BASED routes using real elevation APIs and road networks
  const generateDistinctRoutes = async (start: LatLng, end: LatLng) => {
    console.log("=== GENERATING 3 TERRAIN-BASED DISTINCT ROUTES ===");
    console.log("Start:", start, "End:", end);

    const routes: any[] = [];
    distinctRouteRoadIds = new Set<string>();

    // Calculate distance for context
    const distance =
      Math.sqrt(
        Math.pow(end.lat - start.lat, 2) + Math.pow(end.lng - start.lng, 2)
      ) * 111; // km

    console.log(`Route distance: ${distance.toFixed(1)} km`);

    // Get elevation data for start and end points to understand terrain context
    const startElevation = await getPointElevation(start.lat, start.lng);
    const endElevation = await getPointElevation(end.lat, end.lng);

    console.log(
      `Terrain context: Start=${startElevation}m, End=${endElevation}m`
    );

    // Helper function to calculate average elevation
    const calculateAverageElevation = async (
      routeWaypoints: LatLng[]
    ): Promise<number> => {
      let elevationSum = 0;
      let count = 0;
      const samplePoints = Math.min(routeWaypoints.length, 10);

      for (let i = 0; i < samplePoints; i++) {
        const idx = Math.floor(
          (i / (samplePoints - 1)) * (routeWaypoints.length - 1)
        );
        const elevation = await getPointElevation(
          routeWaypoints[idx].lat,
          routeWaypoints[idx].lng
        );
        elevationSum += elevation;
        count++;
      }

      return count > 0 ? elevationSum / count : 15;
    };

    // NEW: Try to get all three distinct routes using local OSRM first
    if (USE_LOCAL_OSRM) {
      console.log(
        "🚀 Attempting to get all three distinct routes using local OSRM..."
      );
      try {
        const localRoutes = await getLocalOSRMDistinctRoutes(start, end);

        if (localRoutes.safe.length > 0) {
          console.log("✅ Got safe route from local OSRM");
          const safeElevationSum = await calculateAverageElevation(
            localRoutes.safe
          );
          const safeStats = evaluateTerrainForRoute(localRoutes.safe);
          if (safeStats) {
            safeStats.usedRoadIds.forEach((id) =>
              distinctRouteRoadIds.add(id)
            );
          }
          routes.push({
            type: "safe_terrain",
            name: `Safe Route (Avg: ${safeElevationSum.toFixed(
              0
            )}m elevation) - Local OSRM`,
            waypoints: localRoutes.safe,
            avgElevation:
              safeStats?.averageElevation ?? safeElevationSum,
            route: {
              distance: Math.round(
                calculateRouteDistance(localRoutes.safe) * 1000
              ),
              duration: Math.round(
                (calculateRouteDistance(localRoutes.safe) / 40) * 60
              ),
            },
            plannedWaypoints: localRoutes.safe,
            floodRisk: safeStats?.riskCategory ?? "manageable",
            terrainStats: safeStats ?? null,
          });
        }

        if (localRoutes.manageable.length > 0) {
          console.log("✅ Got manageable route from local OSRM");
          const manageableElevationSum = await calculateAverageElevation(
            localRoutes.manageable
          );
          const manageableStats = evaluateTerrainForRoute(
            localRoutes.manageable
          );
          if (manageableStats) {
            manageableStats.usedRoadIds.forEach((id) =>
              distinctRouteRoadIds.add(id)
            );
          }
          routes.push({
            type: "manageable_terrain",
            name: `Manageable Route (Avg: ${manageableElevationSum.toFixed(
              0
            )}m elevation) - Local OSRM`,
            waypoints: localRoutes.manageable,
            avgElevation:
              manageableStats?.averageElevation ?? manageableElevationSum,
            route: {
              distance: Math.round(
                calculateRouteDistance(localRoutes.manageable) * 1000
              ),
              duration: Math.round(
                (calculateRouteDistance(localRoutes.manageable) / 35) * 60
              ),
            },
            plannedWaypoints: localRoutes.manageable,
            floodRisk: manageableStats?.riskCategory ?? "manageable",
            terrainStats: manageableStats ?? null,
          });
        }

        if (localRoutes.prone.length > 0) {
          console.log("✅ Got flood-prone route from local OSRM");
          const proneElevationSum = await calculateAverageElevation(
            localRoutes.prone
          );
          const proneStats = evaluateTerrainForRoute(localRoutes.prone);
          if (proneStats) {
            proneStats.usedRoadIds.forEach((id) =>
              distinctRouteRoadIds.add(id)
            );
          }
          routes.push({
            type: "flood_prone_terrain",
            name: `Flood-Prone Route (Avg: ${proneElevationSum.toFixed(
              0
            )}m elevation) - Local OSRM`,
            waypoints: localRoutes.prone,
            avgElevation:
              proneStats?.averageElevation ?? proneElevationSum,
            route: {
              distance: Math.round(
                calculateRouteDistance(localRoutes.prone) * 1000
              ),
              duration: Math.round(
                (calculateRouteDistance(localRoutes.prone) / 30) * 60
              ),
            },
            plannedWaypoints: localRoutes.prone,
            floodRisk: proneStats?.riskCategory ?? "prone",
            terrainStats: proneStats ?? null,
          });
        }

        // If we got all three routes from local OSRM, we're done!
        if (routes.length === 3) {
          console.log(
            "🎉 Successfully got all 3 distinct routes from local OSRM!"
          );
          return routes;
        } else {
          console.log(
            `⚠️ Only got ${routes.length}/3 routes from local OSRM, filling remaining with fallback methods...`
          );
        }
      } catch (error) {
        console.warn(
          "❌ Local OSRM distinct routes failed, falling back to individual route generation:",
          error
        );
      }
    }

    // FALLBACK: Generate any missing routes using the original method

    // ROUTE 1: SAFEST ROUTE - Prioritize high elevation, avoid flood zones (REAL ROADS)
    console.log("\n--- ROUTE 1: SAFEST HIGH-ELEVATION ROUTE (REAL ROADS) ---");

    let safeRoute: LatLng[] | null = null;

    // Always prioritize local OSRM for real road routing
    console.log(
      "  Using local OSRM for real road routing (safest/green route)..."
    );

    if (USE_LOCAL_OSRM) {
      // Try direct route first with local OSRM
      console.log("  Trying direct local OSRM route first...");
      try {
        safeRoute = await getLocalOSRMRoute(start, end);
        console.log("  ✅ Local OSRM direct route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM direct failed, trying with northern waypoint..."
        );
      }
    }

    if (!safeRoute && USE_LOCAL_OSRM) {
      // Try northern route with local OSRM for higher elevation preference
      console.log(
        "  Trying NORTHERN route with local OSRM (higher elevation preference)..."
      );
      const northOffset = 0.008;
      const eastWestOffset = 0.005;
      const safeWaypoint1 = {
        lat: (start.lat + end.lat) / 2 + northOffset,
        lng: start.lng + (end.lng - start.lng) * 0.4 + eastWestOffset,
      };

      try {
        safeRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          safeWaypoint1,
          end
        );
        console.log("  ✅ Local OSRM northern route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM northern failed, trying alternative waypoint..."
        );
      }
    }

    if (!safeRoute && USE_LOCAL_OSRM) {
      console.log("  Trying alternative approach with local OSRM...");
      const altWaypoint = {
        lat: start.lat + (end.lat - start.lat) * 0.6 + 0.003,
        lng: start.lng + (end.lng - start.lng) * 0.6,
      };

      try {
        safeRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          altWaypoint,
          end
        );
        console.log("  ✅ Local OSRM alternative waypoint successful");
      } catch (error) {
        console.log(
          "  ❌ All local OSRM waypoint attempts failed, falling back to external services..."
        );
      }
    }

    // Fallback to external services only if local OSRM completely fails
    if (!safeRoute) {
      console.log(
        "  Local OSRM failed completely, falling back to external OSRM for real roads..."
      );

      // For short distances, try external OSRM first
      if (distance < 2.5) {
        safeRoute = await tryRouteFromAPI(
          [start, end],
          "Safe Direct External",
          2000
        );
      } else {
        // For longer distances, try with waypoints
        safeRoute = await tryRouteFromAPI(
          [start, end],
          "Safe Direct Route (External)",
          4000
        );

        if (!safeRoute) {
          const northOffset = 0.008;
          const eastWestOffset = 0.005;
          const safeWaypoint1 = {
            lat: (start.lat + end.lat) / 2 + northOffset,
            lng: start.lng + (end.lng - start.lng) * 0.4 + eastWestOffset,
          };
          safeRoute = await tryRouteFromAPI(
            [start, safeWaypoint1, end],
            "Safe Northern Route (External)",
            6000
          );
        }
      }

      // Last resort: no route if all real road routing failed
      if (!safeRoute) {
        console.log(
          "  ❌ ERROR: All real road routing failed, unable to generate safe route"
        );
        return []; // Return empty array if no real road route can be found
      }
    }

    // Analyze actual route elevation profile
    let routeElevationSum = 0;
    let elevationSampleCount = 0;
    const samplePoints = Math.min(safeRoute.length, 10);

    for (let i = 0; i < samplePoints; i++) {
      const idx = Math.floor((i / (samplePoints - 1)) * (safeRoute.length - 1));
      const elevation = await getPointElevation(
        safeRoute[idx].lat,
        safeRoute[idx].lng
      );
      routeElevationSum += elevation;
      elevationSampleCount++;
    }

    const avgElevation =
      elevationSampleCount > 0 ? routeElevationSum / elevationSampleCount : 15;

    const safeTerrainStats = evaluateTerrainForRoute(safeRoute);
    if (safeTerrainStats) {
      safeTerrainStats.usedRoadIds.forEach((id) =>
        distinctRouteRoadIds.add(id)
      );
    }

    routes.push({
      type: "safe_terrain",
      name: `Safe Route (Avg: ${avgElevation.toFixed(0)}m elevation)`,
      waypoints: safeRoute,
      avgElevation: safeTerrainStats?.averageElevation ?? avgElevation,
      route: {
        distance: Math.round(calculateRouteDistance(safeRoute) * 1000),
        duration: Math.round((calculateRouteDistance(safeRoute) / 40) * 60),
      },
      plannedWaypoints: safeRoute || [],
      floodRisk: safeTerrainStats?.riskCategory ??
        (avgElevation > 20 ? "safe" : avgElevation > 10 ? "manageable" : "prone"),
      terrainStats: safeTerrainStats ?? null,
    });

    // ROUTE 2: MODERATE ROUTE - Balanced between elevation and directness
    console.log("\n--- ROUTE 2: MODERATE ELEVATION ROUTE (REAL ROADS) ---");

    let moderateRoute: LatLng[] | null = null;

    // Force to use local OSRM for real road routing
    console.log(
      "  Using local OSRM for real road routing (manageable/orange route)..."
    );

    // Try alternative starting direction for moderate route with local OSRM
    console.log(
      "  Trying alternative highway route (Maria Clara L. Lobregat) via local OSRM..."
    );
    const earlyAlternative = {
      lat: start.lat + (end.lat - start.lat) * 0.15,
      lng: start.lng + (end.lng - start.lng) * 0.15 - 0.008,
    };

    if (USE_LOCAL_OSRM) {
      try {
        moderateRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          earlyAlternative,
          end
        );
        console.log("  ✅ Local OSRM alternative highway route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM alternative failed, trying direct local OSRM..."
        );
      }
    }

    if (!moderateRoute && USE_LOCAL_OSRM) {
      console.log("  Trying direct local OSRM route...");
      try {
        moderateRoute = await getLocalOSRMRoute(start, end);
        console.log("  ✅ Local OSRM direct route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM direct failed, trying with waypoint variation..."
        );
      }
    }

    if (!moderateRoute && USE_LOCAL_OSRM) {
      console.log("  Trying western highway direction via local OSRM...");
      const westHighwayDirection = {
        lat: start.lat + (end.lat - start.lat) * 0.2,
        lng: start.lng + (end.lng - start.lng) * 0.2 - 0.012,
      };
      try {
        moderateRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          westHighwayDirection,
          end
        );
        console.log("  ✅ Local OSRM western highway route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM western failed, trying eastern variation..."
        );
      }
    }

    if (!moderateRoute && USE_LOCAL_OSRM) {
      console.log("  Trying eastern variation via local OSRM...");
      const eastOffset = 0.006;
      const eastWaypoint = {
        lat: (start.lat + end.lat) / 2,
        lng: (start.lng + end.lng) / 2 + eastOffset,
      };
      try {
        moderateRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          eastWaypoint,
          end
        );
        console.log("  ✅ Local OSRM eastern variation successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM eastern failed, falling back to external services..."
        );
      }
    }

    // Fallback to external services only if local OSRM completely fails
    if (!moderateRoute) {
      console.log(
        "  Local OSRM failed completely, falling back to external OSRM for real roads..."
      );
      moderateRoute = await tryRouteFromAPI(
        [start, earlyAlternative, end],
        "Alternative Highway Route (External)",
        5000
      );

      if (!moderateRoute) {
        moderateRoute = await tryRouteFromAPI(
          [start, end],
          "Moderate Direct Route (External)",
          4000
        );
      }

      // Last resort: no route if all real road routing failed
      if (!moderateRoute) {
        console.log(
          "  ❌ ERROR: All real road routing failed, unable to generate moderate route"
        );
        return []; // Return empty array if no real road route can be found
      }
    }

    // Analyze moderate route elevation
    routeElevationSum = 0;
    elevationSampleCount = 0;

    for (let i = 0; i < Math.min(moderateRoute.length, 10); i++) {
      const idx = Math.floor((i / 9) * (moderateRoute.length - 1));
      const elevation = await getPointElevation(
        moderateRoute[idx].lat,
        moderateRoute[idx].lng
      );
      routeElevationSum += elevation;
      elevationSampleCount++;
    }

    const avgElevationModerate =
      elevationSampleCount > 0 ? routeElevationSum / elevationSampleCount : 10;

    const manageableTerrainStats = evaluateTerrainForRoute(moderateRoute);
    if (manageableTerrainStats) {
      manageableTerrainStats.usedRoadIds.forEach((id) =>
        distinctRouteRoadIds.add(id)
      );
    }

    routes.push({
      type: "manageable_terrain",
      name: `Manageable Route (Avg: ${avgElevationModerate.toFixed(
        0
      )}m elevation)`,
      waypoints: moderateRoute,
      avgElevation:
        manageableTerrainStats?.averageElevation ?? avgElevationModerate,
      route: {
        distance: Math.round(calculateRouteDistance(moderateRoute) * 1000),
        duration: Math.round((calculateRouteDistance(moderateRoute) / 35) * 60),
      },
      plannedWaypoints:
        moderateRoute.length > 10 ? [start, end] : moderateRoute,
      floodRisk:
        manageableTerrainStats?.riskCategory ??
        (avgElevationModerate > 15
          ? "safe"
          : avgElevationModerate > 8
          ? "manageable"
          : "prone"),
      terrainStats: manageableTerrainStats ?? null,
    });

    // ROUTE 3: FLOOD-PRONE ROUTE - Lower elevation, coastal areas (REAL ROADS)
    console.log(
      "\n--- ROUTE 3: FLOOD-PRONE LOW-ELEVATION ROUTE (REAL ROADS) ---"
    );

    let riskyRoute: LatLng[] | null = null;

    // Force to use local OSRM for real road routing
    console.log(
      "  Using local OSRM for real coastal road routing (flood-prone/red route)..."
    );

    // Try eastern coastal starting direction with local OSRM
    console.log(
      "  Trying EASTERN coastal starting direction via local OSRM..."
    );
    const earlyEastern = {
      lat: start.lat + (end.lat - start.lat) * 0.12,
      lng: start.lng + (end.lng - start.lng) * 0.12 + 0.006,
    };

    if (USE_LOCAL_OSRM) {
      try {
        riskyRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          earlyEastern,
          end
        );
        console.log("  ✅ Local OSRM eastern coastal route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM eastern coastal failed, trying coastal waypoints..."
        );
      }
    }

    if (!riskyRoute && USE_LOCAL_OSRM) {
      console.log("  Trying coastal waypoints via local OSRM (port areas)...");
      const portWaypoint = { lat: 6.9056, lng: 122.0756 }; // Port area (known low elevation)
      try {
        riskyRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          portWaypoint,
          end
        );
        console.log("  ✅ Local OSRM port area route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM port route failed, trying downtown coastal..."
        );
      }
    }

    if (!riskyRoute && USE_LOCAL_OSRM) {
      console.log("  Trying downtown coastal route via local OSRM...");
      const downtownCoastal = { lat: 6.91, lng: 122.072 }; // Downtown coastal
      try {
        riskyRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          downtownCoastal,
          end
        );
        console.log("  ✅ Local OSRM downtown coastal route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM downtown coastal failed, trying southern coastal..."
        );
      }
    }

    if (!riskyRoute && USE_LOCAL_OSRM) {
      console.log("  Trying southern coastal area via local OSRM...");
      const southernCoastal = { lat: 6.9, lng: 122.065 }; // Southern coastal area (low elevation)
      try {
        riskyRoute = await getLocalOSRMRouteWithWaypoint(
          start,
          southernCoastal,
          end
        );
        console.log("  ✅ Local OSRM southern coastal route successful");
      } catch (error) {
        console.log(
          "  ❌ Local OSRM southern coastal failed, trying direct local route..."
        );
      }
    }

    if (!riskyRoute && USE_LOCAL_OSRM) {
      console.log("  Trying direct local OSRM route as coastal alternative...");
      try {
        riskyRoute = await getLocalOSRMRoute(start, end);
        console.log(
          "  ✅ Local OSRM direct route successful (will be styled as flood-prone)"
        );
      } catch (error) {
        console.log(
          "  ❌ All local OSRM attempts failed, falling back to external services..."
        );
      }
    }

    // Fallback to external services only if local OSRM completely fails
    if (!riskyRoute) {
      console.log(
        "  Local OSRM failed completely, falling back to external OSRM for real roads..."
      );

      // Try external OSRM with coastal waypoints
      const coastalWaypoints = [
        start,
        { lat: 6.9056, lng: 122.0756 }, // Port area
        { lat: 6.91, lng: 122.072 }, // Downtown coastal
        end,
      ];
      riskyRoute = await tryRouteFromAPI(
        coastalWaypoints,
        "Coastal Flood-Prone (External)",
        5000
      );

      if (!riskyRoute) {
        // Try direct external route
        riskyRoute = await tryRouteFromAPI(
          [start, end],
          "Direct Flood-Prone (External)",
          4000
        );
      }

      // Last resort: no route if all real road routing failed
      if (!riskyRoute) {
        console.log(
          "  ❌ ERROR: All real road routing failed, unable to generate risky route"
        );
        return []; // Return empty array if no real road route can be found
      }
    }

    // Analyze risky route elevation
    routeElevationSum = 0;
    elevationSampleCount = 0;

    for (let i = 0; i < Math.min(riskyRoute.length, 10); i++) {
      const idx = Math.floor((i / 9) * (riskyRoute.length - 1));
      const elevation = await getPointElevation(
        riskyRoute[idx].lat,
        riskyRoute[idx].lng
      );
      routeElevationSum += elevation;
      elevationSampleCount++;
    }

    const avgElevationRisky =
      elevationSampleCount > 0 ? routeElevationSum / elevationSampleCount : 5;

    const riskyTerrainStats = evaluateTerrainForRoute(riskyRoute);
    if (riskyTerrainStats) {
      riskyTerrainStats.usedRoadIds.forEach((id) =>
        distinctRouteRoadIds.add(id)
      );
    }

    routes.push({
      type: "flood_prone_terrain",
      name: `Flood-Prone Route (Avg: ${avgElevationRisky.toFixed(
        0
      )}m elevation)`,
      waypoints: riskyRoute,
      avgElevation:
        riskyTerrainStats?.averageElevation ?? avgElevationRisky,
      route: {
        distance: Math.round(calculateRouteDistance(riskyRoute) * 1000),
        duration: Math.round((calculateRouteDistance(riskyRoute) / 30) * 60),
      },
      plannedWaypoints: riskyRoute.length > 10 ? [start, end] : riskyRoute,
      floodRisk: riskyTerrainStats?.riskCategory ?? "prone",
      terrainStats: riskyTerrainStats ?? null,
    });

    // CRITICAL: Validate route separation and force distinctness if needed
    console.log("\n=== VALIDATING ROUTE SEPARATION ===");

    // Dynamic separation requirements based on route length - MUCH MORE STRICT
    // For very long routes (50km+), require 2-3km separation for distinct visibility
    // For medium routes (10-50km), require 1.5-2km separation
    // For short routes (<10km), require very high separation for clear visual distinction
    const minRequiredSeparation =
      distance > 50 ? 2000 : distance > 10 ? 1500 : 2500; // Much more strict requirements
    let separationAttempts = 0;
    const maxSeparationAttempts = distance > 50 ? 2 : distance < 5 ? 4 : 3; // More attempts for better separation

    console.log(
      `Route distance: ${distance.toFixed(
        1
      )}km, required separation: ${minRequiredSeparation}m (STRICT)`
    );

    while (separationAttempts < maxSeparationAttempts) {
      let allRoutesValid = true;

      for (let i = 0; i < routes.length; i++) {
        for (let j = i + 1; j < routes.length; j++) {
          const route1 = routes[i];
          const route2 = routes[j];

          // Check separation at multiple points along routes, EXCLUDING start/end points
          let minSeparation = Infinity;
          let maxSeparation = 0;
          let totalSeparation = 0;
          const checkPoints = 15;
          let validCheckPoints = 0;

          for (let k = 1; k < checkPoints - 1; k++) {
            // Skip k=0 (start) and k=checkPoints-1 (end)
            const progress = k / (checkPoints - 1);

            const idx1 = Math.floor(progress * (route1.waypoints.length - 1));
            const idx2 = Math.floor(progress * (route2.waypoints.length - 1));

            // Skip if we're too close to start or end points
            if (
              idx1 < 5 ||
              idx1 > route1.waypoints.length - 6 ||
              idx2 < 5 ||
              idx2 > route2.waypoints.length - 6
            ) {
              continue;
            }

            const point1 = route1.waypoints[idx1];
            const point2 = route2.waypoints[idx2];

            const separation =
              Math.sqrt(
                Math.pow(point1.lat - point2.lat, 2) +
                  Math.pow(point1.lng - point2.lng, 2)
              ) * 111000; // meters

            minSeparation = Math.min(minSeparation, separation);
            maxSeparation = Math.max(maxSeparation, separation);
            totalSeparation += separation;
            validCheckPoints++;
          }

          const avgSeparation =
            validCheckPoints > 0 ? totalSeparation / validCheckPoints : 0;

          console.log(
            `${route1.type} ↔ ${route2.type}: min=${
              minSeparation === Infinity ? "N/A" : minSeparation.toFixed(0)
            }m, avg=${avgSeparation.toFixed(0)}m, max=${maxSeparation.toFixed(
              0
            )}m separation (middle sections only)`
          );

          // Use average separation for validation, but only if we have valid middle points
          // For long routes (>20km), require less separation since even 1-2km difference is significant
          // For short urban routes (<5km), use more lenient separation since road networks are limited
          let dynamicMinSeparation = minRequiredSeparation; // Default 500m
          if (distance > 20) {
            dynamicMinSeparation = 200; // 200m for long routes
          } else if (distance < 5) {
            dynamicMinSeparation = 250; // 250m for short urban routes where road options are limited
          }

          if (validCheckPoints > 0 && avgSeparation < dynamicMinSeparation) {
            // Check if this is the last attempt - be more accepting
            if (separationAttempts >= maxSeparationAttempts - 1) {
              console.log(
                `ℹ️ Routes naturally similar (${avgSeparation.toFixed(
                  0
                )}m separation) - this is normal for limited road networks in urban areas. Accepting routes.`
              );
            } else {
              console.log(
                `ℹ️ Routes close (${avgSeparation.toFixed(
                  0
                )}m < ${dynamicMinSeparation}m). Trying alternative (attempt ${
                  separationAttempts + 1
                })...`
              );
              allRoutesValid = false;

              // Try to regenerate route with alternative waypoints for road-following
              let alternativeRoute = await tryAlternativeRouteFromAPI(
                start,
                end,
                route2.type,
                separationAttempts
              );

              if (alternativeRoute && alternativeRoute.length > 10) {
                // Successfully got road-based alternative
                route2.waypoints = alternativeRoute;
                console.log(
                  `✓ Generated alternative road-based route for ${route2.type}`
                );
              } else {
                // Fallback to aggressive geometric separation that guarantees distinctness
                const separationMultiplier = 2.0 + separationAttempts * 1.0; // Much stronger separation
                route2.waypoints = forceRouteSeparationEnhanced(
                  route1.waypoints,
                  route2.waypoints,
                  start,
                  end,
                  route2.type,
                  separationMultiplier
                );
                console.log(
                  `✓ Used aggressive geometric separation for ${route2.type} with ${separationMultiplier}x offset`
                );
              }
            }
          } else if (validCheckPoints > 0) {
            console.log(
              `✅ Routes adequately separated - avg separation ${avgSeparation.toFixed(
                0
              )}m > required ${dynamicMinSeparation}m`
            );
          } else {
            console.log(
              `ℹ️ Routes are identical or too short to measure middle separation - accepting as valid`
            );
          }
        }
      }

      if (allRoutesValid) {
        console.log(
          `✅ All routes adequately separated after ${
            separationAttempts + 1
          } attempt(s)`
        );
        break;
      }

      separationAttempts++;
    }

    console.log("\n=== VALIDATING TERRAIN-BASED ROUTES ===");
    routes.forEach((route, idx) => {
      console.log(`Route ${idx + 1} (${route.type}):`);
      console.log(`  - Average elevation: ${route.avgElevation.toFixed(1)}m`);
      console.log(`  - Flood risk level: ${route.floodRisk}`);
      console.log(
        `  - Distance: ${(route.route.distance / 1000).toFixed(1)}km`
      );
      console.log(`  - Waypoints: ${route.waypoints.length} points`);
      if (route.terrainStats) {
        console.log(
          `  - Terrain stats: ${(route.terrainStats.floodedRatio * 100).toFixed(
            1
          )}% flooded, ${(route.terrainStats.safeRatio * 100).toFixed(1)}% safe`
        );
      }

      // Check if route uses OSRM (likely following roads)
      const usesRoads = route.waypoints.length > 10;
      const routeQuality = usesRoads ? "ROAD-BASED ✓" : "GEOMETRIC FALLBACK ⚠️";
      console.log(`  - Route quality: ${routeQuality}`);

      if (!usesRoads) {
        console.warn(
          `    ⚠️ ${route.type} is using geometric fallback - may not follow roads!`
        );
      }
    });

    const riskOrdering: Record<string, number> = {
      safe: 0,
      manageable: 1,
      prone: 2,
    };

    routes.sort((a, b) => {
      const rankA = riskOrdering[a.floodRisk as keyof typeof riskOrdering] ?? 1;
      const rankB = riskOrdering[b.floodRisk as keyof typeof riskOrdering] ?? 1;

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return (b.avgElevation ?? 0) - (a.avgElevation ?? 0);
    });

    routes.forEach((route) => {
      if (route.floodRisk === "safe") {
        route.type = "safe_terrain";
      } else if (route.floodRisk === "manageable") {
        route.type = "manageable_terrain";
      } else if (route.floodRisk === "prone") {
        route.type = "flood_prone_terrain";
      }
    });

    const hasSafeRoute = routes.some((route) => route.floodRisk === "safe");
    const hasManageableRoute = routes.some(
      (route) => route.floodRisk === "manageable"
    );
    const hasProneRoute = routes.some((route) => route.floodRisk === "prone");

    if (!hasSafeRoute || !hasManageableRoute || !hasProneRoute) {
      const byFloodCoverage = [...routes].sort((a, b) => {
        const ratioA = a.terrainStats?.floodedRatio ?? 1;
        const ratioB = b.terrainStats?.floodedRatio ?? 1;
        return ratioA - ratioB;
      });

      if (!hasSafeRoute && byFloodCoverage.length > 0) {
        byFloodCoverage[0].floodRisk = "safe";
        byFloodCoverage[0].type = "safe_terrain";
      }
      if (!hasProneRoute && byFloodCoverage.length > 0) {
        const last = byFloodCoverage[byFloodCoverage.length - 1];
        last.floodRisk = "prone";
        last.type = "flood_prone_terrain";
      }
      if (!hasManageableRoute && byFloodCoverage.length > 1) {
        const mid = byFloodCoverage[Math.floor(byFloodCoverage.length / 2)];
        mid.floodRisk = "manageable";
        mid.type = "manageable_terrain";
      }
    }

    // FINAL VALIDATION: Ensure routes are truly distinct
    console.log("\n=== FINAL ROUTE DISTINCTNESS VALIDATION ===");
    let finalValidation = true;

    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        const route1 = routes[i];
        const route2 = routes[j];

        // Check START POINT divergence (critical for visual distinction)
        const startSeparationPoints = Math.min(
          20,
          Math.floor(route1.waypoints.length * 0.1)
        ); // First 10% of route
        let startSeparationSum = 0;
        let startValidPoints = 0;

        for (let k = 5; k < startSeparationPoints; k++) {
          // Skip first 5 points (can be same)
          if (route1.waypoints[k] && route2.waypoints[k]) {
            const separation =
              Math.sqrt(
                Math.pow(route1.waypoints[k].lat - route2.waypoints[k].lat, 2) +
                  Math.pow(route1.waypoints[k].lng - route2.waypoints[k].lng, 2)
              ) * 111000;
            startSeparationSum += separation;
            startValidPoints++;
          }
        }

        const avgStartSeparation =
          startValidPoints > 0 ? startSeparationSum / startValidPoints : 0;

        // Check middle section separation
        const mid1 = route1.waypoints[Math.floor(route1.waypoints.length / 2)];
        const mid2 = route2.waypoints[Math.floor(route2.waypoints.length / 2)];

        const midSeparation =
          Math.sqrt(
            Math.pow(mid1.lat - mid2.lat, 2) + Math.pow(mid1.lng - mid2.lng, 2)
          ) * 111000; // meters

        console.log(
          `Final check ${route1.type} ↔ ${
            route2.type
          }: ${avgStartSeparation.toFixed(
            0
          )}m start separation, ${midSeparation.toFixed(0)}m middle separation`
        );

        // FLEXIBLE validation: Allow same start if middle separation is good, OR require start separation if middle is poor
        const hasGoodMiddleSeparation = midSeparation >= 1500; // 1.5km+ middle separation is excellent
        const hasDecentStartSeparation = avgStartSeparation >= 300; // 300m+ start separation is decent

        let needsImprovement = false;
        let reason = "";

        if (hasGoodMiddleSeparation) {
          // If middle separation is excellent (1.5km+), we can accept same start point
          console.log(
            `  ✅ Excellent middle separation (${midSeparation.toFixed(
              0
            )}m) - accepting route despite start overlap`
          );
        } else if (hasDecentStartSeparation && midSeparation >= 800) {
          // If decent start separation + good middle separation
          console.log(
            `  ✅ Good overall separation - start: ${avgStartSeparation.toFixed(
              0
            )}m, middle: ${midSeparation.toFixed(0)}m`
          );
        } else {
          // Need improvement
          needsImprovement = true;
          reason = `Poor separation - start: ${avgStartSeparation.toFixed(
            0
          )}m, middle: ${midSeparation.toFixed(0)}m`;
        }

        if (needsImprovement) {
          console.warn(`⚠️ Route needs improvement: ${reason}`);

          // Check if routes are road-based before force separation
          const route1IsRoadBased = route1.waypoints.length > 50; // Road routes have many waypoints
          const route2IsRoadBased = route2.waypoints.length > 50;

          if (route1IsRoadBased && route2IsRoadBased) {
            console.log(
              `  🔄 Attempting terrain-aware recalculation to reduce overlap for ${route2.type}`
            );

            const avoidanceRoadIds = new Set<string>();
            const referenceStats =
              route1.terrainStats || evaluateTerrainForRoute(route1.waypoints);
            const targetStats =
              route2.terrainStats || evaluateTerrainForRoute(route2.waypoints);

            referenceStats?.usedRoadIds.forEach((id) =>
              avoidanceRoadIds.add(id)
            );
            targetStats?.usedRoadIds.forEach((id) =>
              avoidanceRoadIds.add(id)
            );

            let priorityMode: "safe" | "manageable" | "flood_prone" =
              "manageable";
            if (route2.type === "safe_terrain") {
              priorityMode = "safe";
            } else if (route2.type === "flood_prone_terrain") {
              priorityMode = "flood_prone";
            }

            let recalculated = null as LatLng[] | null;
            try {
              recalculated = await getTerrainAwareRoute(
                start,
                end,
                priorityMode,
                { excludeRoadIds: avoidanceRoadIds }
              );
            } catch (recalcError) {
              console.warn(
                "    ⚠️ Terrain-aware recalculation failed:",
                recalcError
              );
            }

            if (recalculated && recalculated.length > 1) {
              console.log(
                "    ✅ Found alternative road route using terrain index"
              );
              const recalculatedStats = evaluateTerrainForRoute(recalculated);
              route2.waypoints = recalculated;
              route2.avgElevation =
                recalculatedStats?.averageElevation ?? route2.avgElevation;
              route2.floodRisk =
                recalculatedStats?.riskCategory ?? route2.floodRisk;
              route2.terrainStats = recalculatedStats ?? route2.terrainStats ?? null;

              const recalculatedDistance = calculateRouteDistance(recalculated);
              route2.route.distance = Math.round(recalculatedDistance * 1000);
              const speedDivisor =
                priorityMode === "safe"
                  ? 40
                  : priorityMode === "manageable"
                  ? 35
                  : 30;
              route2.route.duration = Math.round(
                (recalculatedDistance / speedDivisor) * 60
              );

              finalValidation = false;
            } else {
              console.log(
                "    ℹ️ Keeping existing road-based route after recalculation attempt"
              );
            }
          } else {
            console.warn(
              `  🔧 Applying force separation (route quality: ${route1.waypoints.length}, ${route2.waypoints.length} waypoints)`
            );
            const forceMultiplier = 4.0; // Very aggressive separation
            route2.waypoints = forceRouteSeparationEnhanced(
              route1.waypoints,
              route2.waypoints,
              start,
              end,
              route2.type,
              forceMultiplier
            );
            finalValidation = false;
          }
        }
      }
    }

    // Check if routes are too similar before finalizing
    if (routes.length >= 2 && areRoutesTooSimilar(routes)) {
      console.log(
        "⚠️ ROUTES TOO SIMILAR - Switching to Safest vs Fastest mode"
      );
      setShowIdenticalTerrainNotification(true);
      setSafestFastestMode(true);

      // Generate safest vs fastest routes instead
      const safestFastestRoutes = await generateSafestFastestRoutes(start, end);
      return safestFastestRoutes;
    }

    console.log(
      `\n=== SUCCESSFULLY GENERATED ${routes.length} SEPARATED TERRAIN-BASED ROUTES ===`
    );
    console.log("Final Route Classification:");
    routes.forEach((route, idx) => {
      console.log(
        `  ${
          idx + 1
        }. ${route.floodRisk.toUpperCase()}: ${route.avgElevation.toFixed(
          0
        )}m avg elevation`
      );
    });
    console.log(
      `Final validation status: ${
        finalValidation ? "✅ DISTINCT" : "⚠️ FORCED SEPARATION APPLIED"
      }`
    );

    setSafestFastestMode(false); // Ensure normal mode if we got distinct routes
    return routes.slice(0, 3);
  };

  const generateFloodRoutes = async (
    start: LatLng,
    end: LatLng
  ): Promise<RouteDetails> => {
    try {
      console.log(
        "🚀 Generating multiple route alternatives with risk analysis..."
      );
      console.log("📍 DEBUG: Input coordinates:");
      console.log(`   Start: lat=${start.lat}, lng=${start.lng}`);
      console.log(`   End: lat=${end.lat}, lng=${end.lng}`);

      // Validate coordinates are within Zamboanga bounds before routing
      if (
        start.lat < 6.8 ||
        start.lat > 7.2 ||
        start.lng < 122.0 ||
        start.lng > 122.3
      ) {
        console.error("❌ Start coordinates outside Zamboanga bounds!");
        throw new Error(
          `Start coordinates (${start.lat}, ${start.lng}) are outside Zamboanga City bounds`
        );
      }

      if (
        end.lat < 6.8 ||
        end.lat > 7.2 ||
        end.lng < 122.0 ||
        end.lng > 122.3
      ) {
        console.error("❌ End coordinates outside Zamboanga bounds!");
        throw new Error(
          `End coordinates (${end.lat}, ${end.lng}) are outside Zamboanga City bounds`
        );
      }

      // Try backend route API first, fallback to OSRM if it fails
      let routes: any[] = [];
      let routeAnalyses: any[] = [];

      try {
        // First try the local routing service on port 8001 (with GeoJSON road data)
        console.log(
          "🚀 Trying local routing service with GeoJSON road data..."
        );
        const localRoute = await getLocalRoutingServiceRoute(start, end);

        // Handle both local routing format and OSRM fallback format
        let waypoints = [];
        let distance = 0;
        let duration = 0;

        if (localRoute && localRoute.route && localRoute.route.length > 0) {
          console.log("✅ Got route from local routing service!");

          // Convert the route points to waypoints format
          waypoints = localRoute.route.map((point: any) => ({
            lat: point.lat,
            lng: point.lng,
          }));
          distance = localRoute.distance || 0;
          duration = localRoute.duration || 0;
        } else if (
          localRoute &&
          localRoute.routes &&
          localRoute.routes.length > 0
        ) {
          console.log(
            `✅ Got ${localRoute.routes.length} route(s) from OSRM fallback service!`
          );

          // Handle OSRM format with multiple routes if available
          if (localRoute.routes.length >= 3) {
            console.log("🎯 Using 3 different OSRM alternative routes");
            // Use the first 3 routes as different alternatives
            const route1 = localRoute.routes[0];
            const route2 = localRoute.routes[1];
            const route3 = localRoute.routes[2];

            // Will be processed separately below for each route type
          } else {
            console.log(
              "⚠️ Only got 1-2 routes, will create variations of the main route"
            );
            // Use first route and create variations
            const route = localRoute.routes[0];
            waypoints = route.geometry.coordinates.map((coord: any) => ({
              lat: coord[1],
              lng: coord[0],
            }));
            distance = (route.distance || 0) / 1000; // Convert from meters to km
            duration = (route.duration || 0) / 60; // Convert from seconds to minutes
          }
        }

        // Create route objects based on available data
        let safeRoute: FloodRoute;
        let manageableRoute: FloodRoute;
        let proneRoute: FloodRoute;

        // Handle multiple OSRM routes if available
        if (localRoute && localRoute.routes && localRoute.routes.length >= 3) {
          console.log("🎯 Using 3 different OSRM alternative routes");

          // Route 1: Safe (best/fastest route)
          const route1 = localRoute.routes[0];
          const waypoints1 = route1.geometry.coordinates.map((coord: any) => ({
            lat: coord[1],
            lng: coord[0],
          }));
          safeRoute = {
            waypoints: waypoints1,
            distance: `${((route1.distance || 0) / 1000).toFixed(1)} km`,
            time: `${((route1.duration || 0) / 60).toFixed(0)} min`,
            riskLevel: "Safe Route",
            floodRisk: "safe",
            color: "#27ae60",
            description: "Recommended safe route (fastest)",
          };

          // Route 2: Manageable (alternative route)
          const route2 = localRoute.routes[1];
          const waypoints2 = route2.geometry.coordinates.map((coord: any) => ({
            lat: coord[1],
            lng: coord[0],
          }));
          manageableRoute = {
            waypoints: waypoints2,
            distance: `${((route2.distance || 0) / 1000).toFixed(1)} km`,
            time: `${((route2.duration || 0) / 60).toFixed(0)} min`,
            riskLevel: "Manageable Risk",
            floodRisk: "manageable",
            color: "#f39c12",
            description: "Alternative route with manageable risk",
          };

          // Route 3: High Risk (third alternative)
          const route3 = localRoute.routes[2];
          const waypoints3 = route3.geometry.coordinates.map((coord: any) => ({
            lat: coord[1],
            lng: coord[0],
          }));
          proneRoute = {
            waypoints: waypoints3,
            distance: `${((route3.distance || 0) / 1000).toFixed(1)} km`,
            time: `${((route3.duration || 0) / 60).toFixed(0)} min`,
            riskLevel: "High Risk",
            floodRisk: "prone",
            color: "#e74c3c",
            description: "High risk alternative route",
          };

          console.log(
            `📍 Using 3 different routes: Safe(${waypoints1.length} pts), Manageable(${waypoints2.length} pts), Prone(${waypoints3.length} pts)`
          );
        } else if (waypoints.length > 0) {
          console.log(
            `📍 Using single route with variations: ${
              waypoints.length
            } waypoints, ${distance.toFixed(1)}km, ${duration.toFixed(0)}min`
          );

          // Create route objects for each risk level with the same waypoints but different styling
          safeRoute = {
            waypoints,
            distance: `${distance.toFixed(1)} km`,
            time: `${duration.toFixed(0)} min`,
            riskLevel: "Safe Route",
            floodRisk: "safe",
            color: "#27ae60",
            description: "Recommended safe route using local road data",
          };

          manageableRoute = {
            waypoints,
            distance: `${distance.toFixed(1)} km`,
            time: `${(duration * 1.2).toFixed(0)} min`,
            riskLevel: "Manageable Risk",
            floodRisk: "manageable",
            color: "#f39c12",
            description: "Alternative route with manageable flood risk",
          };

          proneRoute = {
            waypoints,
            distance: `${distance.toFixed(1)} km`,
            time: `${(duration * 1.5).toFixed(0)} min`,
            riskLevel: "High Risk",
            floodRisk: "prone",
            color: "#e74c3c",
            description: "High risk route - use with caution during floods",
          };
        } else {
          // No valid routes found, continue to fallback
          console.log("❌ No valid routes found from local service");
        }

        // Return routes if we have them
        if (safeRoute && manageableRoute && proneRoute) {
          return {
            safeRoute,
            manageableRoute,
            proneRoute,
            startName: selectedStartLocation?.display_name || "Start Point",
            endName: selectedEndLocation?.display_name || "End Point",
          };
        }

        // Fallback to the original backend service if local routing fails
        console.log(
          "⚠️ Local routing service failed, falling back to backend service..."
        );
        console.log(
          `🌐 Calling route API: ${BACKEND_URL}/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true`
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const routeResponse = await fetch(
          `${BACKEND_URL}/route?start=${start.lng},${start.lat}&end=${end.lng},${end.lat}&alternatives=true`,
          {
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        clearTimeout(timeoutId);

        if (!routeResponse.ok) {
          throw new Error(
            `Route API failed with status: ${routeResponse.status}`
          );
        }

        const routeData = await routeResponse.json();
        console.log("Route API response:", routeData);
        routes = routeData.routes || [];
        routeAnalyses = routeData.analyses || [];

        if (routes.length === 0) {
          throw new Error("No routes found from backend API");
        }

        console.log(`Got ${routes.length} route alternatives from backend API`);
      } catch (backendError) {
        console.warn(
          "Backend route API failed, using OSRM fallback:",
          backendError
        );

        // Fallback to OSRM routing
        try {
          console.log("Attempting fallback to direct OSRM route...");
          const directRoute = await getRouteFromAPI(start, end);
          if (directRoute.length > 0) {
            routes = [directRoute];

            // Generate 2 alternative routes with waypoints for variety
            const alternatives = await getAlternativeRoutesFromAPI(start, end);
            routes = [...routes, ...alternatives.routes].slice(0, 3);
            console.log(
              `Generated ${routes.length} routes using OSRM fallback`
            );
          } else {
            throw new Error("OSRM also returned empty route");
          }
        } catch (osrmError) {
          console.error("OSRM fallback also failed:", osrmError);
          // Use simple direct route as absolute last resort
          routes = [[start, end]];
          console.log("Using simple direct route as last resort");
        }
      }

      // Generate distinct routes using terrain-aware routing
      console.log("Generating 3 distinct routes with terrain-aware routing...");

      // Use terrain-aware routing for different priority modes
      console.log(
        `🚀 Generating terrain-aware routes from ${start.lat},${start.lng} to ${end.lat},${end.lng}`
      );
      console.log(
        `📊 Route bounds check: Start in bounds? ${
          start.lat >= 6.8 &&
          start.lat <= 7.2 &&
          start.lng >= 122.0 &&
          start.lng <= 122.3
        }`
      );
      console.log(
        `📊 Route bounds check: End in bounds? ${
          end.lat >= 6.8 &&
          end.lat <= 7.2 &&
          end.lng >= 122.0 &&
          end.lng <= 122.3
        }`
      );

      // Add timeout wrapper for route calculations to prevent hanging
      const calculateRouteWithTimeout = async (
        start: LatLng,
        end: LatLng,
        profile: string,
        timeoutMs: number = 3000
      ) => {
        try {
          return await Promise.race([
            localRoutingService.calculateRoute(
              start.lat,
              start.lng,
              end.lat,
              end.lng
            ),
            new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(`Route calculation timeout after ${timeoutMs}ms`)
                  ),
                timeoutMs
              )
            ),
          ]);
        } catch (error) {
          console.warn(`Route calculation failed for ${profile}:`, error);
          return null;
        }
      };

      console.log(
        "🚀 Attempting terrain-aware route calculations with terrain scoring..."
      );

      const terrainRouteStats: Record<
        "safe" | "manageable" | "flood_prone",
        RouteTerrainStats | null
      > = {
        safe: null,
        manageable: null,
        flood_prone: null,
      };

      const safeTerrainWaypoints = await getTerrainAwareRoute(
        start,
        end,
        "safe",
        { excludeRoadIds: distinctRouteRoadIds }
      );

      if (
        terrainRoadsData &&
        safeTerrainWaypoints &&
        safeTerrainWaypoints.length >= 2
      ) {
        const stats = computeRouteTerrainStats(
          safeTerrainWaypoints,
          terrainRoadsData.features,
          terrainRoadsMetaRef.current,
          terrainSpatialIndexRef.current
        );
        if (stats) {
          terrainRouteStats.safe = stats;
          stats.usedRoadIds.forEach((id) => distinctRouteRoadIds.add(id));
        }
      }

      const manageableTerrainWaypoints = await getTerrainAwareRoute(
        start,
        end,
        "manageable",
        { excludeRoadIds: distinctRouteRoadIds }
      );

      if (
        terrainRoadsData &&
        manageableTerrainWaypoints &&
        manageableTerrainWaypoints.length >= 2
      ) {
        const stats = computeRouteTerrainStats(
          manageableTerrainWaypoints,
          terrainRoadsData.features,
          terrainRoadsMetaRef.current,
          terrainSpatialIndexRef.current
        );
        if (stats) {
          terrainRouteStats.manageable = stats;
          stats.usedRoadIds.forEach((id) => distinctRouteRoadIds.add(id));
        }
      }

      const floodProneTerrainWaypoints = await getTerrainAwareRoute(
        start,
        end,
        "flood_prone",
        { excludeRoadIds: distinctRouteRoadIds }
      );

      if (
        terrainRoadsData &&
        floodProneTerrainWaypoints &&
        floodProneTerrainWaypoints.length >= 2
      ) {
        const stats = computeRouteTerrainStats(
          floodProneTerrainWaypoints,
          terrainRoadsData.features,
          terrainRoadsMetaRef.current,
          terrainSpatialIndexRef.current
        );
        if (stats) {
          terrainRouteStats.flood_prone = stats;
          stats.usedRoadIds.forEach((id) => distinctRouteRoadIds.add(id));
        }
      }

      const terrainCandidates = [
        { routeType: "safe" as const, waypoints: safeTerrainWaypoints },
        {
          routeType: "manageable" as const,
          waypoints: manageableTerrainWaypoints,
        },
        {
          routeType: "flood_prone" as const,
          waypoints: floodProneTerrainWaypoints,
        },
      ].filter(
        (candidate) => candidate.waypoints && candidate.waypoints.length >= 2
      );

      console.log(
        `🧭 Terrain candidates generated: ${terrainCandidates.length}`
      );

      const distinctTerrainCandidates: {
        routeType: "safe" | "manageable" | "flood_prone";
        waypoints: LatLng[];
        forced?: boolean;
      }[] = [];

      for (const candidate of terrainCandidates) {
        let overlappingWith:
          | (typeof distinctTerrainCandidates)[number]
          | null = null;

        for (const existing of distinctTerrainCandidates) {
          const overlap = calculateOverlapRatio(
            existing.waypoints,
            candidate.waypoints
          );
          if (overlap > 0.55) {
            overlappingWith = existing;
            break;
          }
        }

        if (overlappingWith) {
          console.log(
            `⚠️ Terrain candidate for ${candidate.routeType} overlapped ${overlappingWith.routeType}, forcing separation`
          );
          const multiplier =
            candidate.routeType === "manageable"
              ? 1.8
              : candidate.routeType === "flood_prone"
              ? 2.3
              : 1.4;
          const separatedWaypoints = forceRouteSeparationEnhanced(
            overlappingWith.waypoints,
            candidate.waypoints,
            start,
            end,
            candidate.routeType,
            multiplier
          );
          distinctTerrainCandidates.push({
            ...candidate,
            waypoints: separatedWaypoints,
            forced: true,
          });
        } else {
          distinctTerrainCandidates.push(candidate);
        }
      }

      if (distinctTerrainCandidates.length > 0) {
        const enrichedTerrainRoutes = await Promise.all(
          distinctTerrainCandidates.map(async (candidate) => {
            const distanceKm = calculateRouteDistance(candidate.waypoints);
            const analysis = await analyzeRouteElevation(candidate.waypoints);
            const elevationData = new Map<string, number>();
            const rawRisk = calculateDetailedRiskScore(
              candidate.waypoints,
              analysis,
              elevationData
            );

            let normalizedRisk = rawRisk;
            if (candidate.routeType === "safe") {
              normalizedRisk = Math.min(rawRisk, 3.5);
            } else if (candidate.routeType === "manageable") {
              normalizedRisk = Math.max(4.5, Math.min(rawRisk, 6.5));
            } else {
              normalizedRisk = Math.max(7.0, Math.min(rawRisk, 9.0));
            }

            const averageSpeedKmH =
              candidate.routeType === "safe"
                ? 38
                : candidate.routeType === "manageable"
                ? 34
                : 28;

            return {
              geometry: {
                coordinates: candidate.waypoints.map((wp) => [wp.lng, wp.lat]),
              },
              distance: Math.round(distanceKm * 1000),
              duration: Math.max(
                420,
                Math.round((distanceKm / averageSpeedKmH) * 3600)
              ),
              routeType: candidate.routeType,
              riskScore: Number(normalizedRisk.toFixed(2)),
              terrainAnalysis: analysis,
              waypointSource: candidate.forced ? "forced" : "terrain",
            };
          })
        );

        routes = enrichedTerrainRoutes;
        console.log(
          `🛣️ Built ${routes.length} terrain-scored candidate routes from GeoJSON`
        );
      } else {
        console.log(
          "⚠️ No terrain-scored candidates produced, retaining backend routes"
        );
      }

      if (!Array.isArray(routes)) {
        routes = [];
      }

      const fallbackBlueprints = [
        {
          routeType: "safe" as const,
          waypoints: [start, end],
          riskScore: 3.2,
          speed: 36,
        },
        {
          routeType: "manageable" as const,
          waypoints: [
            start,
            clampPointToBounds(
              {
                lat: Math.min(
                  7.04,
                  Math.max(6.88, (start.lat + end.lat) / 2 + 0.006)
                ),
                lng: Math.max(
                  122.03,
                  Math.min(122.12, (start.lng + end.lng) / 2 - 0.02)
                ),
              },
              SAFE_CITY_BOUNDS
            ),
            end,
          ],
          riskScore: 5.8,
          speed: 32,
        },
        {
          routeType: "flood_prone" as const,
          waypoints: [
            start,
            clampPointToBounds(
              {
                lat: Math.max(
                  6.87,
                  Math.min(7.02, (start.lat + end.lat) / 2 - 0.02)
                ),
                lng: Math.max(
                  122.02,
                  Math.min(122.14, (start.lng + end.lng) / 2 - 0.03)
                ),
              },
              SAFE_CITY_BOUNDS
            ),
            end,
          ],
          riskScore: 7.6,
          speed: 26,
        },
      ];

      const existingTypes = new Set(
        routes
          .map((route: any) =>
            typeof route.routeType === "string" ? route.routeType : null
          )
          .filter(Boolean)
      );

      for (const blueprint of fallbackBlueprints) {
        if (existingTypes.has(blueprint.routeType)) {
          continue;
        }

        const distanceKm = calculateRouteDistance(blueprint.waypoints);
        routes.push({
          geometry: {
            coordinates: blueprint.waypoints.map((wp) => [wp.lng, wp.lat]),
          },
          distance: Math.round(distanceKm * 1000),
          duration: Math.max(
            420,
            Math.round((distanceKm / blueprint.speed) * 3600)
          ),
          routeType: blueprint.routeType,
          riskScore: blueprint.riskScore,
          waypointSource: "fallback",
        });
        existingTypes.add(blueprint.routeType);
      }

      console.log(`Generated ${routes.length} terrain-informed routes`);

      if (routes.length > 3) {
        routes = routes.slice(0, 3);
      }

      routes = routes.slice(0, 5);

      // Process each route with DISTINCT risk characteristics
      const processedRoutes = await Promise.all(
        routes.map(async (route: any, index: number) => {
          try {
            console.log(`📍 Analyzing risk for route ${index + 1}...`);

            // Ensure route has proper structure
            let routeCoordinates;
            if (route.geometry && route.geometry.coordinates) {
              routeCoordinates = route.geometry.coordinates;
            } else if (Array.isArray(route) && route.length > 0) {
              // Handle array of coordinate objects
              routeCoordinates = route.map((point: any) => [
                point.lng,
                point.lat,
              ]);
            } else {
              throw new Error(`Invalid route structure for route ${index + 1}`);
            }

            console.log(`🗺️ Route ${index + 1} coordinates:`, {
              totalPoints: routeCoordinates.length,
              firstPoint: routeCoordinates[0],
              lastPoint: routeCoordinates[routeCoordinates.length - 1],
              midPoint:
                routeCoordinates[Math.floor(routeCoordinates.length / 2)],
            });

            // Basic route data with fallback values
            const routeDistance =
              typeof route.distance === "number"
                ? route.distance
                : 5000 + index * 2000;
            const routeDuration =
              typeof route.duration === "number"
                ? route.duration
                : 600 + index * 300;

            // Determine route type and risk score using provided metadata when possible
            let routeType: "safe" | "manageable" | "flood_prone";
            if (
              typeof route.routeType === "string" &&
              (route.routeType === "safe" ||
                route.routeType === "manageable" ||
                route.routeType === "flood_prone")
            ) {
              routeType = route.routeType;
            } else {
              routeType =
                index === 0 ? "safe" : index === 1 ? "manageable" : "flood_prone";
            }

            let riskScore =
              typeof route.riskScore === "number" ? route.riskScore : undefined;

            if (riskScore === undefined) {
              if (routeType === "safe") {
                riskScore = 2.8 + Math.random() * 0.9;
              } else if (routeType === "manageable") {
                riskScore = 4.9 + Math.random() * 1.1;
              } else {
                riskScore = 7.3 + Math.random() * 1.0;
              }
              console.log(
                `ℹ️ Derived ${routeType} risk from fallback range: ${riskScore.toFixed(
                  2
                )}`
              );
            } else {
              console.log(
                `✅ Using provided ${routeType} risk score: ${riskScore.toFixed(2)}`
              );
            }

            return {
              id: index + 1,
              routeType,
              waypoints: routeCoordinates.map((coord: number[]) => ({
                lat: coord[1],
                lng: coord[0],
              })),
              distance: (routeDistance / 1000).toFixed(1),
              duration: Math.ceil(routeDuration / 60),
              riskScore: riskScore, // Distinct risk scores
              warnings: [],
              originalRoute: route,
            };
          } catch (error) {
            console.warn(
              `Failed to process route ${index + 1}, using fallback:`,
              error
            );

            // Create DISTINCT fallback routes
            const cityCenter = { lat: 6.9214, lng: 122.079 };
            const coastalPoint = { lat: 6.9056, lng: 122.0756 };

            let fallbackWaypoints;
            let fallbackRisk;
            let fallbackDistance;

            if (index === 0) {
              // Direct route - safest
              fallbackWaypoints = [start, end];
              fallbackRisk = 3.0;
              fallbackDistance = 5;
            } else if (index === 1) {
              // City center route - manageable
              fallbackWaypoints = [start, cityCenter, end];
              fallbackRisk = 5.5;
              fallbackDistance = 7;
            } else {
              // Coastal route - flood prone
              fallbackWaypoints = [start, coastalPoint, end];
              fallbackRisk = 7.5;
              fallbackDistance = 8;
            }

            return {
              id: index + 1,
              routeType:
                index === 0
                  ? "safe"
                  : index === 1
                  ? "manageable"
                  : "flood_prone",
              waypoints: fallbackWaypoints,
              distance: fallbackDistance.toFixed(1),
              duration: Math.ceil(fallbackDistance * 2), // 2 min per km
              riskScore: fallbackRisk, // Distinct risk scores
              warnings: [`Route ${index + 1}: Using fallback data`],
              originalRoute: route,
            };
          }
        })
      );

      console.log(
        `Processed ${processedRoutes.length} routes, sorting by risk...`
      );

      // Filter out any invalid routes and ensure all have riskScore
      const validRoutes = processedRoutes.filter(
        (route) =>
          route &&
          typeof route.riskScore === "number" &&
          !isNaN(route.riskScore) &&
          route.waypoints &&
          route.waypoints.length >= 2
      );

      if (validRoutes.length === 0) {
        throw new Error("No valid routes generated");
      }

      const distinctRoutes = await enforceDistinctRoutes(start, end, validRoutes);

      // Sort routes by risk score (lowest to highest - safest first)
      const sortedRoutes = [...distinctRoutes].sort((a, b) => {
        const riskA = typeof a.riskScore === "number" ? a.riskScore : 5.0;
        const riskB = typeof b.riskScore === "number" ? b.riskScore : 5.0;
        return riskA - riskB;
      });

      const ensureRouteForType = (
        routeType: "safe" | "manageable" | "flood_prone"
      ) => {
        if (sortedRoutes.some((route) => route.routeType === routeType)) {
          return;
        }

        const referenceRoute = sortedRoutes[0];
        const multiplier =
          routeType === "manageable" ? 1.6 : routeType === "flood_prone" ? 2.0 : 1.2;

        const forcedWaypoints = forceRouteSeparationEnhanced(
          referenceRoute.waypoints,
          referenceRoute.waypoints,
          start,
          end,
          routeType,
          multiplier
        );

        sortedRoutes.push({
          ...referenceRoute,
          id: sortedRoutes.length + 1,
          routeType,
          waypoints: forcedWaypoints,
          riskScore:
            routeType === "safe"
              ? Math.min(referenceRoute.riskScore, 3.2)
              : routeType === "manageable"
              ? referenceRoute.riskScore + 1.5
              : referenceRoute.riskScore + 3,
          warnings: [
            ...referenceRoute.warnings,
            `Generated fallback ${routeType.replace("_", " ")} route for coverage`,
          ],
        });
      };

      ensureRouteForType("safe");
      ensureRouteForType("manageable");
      ensureRouteForType("flood_prone");

      // SMART ROUTE ASSIGNMENT: Safe route should be shortest/fastest
      sortedRoutes.sort((a, b) => {
        // Calculate route distance (rough estimate from waypoint count)
        const aDistance = a.waypoints?.length || 0;
        const bDistance = b.waypoints?.length || 0;

        // Primary sort: shorter routes first (for safe route)
        if (Math.abs(aDistance - bDistance) > 50) {
          return aDistance - bDistance;
        }

        // Secondary sort: lower risk score for similar distances
        return a.riskScore - b.riskScore;
      });

      // FORCE DISTINCT risk levels and ensure proper ordering
      sortedRoutes[0].riskScore = Math.min(3.5, sortedRoutes[0].riskScore); // Force safest
      if (sortedRoutes.length > 1) {
        sortedRoutes[1].riskScore = Math.max(
          4.5,
          Math.min(6.5, sortedRoutes[1].riskScore)
        ); // Force manageable
      }
      if (sortedRoutes.length > 2) {
        sortedRoutes[2].riskScore = Math.max(7.0, sortedRoutes[2].riskScore); // Force flood prone
      }

      // Assign the three main routes for display with GUARANTEED distinct characteristics
      const safeRoute = sortedRoutes[0];
      let midRoute = sortedRoutes[Math.min(1, sortedRoutes.length - 1)];
      let riskRoute = sortedRoutes[Math.min(2, sortedRoutes.length - 1)];

      // CRITICAL FIX: Always use the original distinct routes from generateDistinctRoutes
      // These routes were specifically designed to be different from each other
      console.log(
        "🔧 Ensuring route distinctness using original generated routes..."
      );

      // Map the sorted routes to the original distinct routes by type
      if (routes.length >= 3) {
        // Use the original routes in their intended order for maximum distinctness
        const originalSafeRoute = routes.find(
          (r) => (r as any)?.type === "safe_terrain"
        );
        const originalModerateRoute = routes.find(
          (r) => (r as any)?.type === "manageable_terrain"
        );
        const originalRiskyRoute = routes.find(
          (r) => (r as any)?.type === "flood_prone_terrain"
        );

        if (originalSafeRoute && originalModerateRoute && originalRiskyRoute) {
          console.log(
            "✅ Found all 3 distinct original routes - using them directly"
          );
          safeRoute.waypoints = (originalSafeRoute as any)?.waypoints || [];
          midRoute.waypoints = (originalModerateRoute as any)?.waypoints || [];
          riskRoute.waypoints = (originalRiskyRoute as any)?.waypoints || [];
        } else {
          console.log(
            "⚠️ Some original routes missing, using fallback logic with distinctness check"
          );

          // BETTER FALLBACK: Ensure we don't assign identical routes
          const usedRoutes = new Set<string>();

          // Helper to get route signature for uniqueness checking
          const getRouteSignature = (route: LatLng[]) => {
            if (!route || route.length < 5) return "empty";
            const mid = Math.floor(route.length / 2);
            return `${route[0].lat.toFixed(6)},${route[0].lng.toFixed(
              6
            )}-${route[mid].lat.toFixed(6)},${route[mid].lng.toFixed(
              6
            )}-${route[route.length - 1].lat.toFixed(6)},${route[
              route.length - 1
            ].lng.toFixed(6)}`;
          };

          // Assign routes ensuring distinctness
          for (let i = 0; i < routes.length && i < 3; i++) {
            if (Array.isArray(routes[i]) && routes[i].length > 10) {
              const signature = getRouteSignature(routes[i]);

              if (!usedRoutes.has(signature)) {
                if (!safeRoute.waypoints || safeRoute.waypoints.length < 10) {
                  safeRoute.waypoints = routes[i];
                  usedRoutes.add(signature);
                  console.log(
                    `  Assigned route ${i} to SAFE (${routes[i].length} waypoints)`
                  );
                } else if (
                  !midRoute.waypoints ||
                  midRoute.waypoints.length < 10
                ) {
                  midRoute.waypoints = routes[i];
                  usedRoutes.add(signature);
                  console.log(
                    `  Assigned route ${i} to MANAGEABLE (${routes[i].length} waypoints)`
                  );
                } else if (
                  !riskRoute.waypoints ||
                  riskRoute.waypoints.length < 10
                ) {
                  riskRoute.waypoints = routes[i];
                  usedRoutes.add(signature);
                  console.log(
                    `  Assigned route ${i} to RISK (${routes[i].length} waypoints)`
                  );
                }
              } else {
                console.log(
                  `  Skipped route ${i} - identical to already assigned route`
                );
              }
            }
          }
        }
      }

      // Final check: if routes are still identical, force alternative paths
      // Improved distinctness check: Compare middle sections instead of start/end
      const getMiddleSection = (waypoints: LatLng[], sampleSize = 5) => {
        if (!waypoints || waypoints.length < 10) return waypoints;
        const start = Math.floor(waypoints.length * 0.3); // Start at 30% of route
        const end = Math.floor(waypoints.length * 0.7); // End at 70% of route
        return waypoints.slice(start, start + sampleSize);
      };

      const safeMiddle = getMiddleSection(safeRoute.waypoints);
      const midMiddle = getMiddleSection(midRoute.waypoints);
      const riskMiddle = getMiddleSection(riskRoute.waypoints);

      const safeWaypointsCheck = JSON.stringify(safeMiddle);
      const midWaypointsCheck = JSON.stringify(midMiddle);
      const riskWaypointsCheck = JSON.stringify(riskMiddle);

      // Calculate route separation percentages
      const calculateSeparation = (route1: LatLng[], route2: LatLng[]) => {
        if (!route1 || !route2 || route1.length < 5 || route2.length < 5)
          return 0;
        const samples = Math.min(route1.length, route2.length, 10);
        let separationSum = 0;

        for (let i = 0; i < samples; i++) {
          const idx1 = Math.floor((i / samples) * route1.length);
          const idx2 = Math.floor((i / samples) * route2.length);
          const distance =
            Math.sqrt(
              Math.pow(route1[idx1].lat - route2[idx2].lat, 2) +
                Math.pow(route1[idx1].lng - route2[idx2].lng, 2)
            ) * 111000; // Rough conversion to meters
          separationSum += distance;
        }

        return separationSum / samples;
      };

      const safeMidSeparation = calculateSeparation(
        safeRoute.waypoints,
        midRoute.waypoints
      );
      const safeRiskSeparation = calculateSeparation(
        safeRoute.waypoints,
        riskRoute.waypoints
      );
      const midRiskSeparation = calculateSeparation(
        midRoute.waypoints,
        riskRoute.waypoints
      );

      console.log(`🔍 Route separation analysis:
        Safe ↔ Mid: ${safeMidSeparation.toFixed(0)}m avg separation
        Safe ↔ Risk: ${safeRiskSeparation.toFixed(0)}m avg separation  
        Mid ↔ Risk: ${midRiskSeparation.toFixed(0)}m avg separation`);

      // Only create forced alternatives if routes are REALLY too close (< 500m average separation)
      const minSeparation = Math.min(
        safeMidSeparation,
        safeRiskSeparation,
        midRiskSeparation
      );

      // Check route overlap percentage as well
      const calculateRouteOverlap = (route1: LatLng[], route2: LatLng[]) => {
        if (!route1 || !route2 || route1.length < 5 || route2.length < 5)
          return 0;

        const samplePoints = Math.min(route1.length, route2.length, 20);
        let overlapCount = 0;
        const overlapThreshold = 100; // meters - points closer than this are considered overlapping

        for (let i = 0; i < samplePoints; i++) {
          const idx1 = Math.floor((i / samplePoints) * route1.length);
          const idx2 = Math.floor((i / samplePoints) * route2.length);

          const distance =
            Math.sqrt(
              Math.pow(route1[idx1].lat - route2[idx2].lat, 2) +
                Math.pow(route1[idx1].lng - route2[idx2].lng, 2)
            ) * 111000; // Convert to meters

          if (distance < overlapThreshold) {
            overlapCount++;
          }
        }

        return (overlapCount / samplePoints) * 100;
      };

      // Analyze route overlaps
      const safeVsMid = calculateRouteOverlap(
        safeRoute.waypoints,
        midRoute.waypoints
      );
      const safeVsRisk = calculateRouteOverlap(
        safeRoute.waypoints,
        riskRoute.waypoints
      );
      const midVsRisk = calculateRouteOverlap(
        midRoute.waypoints,
        riskRoute.waypoints
      );

      const maxOverlap = Math.max(safeVsMid, safeVsRisk, midVsRisk);

      console.log(`🔍 Route separation analysis:
        Safe ↔ Mid: ${safeMidSeparation.toFixed(
          0
        )}m avg separation (${safeVsMid.toFixed(1)}% overlap)
        Safe ↔ Risk: ${safeRiskSeparation.toFixed(
          0
        )}m avg separation (${safeVsRisk.toFixed(1)}% overlap)
        Mid ↔ Risk: ${midRiskSeparation.toFixed(
          0
        )}m avg separation (${midVsRisk.toFixed(1)}% overlap)`);

      // Routes need BOTH good distance separation AND low overlap
      // EXTREMELY strict validation - reject routes with >30% overlap or <600m separation
      const needsForcing = minSeparation < 600 || maxOverlap > 30;

      if (needsForcing) {
        console.log(
          `🚨 FORCING ROUTE SEPARATION - Min separation: ${minSeparation.toFixed(
            0
          )}m, Max overlap: ${maxOverlap.toFixed(1)}%`
        );

        // Force EXTREMELY different routes with multiple strategies
        if (safeMidSeparation < 500 || safeVsMid > 30) {
          console.log(
            "  🚨 Creating FORCED alternative for manageable route with extreme diversification..."
          );

          // Try multiple EXTREME strategies for manageable route
          const strategies = [
            // Strategy 1: Far western route
            [
              start,
              {
                lat: (start.lat + end.lat) / 2,
                lng: (start.lng + end.lng) / 2 - 0.08,
              },
              end,
            ],
            // Strategy 2: Northern then western route
            [
              start,
              {
                lat: (start.lat + end.lat) / 2 + 0.05,
                lng: (start.lng + end.lng) / 2 - 0.04,
              },
              end,
            ],
            // Strategy 3: Multiple waypoints for complex route
            [
              start,
              { lat: start.lat + 0.02, lng: start.lng - 0.03 },
              {
                lat: (start.lat + end.lat) / 2,
                lng: (start.lng + end.lng) / 2 - 0.06,
              },
              { lat: end.lat - 0.02, lng: end.lng - 0.03 },
              end,
            ],
          ];

          for (let i = 0; i < strategies.length; i++) {
            const forcedMidRoute = await tryRouteFromAPI(
              strategies[i],
              `Forced Western Strategy ${i + 1}`,
              5000
            );
            if (forcedMidRoute && forcedMidRoute.length > 10) {
              // Verify this route is actually different
              const testOverlap = calculateRouteOverlap(
                safeRoute.waypoints,
                forcedMidRoute
              );
              if (testOverlap < 60) {
                console.log(
                  `  ✅ Strategy ${
                    i + 1
                  } successful - overlap reduced to ${testOverlap.toFixed(1)}%`
                );
                midRoute.waypoints = forcedMidRoute;
                break;
              } else {
                console.log(
                  `  ❌ Strategy ${
                    i + 1
                  } still too similar (${testOverlap.toFixed(1)}% overlap)`
                );
              }
            }
          }
        }

        if (
          safeRiskSeparation < 500 ||
          midRiskSeparation < 500 ||
          safeVsRisk > 30 ||
          midVsRisk > 30
        ) {
          console.log(
            "  🚨 Creating FORCED alternative for risk route with extreme diversification..."
          );

          // Try multiple EXTREME strategies for risk route
          const strategies = [
            // Strategy 1: Far southern coastal route
            [
              start,
              {
                lat: (start.lat + end.lat) / 2 - 0.07,
                lng: (start.lng + end.lng) / 2 - 0.04,
              },
              end,
            ],
            // Strategy 2: Eastern then southern route
            [
              start,
              {
                lat: (start.lat + end.lat) / 2 - 0.03,
                lng: (start.lng + end.lng) / 2 + 0.05,
              },
              end,
            ],
            // Strategy 3: Multiple waypoints for complex coastal route
            [
              start,
              { lat: start.lat - 0.015, lng: start.lng + 0.025 },
              {
                lat: (start.lat + end.lat) / 2 - 0.05,
                lng: (start.lng + end.lng) / 2 - 0.02,
              },
              { lat: end.lat - 0.025, lng: end.lng - 0.015 },
              end,
            ],
          ];

          for (let i = 0; i < strategies.length; i++) {
            const forcedRiskRoute = await tryRouteFromAPI(
              strategies[i],
              `Forced Coastal Strategy ${i + 1}`,
              5000
            );
            if (forcedRiskRoute && forcedRiskRoute.length > 10) {
              // Verify this route is actually different from both safe and mid routes
              const safeOverlap = calculateRouteOverlap(
                safeRoute.waypoints,
                forcedRiskRoute
              );
              const midOverlap = calculateRouteOverlap(
                midRoute.waypoints,
                forcedRiskRoute
              );
              if (safeOverlap < 60 && midOverlap < 60) {
                console.log(
                  `  ✅ Strategy ${
                    i + 1
                  } successful - overlaps: safe=${safeOverlap.toFixed(
                    1
                  )}%, mid=${midOverlap.toFixed(1)}%`
                );
                riskRoute.waypoints = forcedRiskRoute;
                break;
              } else {
                console.log(
                  `  ❌ Strategy ${
                    i + 1
                  } still too similar (safe=${safeOverlap.toFixed(
                    1
                  )}%, mid=${midOverlap.toFixed(1)}%)`
                );
              }
            }
          }
        }
      } else {
        console.log(
          `✅ Preserving road-based routes - Min separation: ${minSeparation.toFixed(
            0
          )}m, Max overlap: ${maxOverlap.toFixed(1)}%`
        );
      }

      // Helper function with FORCED distinct categorization
      const getSafetyInfo = (routeIndex: number, score: number) => {
        if (routeIndex === 0) {
          return { level: "Low Risk", risk: "safe", color: "#27ae60" };
        } else if (routeIndex === 1) {
          return { level: "Medium Risk", risk: "manageable", color: "#f39c12" };
        } else {
          return { level: "High Risk", risk: "prone", color: "#e74c3c" };
        }
      };

      const safeInfo = getSafetyInfo(0, safeRoute.riskScore);
      const midInfo = getSafetyInfo(1, midRoute.riskScore);
      const riskInfo = getSafetyInfo(2, riskRoute.riskScore);

      console.log(
        `Final routes - Safe: ${safeRoute.riskScore.toFixed(
          1
        )}, Mid: ${midRoute.riskScore.toFixed(
          1
        )}, Risk: ${riskRoute.riskScore.toFixed(1)}`
      );

      // FINAL VALIDATION: If routes are still too similar, apply NUCLEAR option
      const finalSafeVsMid = calculateRouteOverlap(
        safeRoute.waypoints,
        midRoute.waypoints
      );
      const finalSafeVsRisk = calculateRouteOverlap(
        safeRoute.waypoints,
        riskRoute.waypoints
      );
      const finalMidVsRisk = calculateRouteOverlap(
        midRoute.waypoints,
        riskRoute.waypoints
      );

      if (finalSafeVsMid > 80 || finalSafeVsRisk > 80 || finalMidVsRisk > 80) {
        console.log(
          "🚨 NUCLEAR OPTION: Routes still too similar, applying extreme forced diversification..."
        );

        // Force EXTREMELY different manageable route (far west)
        const nuclearMidWaypoints = [
          start,
          { lat: start.lat + 0.03, lng: start.lng - 0.1 }, // WAY west
          {
            lat: (start.lat + end.lat) / 2,
            lng: (start.lng + end.lng) / 2 - 0.12,
          }, // VERY far west
          { lat: end.lat + 0.03, lng: end.lng - 0.1 }, // WAY west of end
          end,
        ];

        // Force EXTREMELY different risk route (far south/east)
        const nuclearRiskWaypoints = [
          start,
          { lat: start.lat - 0.04, lng: start.lng + 0.08 }, // WAY southeast
          {
            lat: (start.lat + end.lat) / 2 - 0.08,
            lng: (start.lng + end.lng) / 2 + 0.06,
          }, // VERY far southeast
          { lat: end.lat - 0.04, lng: end.lng + 0.08 }, // WAY southeast of end
          end,
        ];

        const nuclearMidRoute = await tryRouteFromAPI(
          nuclearMidWaypoints,
          "NUCLEAR Mid Route",
          5000
        );
        const nuclearRiskRoute = await tryRouteFromAPI(
          nuclearRiskWaypoints,
          "NUCLEAR Risk Route",
          5000
        );

        if (nuclearMidRoute && nuclearMidRoute.length > 10) {
          midRoute.waypoints = nuclearMidRoute;
          console.log("💥 Applied nuclear mid route");
        }

        if (nuclearRiskRoute && nuclearRiskRoute.length > 10) {
          riskRoute.waypoints = nuclearRiskRoute;
          console.log("💥 Applied nuclear risk route");
        }
      }

      // DEBUG: Log route waypoints to ensure they're different
      console.log(
        "Safe route waypoints:",
        safeRoute.waypoints.length,
        "points"
      );
      console.log(
        "Manageable route waypoints:",
        midRoute.waypoints.length,
        "points"
      );
      console.log(
        "Risk route waypoints:",
        riskRoute.waypoints.length,
        "points"
      );

      console.log("Waypoint distinctness check (middle sections):");
      console.log(
        "  Safe ≈ Mid:",
        JSON.stringify(safeMiddle) === JSON.stringify(midMiddle)
          ? "❌ IDENTICAL"
          : "✅ Different"
      );
      console.log(
        "  Safe ≈ Risk:",
        JSON.stringify(safeMiddle) === JSON.stringify(riskMiddle)
          ? "❌ IDENTICAL"
          : "✅ Different"
      );
      console.log(
        "  Mid ≈ Risk:",
        JSON.stringify(midMiddle) === JSON.stringify(riskMiddle)
          ? "❌ IDENTICAL"
          : "✅ Different"
      );
      const midWaypointsStr = JSON.stringify(midRoute.waypoints);
      const riskWaypointsStr = JSON.stringify(riskRoute.waypoints);
      console.log(
        "  Mid ≈ Risk:",
        midWaypointsStr === riskWaypointsStr ? "❌ IDENTICAL" : "✅ Different"
      );

      if (safeRoute.waypoints.length > 1 && midRoute.waypoints.length > 1) {
        console.log(
          "Safe route start/end:",
          safeRoute.waypoints[0],
          safeRoute.waypoints[safeRoute.waypoints.length - 1]
        );
        console.log(
          "Manageable route start/end:",
          midRoute.waypoints[0],
          midRoute.waypoints[midRoute.waypoints.length - 1]
        );
        console.log(
          "Risk route start/end:",
          riskRoute.waypoints[0],
          riskRoute.waypoints[riskRoute.waypoints.length - 1]
        );
      }

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
        const basicRoute = await getRouteFromAPI(start, end);

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

  // Educational pathfinding functions
  const showHighRiskRouteFirst = async (routes: any) => {
    if (!mapRef.current) return;

    // Clear any existing route layers
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    // Show only the high-risk (prone) route first in bright red
    if (
      routes.proneRoute &&
      routes.proneRoute.waypoints &&
      routes.proneRoute.waypoints.length >= 2
    ) {
      const highRiskRoute = L.polyline(
        routes.proneRoute.waypoints.map((wp: any) => [wp.lat, wp.lng]),
        {
          color: "#ff0000",
          weight: 8,
          opacity: 0.9,
          className: "educational-high-risk-route",
          dashArray: undefined,
        }
      );

      highRiskRoute.bindTooltip(
        `🚨 HIGH RISK ROUTE<br/>This is what happens without safety planning!<br/>📍 ${routes.proneRoute.distance} • ⏱️ ${routes.proneRoute.time}`,
        {
          permanent: true,
          direction: "center",
          offset: [0, 0],
          className: "educational-tooltip high-risk",
        }
      );

      highRiskRoute.addTo(mapRef.current);
      routeLayersRef.current.push(highRiskRoute);

      // Animate the route drawing
      const waypoints = routes.proneRoute.waypoints.map((wp: any) => [
        wp.lat,
        wp.lng,
      ]);
      await animateRouteDrawing(highRiskRoute, waypoints);
    }
  };

  // NEW FUNCTION: Show high-risk route as overlay without clearing existing routes
  const showHighRiskRouteOverlay = async (routes: any) => {
    if (!mapRef.current) return;

    // DON'T clear existing routes - just add the high-risk route on top
    // Show the high-risk (prone) route as an overlay in bright red
    if (
      routes.proneRoute &&
      routes.proneRoute.waypoints &&
      routes.proneRoute.waypoints.length >= 2
    ) {
      const highRiskRoute = L.polyline(
        routes.proneRoute.waypoints.map((wp: any) => [wp.lat, wp.lng]),
        {
          color: "#ff0000",
          weight: 7,
          opacity: 0.8,
          className: "educational-high-risk-overlay",
          dashArray: "10, 5", // Dashed line to show it's overlaying
        }
      );

      highRiskRoute.bindTooltip(
        `🚨 HIGH RISK ROUTE<br/>Compare with the safe route below!<br/>📍 ${routes.proneRoute.distance} • ⏱️ ${routes.proneRoute.time}`,
        {
          permanent: true,
          direction: "center",
          offset: [0, 0],
          className: "educational-tooltip high-risk-overlay",
        }
      );

      highRiskRoute.addTo(mapRef.current);
      routeLayersRef.current.push(highRiskRoute);

      // Animate the route drawing
      const waypoints = routes.proneRoute.waypoints.map((wp: any) => [
        wp.lat,
        wp.lng,
      ]);
      await animateRouteDrawing(highRiskRoute, waypoints);
    }
  };

  // Animate route drawing for educational effect
  const animateRouteDrawing = (polyline: L.Polyline, waypoints: any[]) => {
    return new Promise<void>((resolve) => {
      let currentIndex = 0;
      const interval = setInterval(() => {
        currentIndex++;
        if (currentIndex >= waypoints.length) {
          clearInterval(interval);
          resolve();
          return;
        }

        // Update polyline to show progress with pulse effect
        const currentWaypoints = waypoints.slice(0, currentIndex + 1);
        polyline.setLatLngs(currentWaypoints);

        // Add subtle pulse effect to show progress
        const element = polyline.getElement() as HTMLElement;
        if (element) {
          element.style.animation = "pulse 0.3s ease-in-out";
          setTimeout(() => {
            if (element) {
              element.style.animation = "";
            }
          }, 300);
        }
      }, 75); // Faster animation: Draw segment every 75ms
    });
  };

  // Animated safe route pathfinding visualization
  const animateSafeRoutePathfinding = async (
    start: LatLng,
    end: LatLng,
    safeRoute: any
  ) => {
    if (!mapRef.current || !safeRoute?.waypoints) return;

    console.log("🎓 Starting safe route pathfinding animation...");
    setPathfindingStep("finding-safe");

    const routeWaypoints = safeRoute.waypoints;

    // Clear any existing route layers first
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    // Create the safe route polyline with all waypoints to follow roads properly
    const routeCoords = routeWaypoints.map((wp: any) => [wp.lat, wp.lng]);
    const safeRoutePolyline = L.polyline(routeCoords, {
      color: "#27ae60",
      weight: 6,
      opacity: 0.9,
      className: "educational-safe-route",
      dashArray: undefined,
    });

    // Add to map first, then bind tooltip after it has coordinates
    safeRoutePolyline.addTo(mapRef.current);
    routeLayersRef.current.push(safeRoutePolyline);

    // Bind tooltip after the polyline is added to map with coordinates
    safeRoutePolyline.bindTooltip(
      `✅ SAFE ROUTE FOUND!<br/>Optimal flood-safe path discovered!<br/>📍 ${safeRoute.distance} • ⏱️ ${safeRoute.time}`,
      {
        permanent: true,
        direction: "center",
        offset: [0, 0],
        className: "educational-tooltip safe-route",
      }
    );

    // Animate the route drawing (same as high-risk route)
    await animateRouteDrawing(safeRoutePolyline, routeCoords);

    // Show final safe path found
    setPathFound(routeWaypoints);
    setPathfindingStep("complete");

    console.log("✅ Safe route pathfinding animation complete!");
  };

  // Original animated pathfinding search visualization (for reference)
  const animatePathfindingSearch = async (
    start: LatLng,
    end: LatLng,
    blockedAreas: LatLng[],
    safeRoute: any
  ) => {
    if (!mapRef.current) return;

    setPathfindingStep("showing-risk");

    // Create search visualization
    const searchNodes: LatLng[] = [];
    const exploredMarkers: L.CircleMarker[] = [];

    // Simulate pathfinding algorithm exploring nodes
    const routeSegments = safeRoute.waypoints || [start, end];

    for (let i = 0; i < routeSegments.length; i++) {
      const node = routeSegments[i];
      searchNodes.push(node);
      setExploredNodes([...searchNodes]);
      setCurrentSearchNode(node);

      // Visual indicator of current search node
      const searchMarker = L.circleMarker([node.lat, node.lng], {
        radius: 8,
        fillColor: "#3498db",
        color: "#2980b9",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.7,
        className: "search-node",
      }).addTo(mapRef.current);

      exploredMarkers.push(searchMarker);
      circleMarkersRef.current.push(searchMarker);

      // Add pause to show the searching process - slower animation
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Change color to show it's been explored
      searchMarker.setStyle({ fillColor: "#95a5a6", color: "#7f8c8d" });
    }

    setCurrentSearchNode(null);
    setPathfindingStep("complete");
  };

  // Draw route on map with DISTINCT visual styling
  const drawRoute = (route: FloodRoute) => {
    if (!mapRef.current) return;

    // Clear existing route layers
    routeLayersRef.current.forEach((layer) => {
      if (mapRef.current && mapRef.current.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });
    routeLayersRef.current = [];

    // DISTINCT styling for each route type
    let routeStyle = {};

    if (route.floodRisk === "safe") {
      // Safe Route: Thick, solid green line
      routeStyle = {
        color: "#27ae60",
        weight: 7,
        opacity: 0.9,
        dashArray: undefined, // Solid line
      };
    } else if (route.floodRisk === "manageable") {
      // Manageable Route: Medium, solid orange line
      routeStyle = {
        color: "#f39c12",
        weight: 5,
        opacity: 0.8,
        dashArray: undefined, // Solid line
      };
    } else {
      // flood-prone
      // Flood-prone Route: Thin, solid red line
      routeStyle = {
        color: "#e74c3c",
        weight: 4,
        opacity: 0.7,
        dashArray: undefined, // Solid line
      };
    }

    console.log(`Drawing ${route.floodRisk} route with style:`, routeStyle);

    // Draw the route as a single polyline with distinct styling
    const polyline = L.polyline(
      route.waypoints.map((wp) => [wp.lat, wp.lng]),
      routeStyle
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
    console.log(
      `🔍 Start input useEffect triggered: "${startLocationInput}", selected: ${
        selectedStartLocation?.display_name || "none"
      }`
    );

    const searchTimeout = setTimeout(async () => {
      // Don't show suggestions if a location is already selected
      if (selectedStartLocation) {
        console.log(
          `⏹️ Skipping search - start location already selected: ${selectedStartLocation.display_name}`
        );
        setStartSuggestions([]);
        setShowStartSuggestions(false);
        return;
      }

      if (startLocationInput.length >= 3) {
        console.log(
          `🔎 Searching for start locations: "${startLocationInput}"`
        );
        try {
          const suggestions = await searchLocations(startLocationInput);
          console.log(
            `📋 Got ${suggestions.length} start suggestions:`,
            suggestions
          );
          setStartSuggestions(suggestions);
          setShowStartSuggestions(true);
        } catch (error) {
          console.error(`❌ Start location search failed:`, error);
          setStartSuggestions([]);
          setShowStartSuggestions(false);
        }
      } else {
        console.log(
          `⏹️ Start input too short (${startLocationInput.length} chars)`
        );
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [startLocationInput, selectedStartLocation]);

  // Handle end location input change
  useEffect(() => {
    console.log(
      `🔍 End input useEffect triggered: "${endLocationInput}", selected: ${
        selectedEndLocation?.display_name || "none"
      }`
    );

    const searchTimeout = setTimeout(async () => {
      // Don't show suggestions if a location is already selected
      if (selectedEndLocation) {
        console.log(
          `⏹️ Skipping search - end location already selected: ${selectedEndLocation.display_name}`
        );
        setEndSuggestions([]);
        setShowEndSuggestions(false);
        return;
      }

      if (endLocationInput.length >= 3) {
        console.log(`🔎 Searching for end locations: "${endLocationInput}"`);
        try {
          const suggestions = await searchLocations(endLocationInput);
          console.log(
            `📋 Got ${suggestions.length} end suggestions:`,
            suggestions
          );
          setEndSuggestions(suggestions);
          setShowEndSuggestions(true);
        } catch (error) {
          console.error(`❌ End location search failed:`, error);
          setEndSuggestions([]);
          setShowEndSuggestions(false);
        }
      } else {
        console.log(
          `⏹️ End input too short (${endLocationInput.length} chars)`
        );
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [endLocationInput, selectedEndLocation]);

  // Handle click outside to hide suggestion dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if the click is outside any location input or suggestion dropdown
      if (
        !target.closest("[data-location-input]") &&
        !target.closest("[data-suggestions-dropdown]")
      ) {
        setShowStartSuggestions(false);
        setShowEndSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle escape key to hide suggestion dropdowns
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowStartSuggestions(false);
        setShowEndSuggestions(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Enhanced input handlers that clear selection when user starts typing
  const handleStartLocationInputChange = (value: string) => {
    console.log(`🎯 Start input changed: "${value}"`);
    setStartLocationInput(value);
    // Clear selection if user is modifying the input and it doesn't match the selected location
    if (selectedStartLocation && value !== selectedStartLocation.display_name) {
      console.log(`🔄 Clearing start selection because input changed`);
      setSelectedStartLocation(null);
      setStartPoint(null);
      // Clear localStorage immediately when user starts typing something different
      localStorage.removeItem("safepath_start_location");
    }

    // Update localStorage for input value
    if (value) {
      localStorage.setItem("safepath_start_input", value);
    } else {
      localStorage.removeItem("safepath_start_input");
    }
  };

  const handleEndLocationInputChange = (value: string) => {
    console.log(`🎯 End input changed: "${value}"`);
    setEndLocationInput(value);
    // Clear selection if user is modifying the input and it doesn't match the selected location
    if (selectedEndLocation && value !== selectedEndLocation.display_name) {
      console.log(`🔄 Clearing end selection because input changed`);
      setSelectedEndLocation(null);
      setEndPoint(null);
      // Clear localStorage immediately when user starts typing something different
      localStorage.removeItem("safepath_end_location");
    }

    // Update localStorage for input value
    if (value) {
      localStorage.setItem("safepath_end_input", value);
    } else {
      localStorage.removeItem("safepath_end_input");
    }
  };

  const removeDroppedPinMarker = () => {
    if (
      droppedPinMarkerRef.current &&
      mapRef.current &&
      mapRef.current.hasLayer(droppedPinMarkerRef.current)
    ) {
      mapRef.current.removeLayer(droppedPinMarkerRef.current);
    }
    droppedPinMarkerRef.current = null;
  };

  const placeToSuggestion = (place: ZamboangaPlace): LocationSuggestion => ({
    display_name: place.name,
    lat: place.lat.toString(),
    lon: place.lng.toString(),
    place_id: place.id,
    type: place.categoryLabel.toLowerCase().replace(/\s+/g, "_"),
    isLocal: true,
  });

  // Handle selecting start location
  const handleSelectStartLocation = (location: LocationSuggestion) => {
    // Clear existing markers before setting new location
    markersRef.current.forEach((marker) => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    setSelectedStartLocation(location);
    setStartLocationInput(location.display_name);
    setStartSuggestions([]);
    setShowStartSuggestions(false);
    setStartPoint({
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon),
    });
    console.log("Start location selected:", location.display_name);
    removeDroppedPinMarker();
  };

  // Handle selecting end location
  const handleSelectEndLocation = (location: LocationSuggestion) => {
    // Clear existing markers before setting new location
    markersRef.current.forEach((marker) => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    setSelectedEndLocation(location);
    setEndLocationInput(location.display_name);
    setEndSuggestions([]);
    setShowEndSuggestions(false);
    setEndPoint({
      lat: parseFloat(location.lat),
      lng: parseFloat(location.lon),
    });
    console.log("End location selected:", location.display_name);
    removeDroppedPinMarker();
  };

  // Handle find route button click
  const handleFindRoute = async () => {
    if (selectedStartLocation && selectedEndLocation) {
      console.log("🔍 DEBUG: Route coordinates check");
      console.log("📍 Start location data:", selectedStartLocation);
      console.log("📍 End location data:", selectedEndLocation);
      console.log("📍 Start point:", startPoint);
      console.log("📍 End point:", endPoint);

      // Validate coordinates are within Zamboanga bounds
      if (
        startPoint &&
        (startPoint.lat < 6.8 ||
          startPoint.lat > 7.2 ||
          startPoint.lng < 122.0 ||
          startPoint.lng > 122.3)
      ) {
        console.error("❌ Start point outside Zamboanga bounds:", startPoint);
        alert(
          "Start location appears to be outside Zamboanga City. Please select a different location."
        );
        return;
      }

      if (
        endPoint &&
        (endPoint.lat < 6.8 ||
          endPoint.lat > 7.2 ||
          endPoint.lng < 122.0 ||
          endPoint.lng > 122.3)
      ) {
        console.error("❌ End point outside Zamboanga bounds:", endPoint);
        alert(
          "End location appears to be outside Zamboanga City. Please select a different location."
        );
        return;
      }

      setShowRoutePlannerModal(false);
      setRouteMode(true);

      // Add markers for start and end points
      if (mapRef.current) {
        const startMarker = L.marker([startPoint!.lat, startPoint!.lng], {
          icon: startIcon,
        })
          .addTo(mapRef.current)
          .bindPopup(
            `Start: ${
              selectedStartLocation.display_name
            }<br/>Coords: ${startPoint!.lat.toFixed(
              6
            )}, ${startPoint!.lng.toFixed(6)}`
          );

        const endMarker = L.marker([endPoint!.lat, endPoint!.lng], {
          icon: endIcon,
        })
          .addTo(mapRef.current)
          .bindPopup(
            `End: ${
              selectedEndLocation.display_name
            }<br/>Coords: ${endPoint!.lat.toFixed(6)}, ${endPoint!.lng.toFixed(
              6
            )}`
          );

        markersRef.current.push(startMarker, endMarker);
      }

      try {
        // Show loading animation
        setIsCalculatingRoutes(true);
        setPathfindingStep("calculating");

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

        // Cache elevation data with error handling and reduced frequency
        console.log(
          `Pre-caching elevation data for ${Math.ceil(
            cachePoints.length / step
          )} points...`
        );
        const maxCachePoints = useOfflineMode
          ? 0
          : Math.min(5, Math.ceil(cachePoints.length / step)); // Much more limited API calls

        for (
          let i = 0;
          i < cachePoints.length && i < maxCachePoints * step;
          i += step
        ) {
          try {
            const point = cachePoints[i];
            const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
            if (!elevationCacheRef.current.has(key)) {
              const data = await getElevationData(point.lat, point.lng);
              if (data) {
                elevationCacheRef.current.set(key, data);
              }
              // Add longer delay to avoid overwhelming APIs
              if (!useOfflineMode && i > 0) {
                await new Promise((resolve) => setTimeout(resolve, 500)); // Increased delay
              }
            }
          } catch (error) {
            console.warn(`Failed to cache elevation for point ${i}:`, error);
            // Continue with next point even if this one fails
          }
        }
        console.log(
          `Cached elevation data for ${elevationCacheRef.current.size} total points`
        );

        // Function to add hover handlers
        const addHoverHandlers = (polyline: L.Polyline, route: FloodRoute) => {
          let debounceTimer: NodeJS.Timeout;

          polyline.on("mousemove", async (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              try {
                const point = e.latlng;
                const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;

                let elevationData = elevationCacheRef.current.get(key);
                if (!elevationData) {
                  elevationData = await getElevationData(point.lat, point.lng);
                  if (elevationData)
                    elevationCacheRef.current.set(key, elevationData);
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

                  const isEstimated = useOfflineMode || apiFailureCount > 3;

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
                        Terrain Data ${isEstimated ? "(Estimated)" : "(Live)"}
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
              } catch (error) {
                console.warn("Error fetching elevation data for hover:", error);
                // Show a simple tooltip without elevation data
                polyline
                  .bindTooltip(
                    `<div style="background: white; padding: 8px; border-radius: 4px;">
                      Terrain data unavailable
                    </div>`,
                    { permanent: false, sticky: true }
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

        // Draw ALL three routes with animation for better user experience
        const drawAllRoutes = async (routes: RouteDetails) => {
          if (!mapRef.current) return;

          console.log("🎬 Starting animated route drawing...");

          // Clear existing route layers
          routeLayersRef.current.forEach((layer) => {
            if (mapRef.current && mapRef.current.hasLayer(layer)) {
              mapRef.current.removeLayer(layer);
            }
          });
          routeLayersRef.current = [];

          // Validate routes before drawing
          const isValidRoute = (route: any) => {
            return (
              route &&
              route.waypoints &&
              route.waypoints.length >= 2 &&
              route.waypoints.every((wp: any) => wp.lat && wp.lng)
            );
          };

          // Routes to draw in sequential order (safe route first and complete, then others)
          const routesToDraw = [
            { route: routes.safeRoute, label: "Safe Route", priority: 1 },
            {
              route: routes.manageableRoute,
              label: "Medium Risk Route",
              priority: 2,
            },
            { route: routes.proneRoute, label: "High Risk Route", priority: 3 },
          ];

          // Draw each route with animation - no delay since we're doing sequential
          const drawRouteWithAnimation = async (
            route: FloodRoute,
            label: string
          ) => {
            if (!isValidRoute(route)) {
              console.log(`❌ Skipping ${label} - invalid route data`);
              return;
            }

            console.log(`🎨 Drawing ${label}...`, route);
            console.log(`📍 Waypoints:`, route.waypoints);

            // Route styling based on risk level - made more visible
            let routeStyle = {};
            if (route.riskLevel?.toLowerCase().includes("safe")) {
              routeStyle = {
                color: route.color,
                weight: 8, // Increased thickness
                opacity: 1.0,
                dashArray: undefined,
                className: "safe-route",
              };
            } else if (route.riskLevel?.toLowerCase().includes("manageable")) {
              routeStyle = {
                color: route.color,
                weight: 7, // Increased thickness
                opacity: 0.8, // Increased opacity
                dashArray: undefined,
                className: "manageable-route",
              };
            } else {
              routeStyle = {
                color: route.color,
                weight: 6, // Increased thickness
                opacity: 0.7, // Increased opacity
                dashArray: undefined,
                className: "prone-route",
              };
            }

            // Create empty polyline first
            const polyline = L.polyline([], routeStyle).addTo(mapRef.current!);
            routeLayersRef.current.push(polyline);

            // Prepare waypoints for animation
            const waypoints = route.waypoints.map((wp) => [wp.lat, wp.lng]);
            console.log(
              `🎬 Animating ${waypoints.length} waypoints for ${label}`
            );

            if (waypoints.length > 0) {
              // Animate the route drawing
              await animateRouteDrawing(polyline, waypoints);

              // Add tooltip with route information AFTER animation completes
              polyline.bindTooltip(
                `🛣️ ${route.riskLevel}<br/>📍 ${route.distance} • ⏱️ ${route.time}`,
                { permanent: true, direction: "top", offset: [0, -10] }
              );

              // Add hover handlers for terrain information
              addHoverHandlers(polyline, route);

              console.log(`✅ ${label} animation complete`);
            } else {
              console.warn(`⚠️ No waypoints available for ${label}`);
            }
          };

          // Draw routes sequentially - safe route first and complete, then others
          console.log("🎯 Drawing safe route first...");
          await drawRouteWithAnimation(routes.safeRoute, "Safe Route");

          console.log("🎯 Safe route complete! Now drawing other routes...");
          await new Promise((resolve) => setTimeout(resolve, 500)); // Faster pause before other routes

          // Draw the other routes simultaneously after safe route is done
          const otherRoutes = [
            { route: routes.manageableRoute, label: "Medium Risk Route" },
            { route: routes.proneRoute, label: "High Risk Route" },
          ];

          const otherPromises = otherRoutes.map(({ route, label }) =>
            drawRouteWithAnimation(route, label)
          );

          await Promise.all(otherPromises);

          // Fit map to show all routes
          if (routeLayersRef.current.length > 0) {
            const group = new L.FeatureGroup(routeLayersRef.current);
            mapRef.current.fitBounds(group.getBounds().pad(0.1));
          }

          console.log("🎯 All routes drawn with animation!");
        };

        // Animated route pathfinding (now default behavior)
        setIsCalculatingRoutes(false);
        setPathfindingStep("finding-safe");

        // Skip old single route animation - use new drawAllRoutes system instead
        console.log("🛣️ Using new multi-route drawing system...");

        // Step 2: Show other routes as overlays (if educational mode is enabled)
        if (isEducationalMode) {
          console.log(
            "🎓 Educational Mode: Step 2 - Showing high-risk route..."
          );
          setPathfindingStep("showing-risk");
          await showHighRiskRouteOverlay(routes);
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Pause for educational comparison
        }

        // Step 3: Show the final comparison
        console.log(
          "🛣️ Pathfinding Animation: Final step - Showing route comparison..."
        );
        setPathfindingStep("complete");

        // Clear only search visualization nodes, keep routes visible
        circleMarkersRef.current.forEach((marker) => {
          if (mapRef.current && mapRef.current.hasLayer(marker)) {
            mapRef.current.removeLayer(marker);
          }
        });
        circleMarkersRef.current = [];

        // Draw all routes with progressive animation and staggered timing
        await drawAllRoutes(routes);

        setRouteDetails(routes);
      } catch (error) {
        // Turn off loading animation on error
        setIsCalculatingRoutes(false);
        setPathfindingStep("idle");

        console.error("Error generating routes:", error);

        let errorMessage = "Error generating routes. Please try again.";

        if (error instanceof TypeError && error.message.includes("fetch")) {
          errorMessage =
            "Network error: Unable to connect to routing service. Please check your internet connection and try again.";
        } else if (error instanceof Error) {
          if (error.message.includes("No routes found")) {
            errorMessage =
              "No routes found between the selected locations. Please try different locations.";
          } else if (error.message.includes("elevation")) {
            errorMessage =
              "Route generated with limited terrain data. Some features may not be available.";
          }
        }

        // Show user-friendly error message
        alert(errorMessage);

        // Don't show fallback routes to avoid confusion - user should try again
        console.log(
          "Route generation failed - no fallback routes shown to avoid confusion"
        );
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

  useEffect(() => {
    if (
      autoRoutePendingRef.current &&
      selectedStartLocation &&
      selectedEndLocation &&
      startPoint &&
      endPoint
    ) {
      autoRoutePendingRef.current = false;
      handleFindRoute();
    }
  }, [
    selectedStartLocation,
    selectedEndLocation,
    startPoint,
    endPoint,
    handleFindRoute,
  ]);

  // Handle route selection
  const handleRouteSelection = (routeType: "safe" | "manageable" | "prone") => {
    console.log(`🎯 User selected ${routeType} route`);
    setSelectedRoute(routeType);
    if (routeDetails) {
      const selectedRouteData = routeDetails[routeType + "Route"] as FloodRoute;

      // Log route details for debugging
      console.log(`📍 ${routeType} route details:`, {
        waypointsCount: selectedRouteData.waypoints?.length || 0,
        distance: selectedRouteData.distance,
        floodRisk: selectedRouteData.floodRisk,
        firstPoint: selectedRouteData.waypoints?.[0],
        lastPoint:
          selectedRouteData.waypoints?.[
            selectedRouteData.waypoints?.length - 1
          ],
      });

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
                      🏔️ Terrain Data ${
                        elevationData
                          ? useOfflineMode || apiFailureCount > 3
                            ? "(Estimated)"
                            : "(Live)"
                          : "(Estimated)"
                      }
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
              console.warn("Error fetching terrain data for tooltip:", error);

              // Show fallback tooltip with estimated data
              if (!isTooltipShown) {
                const fallbackFloodRisk = calculateFloodRisk(
                  elevation,
                  rectCenterLat,
                  rectCenterLng
                );
                const fallbackRiskColor =
                  fallbackFloodRisk === "prone"
                    ? "#e74c3c"
                    : fallbackFloodRisk === "manageable"
                    ? "#f39c12"
                    : "#27ae60";

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
                  ">
                    <div style="color: ${color}; font-weight: 600; font-size: 13px; margin-bottom: 6px;">
                      🏔️ Terrain Data (Estimated)
                    </div>
                    <div style="margin-bottom: 4px; font-size: 12px;">
                      <strong>Elevation:</strong> ~${elevation.toFixed(1)}m
                    </div>
                    <div style="margin-bottom: 4px; font-size: 12px;">
                      <strong>Slope:</strong> ~${calculateSlope(elevation)}°
                    </div>
                    <div style="color: ${fallbackRiskColor}; font-size: 11px; margin-top: 6px; padding: 3px 6px; background: ${fallbackRiskColor}15; border-radius: 3px;">
                      Risk: ${
                        fallbackFloodRisk === "prone"
                          ? "High"
                          : fallbackFloodRisk === "manageable"
                          ? "Medium"
                          : "Low"
                      } (Estimated)
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
    // Check cache first
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (elevationCacheRef.current.has(cacheKey)) {
      return elevationCacheRef.current.get(cacheKey)!;
    }

    // Helper function to create elevation data from elevation value
    const createElevationData = (
      elevation: number,
      isEstimated: boolean = false
    ): TerrainData => {
      const floodRisk = calculateFloodRisk(elevation, lat, lng);
      const data: TerrainData = {
        elevation: elevation,
        slope: calculateSlope(elevation),
        floodRisk:
          floodRisk === "safe"
            ? "Low"
            : floodRisk === "manageable"
            ? "Medium"
            : "High",
        terrainType: getTerrainType(elevation),
        lat: lat.toFixed(6),
        lng: lng.toFixed(6),
      };

      // Cache the result
      elevationCacheRef.current.set(cacheKey, data);
      return data;
    };

    // Enhanced geographic estimation based on real Zamboanga City terrain
    const getEnhancedGeographicEstimation = (): number => {
      const cityCenter = { lat: 6.9214, lng: 122.079 };
      const distanceFromCenter =
        Math.sqrt(
          Math.pow(lat - cityCenter.lat, 2) + Math.pow(lng - cityCenter.lng, 2)
        ) * 111; // Convert to km

      // Known elevation zones in Zamboanga City
      const knownAreas = [
        // Coastal/port areas - very low elevation
        {
          lat: 6.9167,
          lng: 122.0747,
          radius: 2,
          baseElevation: 3,
          variance: 5,
        },
        // City proper - low elevation
        {
          lat: 6.9214,
          lng: 122.079,
          radius: 3,
          baseElevation: 8,
          variance: 10,
        },
        // Tetuan - slightly elevated
        { lat: 6.93, lng: 122.085, radius: 2, baseElevation: 15, variance: 12 },
        // Tumaga - hilly area
        { lat: 6.91, lng: 122.06, radius: 3, baseElevation: 25, variance: 20 },
        // Putik - elevated residential
        { lat: 6.94, lng: 122.07, radius: 2, baseElevation: 35, variance: 15 },
      ];

      // Check if point is near any known area
      for (const area of knownAreas) {
        const distToArea =
          Math.sqrt(Math.pow(lat - area.lat, 2) + Math.pow(lng - area.lng, 2)) *
          111;

        if (distToArea < area.radius) {
          const influence = 1 - distToArea / area.radius;
          const elevation =
            area.baseElevation +
            (Math.random() - 0.5) * area.variance * influence;
          return Math.max(1, Math.round(elevation));
        }
      }

      // General geographic estimation based on distance from city center
      let estimatedElevation: number;

      if (distanceFromCenter < 2) {
        // Inner city - coastal plains
        estimatedElevation = 3 + Math.random() * 12; // 3-15m
      } else if (distanceFromCenter < 5) {
        // Urban areas - gentle slopes
        estimatedElevation = 8 + Math.random() * 22; // 8-30m
      } else if (distanceFromCenter < 10) {
        // Suburban - rolling hills
        estimatedElevation = 20 + Math.random() * 35; // 20-55m
      } else if (distanceFromCenter < 20) {
        // Rural - hills and ridges
        estimatedElevation = 40 + Math.random() * 60; // 40-100m
      } else {
        // Remote - mountainous
        estimatedElevation = 80 + Math.random() * 120; // 80-200m
      }

      // Add geographic consistency based on coordinates
      const latSeed = Math.sin(lat * 100) * 0.5;
      const lngSeed = Math.cos(lng * 100) * 0.5;
      estimatedElevation += (latSeed + lngSeed) * 15;

      return Math.max(1, Math.round(estimatedElevation));
    };

    // If offline mode is enabled or too many API failures, use geographic estimation immediately
    if (useOfflineMode || apiFailureCount > 2) {
      const estimatedElevation = getEnhancedGeographicEstimation();
      return createElevationData(estimatedElevation, true);
    }

    // Try elevation APIs with better error handling
    try {
      const timeoutMs = 1500; // Reduced timeout for faster fallback

      // Try backend elevation API
      const response = await Promise.race([
        fetch(`http://localhost:8001/elevation?locations=${lat},${lng}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("API timeout")), timeoutMs)
        ),
      ]);

      if (response.ok) {
        const data = await response.json();
        if (data.elevations && data.elevations.length > 0) {
          const elevation = data.elevations[0].elevation;
          if (typeof elevation === "number" && elevation > -500) {
            setApiFailureCount(Math.max(0, apiFailureCount - 1)); // Reduce failure count on success
            return createElevationData(elevation, false);
          }
        }
      }
    } catch (error) {
      console.debug(
        "Backend elevation API failed, using geographic estimation"
      );
      setApiFailureCount((prev) => Math.min(5, prev + 1));
    }

    // Switch to offline mode if too many failures
    if (apiFailureCount >= 3 && !useOfflineMode) {
      console.log("Switching to offline mode due to repeated API failures");
      setUseOfflineMode(true);
    }

    // Always fall back to geographic estimation
    const estimatedElevation = getEnhancedGeographicEstimation();
    return createElevationData(estimatedElevation, true);
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

    // Set map as ready after initialization
    setTimeout(() => setIsMapReady(true), 100);

    // 1. FIRST: Add flood-aware routing button control
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
          console.log("🗺️ Route Planner button clicked - opening modal...");
          e.stopPropagation();
          setShowRoutePlannerModal(true);
          setIsTerrainMode(false);
          console.log(`📋 Modal state: showRoutePlannerModal = true`);
        };

        return btn;
      },
    });
    const routingBtn = new RoutingBtn({ position: "topleft" });
    map.addControl(routingBtn);

    // 2. Add zoom controls
    const zoomControl = new L.Control.Zoom({
      position: "topleft",
    });
    map.addControl(zoomControl);

    // 3. Add collapsible menu button (same as before but removed routing-related parts)
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

    // 4. Add terrain overlay toggle button
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

  useEffect(() => {
    if (!isMapReady || !mapRef.current) {
      return;
    }

    let isCancelled = false;
    const mapInstance = mapRef.current;

    if (!poiLayerRef.current) {
      poiLayerRef.current = L.layerGroup();
    } else {
      poiLayerRef.current.clearLayers();
    }

    poiMarkersRef.current.forEach((marker) => marker.remove());
    poiMarkersRef.current.clear();
    poiPlacesRef.current.clear();

    poiLayerRef.current.addTo(mapInstance);
    mapInstance.off("zoomend", updatePoiVisibility);
    mapInstance.on("zoomend", updatePoiVisibility);

    const iconCache = poiIconCacheRef.current;

    const renderPlaceMarker = (place: ZamboangaPlace) => {
      const style = POI_GROUP_STYLES[place.group];
      const cacheKey = place.group;

      if (!iconCache[cacheKey]) {
        iconCache[cacheKey] = L.divIcon({
          className: "zambo-poi-marker",
          html: `<div style="
              width: 32px;
              height: 32px;
              border-radius: 12px;
              background: ${style.color};
              display: flex;
              align-items: center;
              justify-content: center;
              color: #ffffff;
              font-size: 18px;
              border: 2px solid #ffffff;
              box-shadow: 0 4px 10px rgba(0,0,0,0.25);
            ">${style.emoji}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -28],
        });
      }

      const marker = L.marker([place.lat, place.lng], {
        icon: iconCache[cacheKey],
        bubblingMouseEvents: false,
      });

      const coordsText = `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
      const suggestion = placeToSuggestion(place);
      const popupId = Math.random().toString(36).slice(2, 10);
      const setStartId = `poi-set-start-${popupId}`;
      const setEndId = `poi-set-end-${popupId}`;
      const routeId = `poi-route-${popupId}`;

      const badgeHtml = `<div style="
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: ${style.color};
          color: #ffffff;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 8px;
        ">${style.emoji}<span>${escapeHtml(place.categoryLabel)}</span></div>`;

      const addressHtml = place.address
        ? `<div style="font-size: 12px; color: #374151; margin-bottom: 4px;">${escapeHtml(
            place.address
          )}</div>`
        : "";

      const popupHtml = `
        <div style="min-width: 240px; font-family: system-ui;">
          <div style="font-weight: 600; margin-bottom: 6px; color: #1f2937; font-size: 15px;">
            ${escapeHtml(place.name)}
          </div>
          ${badgeHtml}
          ${addressHtml}
          <div style="font-size: 12px; color: #4b5563; margin-bottom: 10px;">
            ${coordsText}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <button id="${setStartId}" style="background: #22c55e; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
              Set as Start
            </button>
            <button id="${setEndId}" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
              Set as Destination
            </button>
            <button id="${routeId}" style="background: #2563eb; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
              Route From My Location
            </button>
          </div>
        </div>`;

      marker.bindPopup(popupHtml, {
        autoPan: true,
        closeButton: true,
        className: "poi-popup",
      });

      marker.on("popupopen", () => {
        setActivePlace(place);

        const startBtn = document.getElementById(setStartId);
        const endBtn = document.getElementById(setEndId);
        const routeBtn = document.getElementById(routeId);

        if (startBtn) {
          startBtn.addEventListener("click", () => {
            handleSelectStartLocation(suggestion);
            setRouteMode(false);
            setIsTerrainMode(false);
            setShowRoutePlannerModal(true);
            marker.closePopup();
          });
        }

        if (endBtn) {
          endBtn.addEventListener("click", () => {
            handleSelectEndLocation(suggestion);
            setRouteMode(false);
            setIsTerrainMode(false);
            setShowRoutePlannerModal(true);
            marker.closePopup();
          });
        }

        if (routeBtn) {
          routeBtn.addEventListener("click", () => {
            autoRoutePendingRef.current = true;
            handleSelectEndLocation(suggestion);
            setRouteMode(false);
            setIsTerrainMode(false);
            setShowRoutePlannerModal(false);
            useCurrentLocationAsStart();
            marker.closePopup();
          });
        }
      });

      marker.on("popupclose", () => {
        setActivePlace((current) =>
          current && current.id === place.id ? null : current
        );
      });

      poiMarkersRef.current.set(place.id, marker);
      poiPlacesRef.current.set(place.id, place);

      if (shouldShowPlaceAtZoom(place, mapInstance.getZoom())) {
        poiLayerRef.current?.addLayer(marker);
      }
    };

    const loadPlaces = async () => {
      setIsLoadingPlaces(true);
      setPlacesError(null);

      try {
        const fetchedPlaces = await fetchZamboangaPlaces();
        if (isCancelled) {
          return;
        }

        setPlaces(fetchedPlaces);
        poiLayerRef.current?.clearLayers();
        poiMarkersRef.current.forEach((marker) => marker.remove());
        poiMarkersRef.current.clear();
        poiPlacesRef.current.clear();

        fetchedPlaces.forEach(renderPlaceMarker);
        updatePoiVisibility();

        const usingFallback =
          fetchedPlaces.length > 0 &&
          fetchedPlaces.every((place) => place.source === "fallback");

        if (usingFallback) {
          setPlacesError(
            "Showing a limited set of featured places while the live places service is unreachable."
          );
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Unable to load Zamboanga places:", error);
          setPlacesError(
            "We couldn't load live place data right now. Try refreshing the map later."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPlaces(false);
        }
      }
    };

    loadPlaces();

    return () => {
      isCancelled = true;
      mapInstance.off("zoomend", updatePoiVisibility);
      if (poiLayerRef.current && mapInstance) {
        mapInstance.removeLayer(poiLayerRef.current);
      }
    };
  }, [isMapReady, shouldShowPlaceAtZoom, updatePoiVisibility]);

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

  // Map click handlers for terrain sampling and dropped pins
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
        return;
      }

      if (!mapRef.current) {
        return;
      }

      setActivePlace(null);
      const { lat, lng } = e.latlng;
      removeDroppedPinMarker();

      let locationDetails: ZamboCityLocation | null = null;
      try {
        locationDetails = await getLocationByCoordinates(lat, lng);
      } catch (error) {
        console.error("Error reverse geocoding dropped pin:", error);
      }

      const coordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const displayName =
        locationDetails?.displayName || `Dropped Pin (${coordsText})`;
      const suggestion: LocationSuggestion = {
        display_name: displayName,
        lat: lat.toString(),
        lon: lng.toString(),
        place_id:
          locationDetails?.place_id ||
          `dropped-${lat.toFixed(5)}-${lng.toFixed(5)}-${Date.now()}`,
        type: locationDetails?.type || "dropped_pin",
        isLocal: Boolean(locationDetails),
      };

      const marker = L.marker([lat, lng], {
        icon: droppedPinIcon,
        bubblingMouseEvents: false,
      }).addTo(mapRef.current);

      droppedPinMarkerRef.current = marker;

      const popupId = Math.random().toString(36).slice(2, 10);
      const setStartId = `set-start-${popupId}`;
      const setEndId = `set-end-${popupId}`;
      const routeHereId = `route-here-${popupId}`;

      const popupHtml = `
        <div style="min-width: 220px; font-family: system-ui;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #1f2937;">
            ${escapeHtml(displayName)}
          </div>
          <div style="font-size: 12px; color: #4b5563; margin-bottom: 10px;">
            ${coordsText}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <button id="${setStartId}"
              style="background: #22c55e; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
              Set as Start
            </button>
            <button id="${setEndId}"
              style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
              Set as Destination
            </button>
            <button id="${routeHereId}"
              style="background: #2563eb; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">
              Route From My Location
            </button>
          </div>
        </div>`;

      marker.bindPopup(popupHtml, {
        autoPan: true,
        closeButton: true,
        className: "dropped-pin-popup",
      });

      marker.on("popupopen", () => {
        const startBtn = document.getElementById(setStartId);
        const endBtn = document.getElementById(setEndId);
        const routeBtn = document.getElementById(routeHereId);

        if (startBtn) {
          startBtn.addEventListener("click", () => {
            handleSelectStartLocation(suggestion);
            setRouteMode(false);
            setIsTerrainMode(false);
            setShowRoutePlannerModal(true);
            marker.closePopup();
          });
        }

        if (endBtn) {
          endBtn.addEventListener("click", () => {
            handleSelectEndLocation(suggestion);
            setRouteMode(false);
            setIsTerrainMode(false);
            setShowRoutePlannerModal(true);
            marker.closePopup();
          });
        }

        if (routeBtn) {
          routeBtn.addEventListener("click", () => {
            autoRoutePendingRef.current = true;
            handleSelectEndLocation(suggestion);
            setRouteMode(false);
            setIsTerrainMode(false);
            setShowRoutePlannerModal(false);
            useCurrentLocationAsStart();
            marker.closePopup();
          });
        }
      });

      marker.openPopup();
    };

    mapRef.current.on("click", handleMapClick);

    return () => {
      mapRef.current!.off("click", handleMapClick);
    };
  }, [isTerrainMode]);

  // Clear destinations function
  const clearDestinations = () => {
    setSelectedStartLocation(null);
    setSelectedEndLocation(null);
    setStartLocationInput("");
    setEndLocationInput("");
    setStartSuggestions([]);
    setEndSuggestions([]);
    setShowStartSuggestions(false);
    setShowEndSuggestions(false);

    // Clear localStorage
    localStorage.removeItem("safepath_start_location");
    localStorage.removeItem("safepath_end_location");
    localStorage.removeItem("safepath_start_input");
    localStorage.removeItem("safepath_end_input");

    // Clear visual markers from the map
    markersRef.current.forEach((marker) => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    // Clear circle markers
    circleMarkersRef.current.forEach((marker) => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    circleMarkersRef.current = [];

    removeDroppedPinMarker();
  };

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

    // Clear circle markers
    circleMarkersRef.current.forEach((marker) => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    circleMarkersRef.current = [];

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

    removeDroppedPinMarker();
  };

  const activePlaceStyle = activePlace ? POI_GROUP_STYLES[activePlace.group] : null;

  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "1200px",
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* CSS for educational mode animations and loading overlay */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes routeDiscovery {
          0% { transform: translateX(-100px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(100px); opacity: 0; }
        }
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(3px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          border-radius: 0;
        }
        .simple-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(34, 197, 94, 0.3);
          border-top: 3px solid #22c55e;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 15px;
        }
        .loading-text {
          color: #ffffff;
          font-size: 1.1rem;
          font-weight: 500;
          margin-bottom: 8px;
          text-align: center;
        }
        .loading-subtitle {
          color: #9ca3af;
          font-size: 0.9rem;
          text-align: center;
          max-width: 300px;
          line-height: 1.4;
        }
      `}</style>

      {/* Simple Loading Animation Overlay */}
      {isCalculatingRoutes && (
        <div className="loading-overlay">
          <div className="simple-spinner"></div>
          <div className="loading-text">
            {pathfindingStep === "calculating" && "🗺️ Calculating Routes"}
            {pathfindingStep === "finding-safe" && "🛡️ Finding Safe Route"}
            {pathfindingStep === "showing-risk" && "⚠️ Analyzing Risk Routes"}
          </div>
          <div className="loading-subtitle">
            {pathfindingStep === "calculating" &&
              "Analyzing flood risks and optimal paths..."}
            {pathfindingStep === "finding-safe" &&
              "Step 1: Discovering safest path with flood protection..."}
            {pathfindingStep === "showing-risk" &&
              "Step 2: Comparing with high-risk alternatives..."}
          </div>
        </div>
      )}

      {/* Offline Mode Indicator */}
      {(useOfflineMode || apiFailureCount > 3) && (
        <div
          style={{
            background: "linear-gradient(135deg, #ffeaa7, #fdcb6e)",
            border: "2px solid #e17055",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "20px" }}>📡</span>
            <div>
              <div
                style={{
                  fontWeight: "600",
                  color: "#d63031",
                  marginBottom: "4px",
                }}
              >
                Offline Terrain Mode Active
              </div>
              <div style={{ fontSize: "13px", color: "#636e72" }}>
                Using geographic estimation due to API connectivity issues.
                Elevation data may be less accurate.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setUseOfflineMode(false);
              setApiFailureCount(0);
              elevationCacheRef.current.clear();
            }}
            style={{
              background: "#00b894",
              color: "white",
              border: "none",
              borderRadius: "6px",
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
            }}
            title="Try to reconnect to elevation APIs"
          >
            Retry APIs
          </button>
        </div>
      )}

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

        {isEducationalMode && pathfindingStep === "idle" && (
          <div
            style={{
              background: "linear-gradient(135deg, #EEF2FF, #E0E7FF)",
              border: "2px solid #8B5CF6",
              borderRadius: "8px",
              padding: "12px 16px",
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div style={{ fontSize: "24px" }}>🎓</div>
            <div>
              <div
                style={{
                  fontWeight: "600",
                  color: "#7C3AED",
                  marginBottom: "4px",
                }}
              >
                Educational Mode Enabled
              </div>
              <div style={{ fontSize: "13px", color: "#6366F1" }}>
                Route planning includes detailed comparison of different path
                options and risk analysis.
              </div>
            </div>
          </div>
        )}

        {pathfindingStep !== "idle" && (
          <div
            style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              color: "white",
              padding: "12px 16px",
              borderRadius: "8px",
              flexGrow: 1,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                border: "2px solid white",
                borderTop: "2px solid transparent",
                borderRadius: "50%",
                animation:
                  pathfindingStep === "calculating"
                    ? "spin 1s linear infinite"
                    : "none",
              }}
            ></div>
            <div>
              <div style={{ fontWeight: "600", marginBottom: "2px" }}>
                🛣️ Route Pathfinding Active
              </div>
              <div style={{ fontSize: "13px", opacity: 0.9 }}>
                {pathfindingStep === "finding-safe" &&
                  "Finding optimal safe route using terrain data..."}
                {pathfindingStep === "showing-risk" &&
                  isEducationalMode &&
                  "Analyzing high-risk flood route for comparison..."}
                {pathfindingStep === "complete" &&
                  "✅ Route analysis complete!"}
              </div>
            </div>
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
            style={{
              position: "fixed",
              top: "80px",
              left: "20px",
              width: "320px",
              zIndex: 1200,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            <div style={{ position: "relative" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "#ffffff",
                  borderRadius: "999px",
                  padding: "10px 16px",
                  boxShadow: "0 14px 28px rgba(15,23,42,0.22)",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="7"></circle>
                  <line x1="16.65" y1="16.65" x2="21" y2="21"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Search places in Zamboanga City"
                  value={mapSearchQuery}
                  onChange={(event) =>
                    handleMapSearchInputChange(event.target.value)
                  }
                  onFocus={handleMapSearchFocus}
                  onBlur={handleMapSearchBlur}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    fontSize: "14px",
                    color: "#1f2937",
                    background: "transparent",
                  }}
                />
                {mapSearchQuery.length > 0 && (
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleMapSearchInputChange("")}
                    style={{
                      background: "rgba(148, 163, 184, 0.15)",
                      border: "none",
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                    }}
                    aria-label="Clear search"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#475569"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>

              {showMapSearchResults && (
                <div
                  onMouseDown={(event) => event.preventDefault()}
                  style={{
                    position: "absolute",
                    top: "56px",
                    left: 0,
                    right: 0,
                    background: "#ffffff",
                    borderRadius: "16px",
                    boxShadow: "0 18px 36px rgba(15,23,42,0.25)",
                    border: "1px solid rgba(148, 163, 184, 0.35)",
                    padding: "8px 0",
                    maxHeight: "300px",
                    overflowY: "auto",
                  }}
                >
                  {isSearchingMapLocations && (
                    <div
                      style={{
                        padding: "10px 18px",
                        fontSize: "13px",
                        color: "#475569",
                      }}
                    >
                      Searching updated map data…
                    </div>
                  )}
                  {mapSearchError && (
                    <div
                      style={{
                        padding: "10px 18px",
                        fontSize: "13px",
                        color: "#dc2626",
                      }}
                    >
                      {mapSearchError}
                    </div>
                  )}
                  {!mapSearchError &&
                    !isSearchingMapLocations &&
                    mapSearchResults.length === 0 && (
                      <div
                        style={{
                          padding: "12px 18px",
                          fontSize: "13px",
                          color: "#6b7280",
                        }}
                      >
                        No nearby places found. Try a different name.
                      </div>
                    )}
                  {mapSearchResults.map((result) => {
                    const subtitle = result.type
                      ? result.type.replace(/_/g, " ")
                      : "Location";
                    return (
                      <button
                        key={result.place_id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleMapSearchResultSelect(result)}
                        style={{
                          width: "100%",
                          padding: "10px 18px",
                          background: "transparent",
                          border: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "14px",
                            color: "#1f2937",
                            fontWeight: 600,
                          }}
                        >
                          {result.display_name}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#64748b",
                          }}
                        >
                          {subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {isLoadingPlaces && (
            <div
              style={{
                position: "fixed",
                top: "140px",
                left: "20px",
                background: "rgba(37, 99, 235, 0.95)",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "999px",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.01em",
                boxShadow: "0 10px 20px rgba(37,99,235,0.35)",
                zIndex: 1100,
              }}
            >
              Loading Zamboanga places…
            </div>
          )}

          {placesError && (
            <div
              style={{
                position: "fixed",
                top: isLoadingPlaces ? "182px" : "140px",
                left: "20px",
                background: "rgba(239, 68, 68, 0.95)",
                color: "#ffffff",
                padding: "10px 16px",
                borderRadius: "12px",
                fontSize: "12px",
                lineHeight: 1.4,
                maxWidth: "280px",
                boxShadow: "0 10px 20px rgba(239,68,68,0.25)",
                zIndex: 1100,
              }}
            >
              {placesError}
            </div>
          )}

          {activePlace && activePlaceStyle && (
            <div
              style={{
                position: "fixed",
                top: "80px",
                right: "20px",
                width: "280px",
                background: "#ffffff",
                borderRadius: "16px",
                boxShadow: "0 20px 35px rgba(15, 23, 42, 0.25)",
                padding: "18px",
                borderTop: `4px solid ${activePlaceStyle.color}`,
                zIndex: 1100,
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "14px",
                    background: activePlaceStyle.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "22px",
                    color: "#ffffff",
                    boxShadow: "0 10px 20px rgba(0,0,0,0.25)",
                  }}
                >
                  {activePlaceStyle.emoji}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#1f2937",
                      marginBottom: "2px",
                    }}
                  >
                    {activePlace.name}
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#ffffff",
                      background: activePlaceStyle.color,
                    }}
                  >
                    {activePlaceStyle.emoji} {activePlace.categoryLabel}
                  </div>
                </div>
              </div>

              {activePlace.address && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#4b5563",
                    marginBottom: "8px",
                  }}
                >
                  {activePlace.address}
                </div>
              )}

              <div
                style={{
                  fontSize: "12px",
                  color: "#6b7280",
                  marginBottom: "14px",
                }}
              >
                {activePlace.lat.toFixed(5)}, {activePlace.lng.toFixed(5)}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <button
                  style={{
                    background: "#22c55e",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const suggestion = placeToSuggestion(activePlace);
                    handleSelectStartLocation(suggestion);
                    setShowRoutePlannerModal(true);
                    setRouteMode(false);
                    setIsTerrainMode(false);
                  }}
                >
                  Set as Start
                </button>
                <button
                  style={{
                    background: "#ef4444",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const suggestion = placeToSuggestion(activePlace);
                    handleSelectEndLocation(suggestion);
                    setShowRoutePlannerModal(true);
                    setRouteMode(false);
                    setIsTerrainMode(false);
                  }}
                >
                  Set as Destination
                </button>
                <button
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    padding: "8px 12px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                  onClick={() => {
                    const suggestion = placeToSuggestion(activePlace);
                    autoRoutePendingRef.current = true;
                    handleSelectEndLocation(suggestion);
                    setShowRoutePlannerModal(false);
                    setRouteMode(false);
                    setIsTerrainMode(false);
                    useCurrentLocationAsStart();
                  }}
                >
                  Route From My Location
                </button>
              </div>
            </div>
          )}

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
          setStartLocationInput={handleStartLocationInputChange}
          setEndLocationInput={handleEndLocationInputChange}
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
          clearDestinations={clearDestinations}
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
            {safestFastestMode
              ? "⚡ Optimized Route Options"
              : "🌊 Flood-Risk Route Options"}
          </h2>

          {safestFastestMode && (
            <div
              style={{
                background: "#e3f2fd",
                padding: "12px",
                borderRadius: "6px",
                marginBottom: "15px",
                border: "1px solid #2196f3",
              }}
            >
              <div style={{ fontSize: "0.9rem", color: "#1565c0" }}>
                <strong>ℹ️ Geographic Constraint Notice:</strong> Due to
                identical terrain and distances, we've optimized routes for
                safety vs speed instead of flood risk variation.
              </div>
            </div>
          )}

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
                  <h3 style={{ margin: 0, color: "#27ae60" }}>
                    {safestFastestMode ? "🛡️ Safest Route" : "🛡️ Safe Route"}
                  </h3>
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
                  {safestFastestMode
                    ? "SAFEST"
                    : routeDetails.safeRoute.riskLevel}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                {safestFastestMode
                  ? "Prioritizes main roads and safer intersections for maximum security"
                  : routeDetails.safeRoute.description}
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
                    {safestFastestMode
                      ? "⚡ Fastest Route"
                      : "⚠️ Manageable Route"}
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
                  {safestFastestMode
                    ? "FASTEST"
                    : routeDetails.manageableRoute.riskLevel}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                {safestFastestMode
                  ? "Takes the most direct path to minimize travel time"
                  : routeDetails.manageableRoute.description}
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

      {/* Identical Terrain Notification */}
      {showIdenticalTerrainNotification && (
        <div className="absolute top-4 left-4 z-[1000] bg-blue-600 text-white p-4 rounded-lg shadow-lg border-l-4 border-blue-400 max-w-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 text-blue-200">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium mb-1">
                Identical Terrain & Distance
              </div>
              <div className="text-xs text-blue-100 mb-3">
                Geographic constraints prevent distinct routes. Showing
                optimized alternatives:
              </div>
              <div className="text-xs text-blue-100 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-green-400 rounded-full"></span>
                  <span>Safest Route (main roads)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>
                  <span>Fastest Route (direct path)</span>
                </div>
              </div>
              <button
                onClick={() => setShowIdenticalTerrainNotification(false)}
                className="mt-3 text-xs text-blue-200 hover:text-white underline"
              >
                Dismiss
              </button>
            </div>
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