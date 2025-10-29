/**
 * Local GeoJSON-based routing service for Zamboanga City
 * Provides precise routing using filtered road network data from QGIS
 */

interface LocalRoutePoint {
  lat: number;
  lng: number;
}

interface LocalRouteSegment {
  distance: number;
  duration: number;
  road_name: string;
  speed_limit: number;
}

interface LocalRouteResponse {
  success: boolean;
  route: LocalRoutePoint[];
  distance: number;
  duration: number;
  segments: LocalRouteSegment[];
  source: string;
  message?: string;
}

interface NearestRoadResponse {
  success: boolean;
  nearest_point?: LocalRoutePoint;
  distance?: number;
  message?: string;
}

interface NetworkInfo {
  loaded: boolean;
  total_segments: number;
  total_nodes: number;
  total_length_km: number;
  road_types: Record<string, { count: number; length: number }>;
  geojson_path: string;
}

class LocalRoutingService {
  private baseUrl: string;
  private healthyStatus: boolean = false;

  constructor(
    baseUrl: string = import.meta.env.VITE_BACKEND_URL ||
      "http://localhost:8001"
  ) {
    this.baseUrl = baseUrl;
    this.checkHealth();
  }

  /**
   * Check if the local routing service is healthy
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/routing/health`);
      const data = await response.json();
      this.healthyStatus = data.healthy;
      return data.healthy;
    } catch (error) {
      console.warn("Local routing service not available:", error);
      this.healthyStatus = false;
      return false;
    }
  }

  /**
   * Get information about the loaded road network
   */
  async getNetworkInfo(): Promise<NetworkInfo | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/routing/network-info`);
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error("Error getting network info:", error);
      return null;
    }
  }

  /**
   * Calculate route using local GeoJSON road network
   */
  async calculateRoute(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
  ): Promise<LocalRouteResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/routing/calculate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          start: [startLat, startLng],
          end: [endLat, endLng],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        console.log(
          `✓ Local routing: ${data.route.length} waypoints, ${(
            data.distance / 1000
          ).toFixed(1)}km, ${Math.round(data.duration / 60)}min`
        );
      } else {
        console.log("Local routing failed:", data.message);
      }

      return data;
    } catch (error) {
      console.error("Error calculating local route:", error);
      return null;
    }
  }

  /**
   * Find nearest road point for coordinate snapping
   */
  async findNearestRoad(
    lat: number,
    lng: number,
    maxDistance: number = 2000 // Increased from 500m to 2000m for limited road networks
  ): Promise<NearestRoadResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/routing/nearest-road`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat,
          lng,
          max_distance: maxDistance,
        }),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error("Error finding nearest road:", error);
      return null;
    }
  }

  /**
   * Convert local route to LatLng format used by Leaflet
   */
  convertToLatLng(route: LocalRoutePoint[]): { lat: number; lng: number }[] {
    return route.map((point) => ({
      lat: point.lat,
      lng: point.lng,
    }));
  }

  /**
   * Check if local routing is available for a coordinate pair
   */
  async isAvailableForRoute(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
  ): Promise<boolean> {
    if (!this.healthyStatus) {
      await this.checkHealth();
    }

    if (!this.healthyStatus) return false;

    // Check if both points have nearby roads
    const startRoad = await this.findNearestRoad(startLat, startLng);
    const endRoad = await this.findNearestRoad(endLat, endLng);

    return !!(startRoad?.success && endRoad?.success);
  }

  /**
   * Get route statistics in a formatted way
   */
  formatRouteStats(route: LocalRouteResponse): string {
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const roadTypes = new Set(route.segments.map((s) => s.road_name)).size;

    return `${distanceKm}km • ${durationMin}min • ${roadTypes} roads`;
  }

  /**
   * Get the primary road name for a route
   */
  getPrimaryRoadName(route: LocalRouteResponse): string {
    if (route.segments.length === 0) return "Local Route";

    // Find the segment with the longest distance
    const primarySegment = route.segments.reduce((longest, current) =>
      current.distance > longest.distance ? current : longest
    );

    return primarySegment.road_name || "Local Route";
  }

  /**
   * Check if coordinates are within Zamboanga City bounds
   */
  isWithinZamboangaBounds(lat: number, lng: number): boolean {
    // Approximate bounds for Zamboanga City
    const bounds = {
      north: 6.95,
      south: 6.88,
      east: 122.15,
      west: 122.02,
    };

    return (
      lat >= bounds.south &&
      lat <= bounds.north &&
      lng >= bounds.west &&
      lng <= bounds.east
    );
  }

  /**
   * Reload the road network (useful after GeoJSON updates)
   */
  async reloadNetwork(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/routing/reload`, {
        method: "POST",
      });

      if (!response.ok) return false;

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error("Error reloading network:", error);
      return false;
    }
  }
}

// Export singleton instance
export const localRoutingService = new LocalRoutingService();

// Export types for use in other components
export type {
  LocalRoutePoint,
  LocalRouteSegment,
  LocalRouteResponse,
  NearestRoadResponse,
  NetworkInfo,
};

// Helper function to check if local routing should be preferred
export async function shouldUseLocalRouting(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<boolean> {
  // Use local routing if both points are within Zamboanga bounds
  const withinBounds =
    localRoutingService.isWithinZamboangaBounds(startLat, startLng) &&
    localRoutingService.isWithinZamboangaBounds(endLat, endLng);

  if (!withinBounds) return false;

  // Check if local routing is available for this route
  return await localRoutingService.isAvailableForRoute(
    startLat,
    startLng,
    endLat,
    endLng
  );
}

// Helper function to get route with fallback strategy
export async function getRouteWithFallback(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  fallbackFunction?: (start: any, end: any) => Promise<any>
): Promise<{ route: any[]; source: string; success: boolean }> {
  // Try local routing first
  if (await shouldUseLocalRouting(startLat, startLng, endLat, endLng)) {
    const localRoute = await localRoutingService.calculateRoute(
      startLat,
      startLng,
      endLat,
      endLng
    );

    if (localRoute?.success && localRoute.route.length > 0) {
      return {
        route: localRoutingService.convertToLatLng(localRoute.route),
        source: "local_geojson",
        success: true,
      };
    }
  }

  // Fallback to external API if provided
  if (fallbackFunction) {
    try {
      const fallbackRoute = await fallbackFunction(
        { lat: startLat, lng: startLng },
        { lat: endLat, lng: endLng }
      );

      return {
        route: fallbackRoute || [],
        source: "external_api",
        success: !!(fallbackRoute && fallbackRoute.length > 0),
      };
    } catch (error) {
      console.error("Fallback routing failed:", error);
    }
  }

  return {
    route: [],
    source: "none",
    success: false,
  };
}
