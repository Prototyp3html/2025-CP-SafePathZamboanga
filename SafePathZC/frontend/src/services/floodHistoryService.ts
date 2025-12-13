/**
 * Flood History Service
 * Fetches flood hotspots and historical data from the backend API
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

export interface FloodHotspot {
  road_id: string;
  road_name: string;
  location: {
    lat: number;
    lon: number;
  };
  flood_history: {
    total_events: number;
    total_flooded_hours: number;
    average_duration_hours: number;
    frequency_per_year: number;
  };
  risk_score: number;
  last_flood: {
    start: string | null;
    end: string | null;
    days_since: number | null;
  };
  first_recorded: string | null;
}

export interface FloodEvent {
  event_id: number;
  road_id: string;
  road_name: string;
  event_type: 'flood_start' | 'flood_end';
  event_time: string;
  flood_level: 'low' | 'medium' | 'high';
  environmental_data: {
    rainfall_mm: number;
    elevation_m: number;
    distance_to_water_m: number;
  };
  location: {
    lat: number;
    lon: number;
  };
}

export interface FloodStatistics {
  period_days: number;
  analysis_start_date: string;
  analysis_end_date: string;
  total_events: number;
  flood_start_events: number;
  flood_end_events: number;
  unique_roads_affected: number;
  severity_distribution: {
    high: number;
    medium: number;
    low: number;
  };
  average_rainfall_mm: number;
  top_flooded_roads: Array<{
    road_id: string;
    road_name: string;
    event_count: number;
  }>;
}

/**
 * Get flood hotspots - roads that flood repeatedly
 */
export async function getFloodHotspots(
  limit: number = 50,
  minRiskScore: number = 0
): Promise<FloodHotspot[]> {
  try {
    const params = new URLSearchParams({
      limit: limit.toString(),
      min_risk_score: minRiskScore.toString()
    });
    const response = await fetch(`${API_BASE_URL}/api/flood-history/hotspots?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.hotspots || [];
  } catch (error) {
    console.error('Error fetching flood hotspots:', error);
    return [];
  }
}

/**
 * Get flood events for analysis
 */
export async function getFloodEvents(
  roadId?: string,
  daysBack: number = 30,
  limit: number = 100
): Promise<FloodEvent[]> {
  try {
    const params = new URLSearchParams({
      days_back: daysBack.toString(),
      limit: limit.toString()
    });
    if (roadId) {
      params.append('road_id', roadId);
    }
    const response = await fetch(`${API_BASE_URL}/api/flood-history/events?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error('Error fetching flood events:', error);
    return [];
  }
}

/**
 * Get flood statistics
 */
export async function getFloodStatistics(
  daysBack: number = 30
): Promise<FloodStatistics> {
  try {
    const params = new URLSearchParams({
      days_back: daysBack.toString()
    });
    const response = await fetch(`${API_BASE_URL}/api/flood-history/statistics?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.statistics || ({} as FloodStatistics);
  } catch (error) {
    console.error('Error fetching flood statistics:', error);
    return {} as FloodStatistics;
  }
}

/**
 * Get complete flood history for a specific road
 */
export async function getRoadFloodHistory(roadId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/flood-history/road/${roadId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching road flood history:', error);
    return null;
  }
}

/**
 * Get flood events timeline
 */
export async function getFloodTimeline(daysBack: number = 7) {
  try {
    const params = new URLSearchParams({
      days_back: daysBack.toString()
    });
    const response = await fetch(`${API_BASE_URL}/api/flood-history/timeline?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.timeline || {};
  } catch (error) {
    console.error('Error fetching flood timeline:', error);
    return {};
  }
}

/**
 * Get risk level text and color for a risk score
 */
export function getRiskLevelInfo(riskScore: number): { level: string; color: string; bgColor: string } {
  if (riskScore >= 80) {
    return { level: 'Critical', color: '#8B0000', bgColor: '#FFB6C6' };
  } else if (riskScore >= 60) {
    return { level: 'High', color: '#FF4500', bgColor: '#FFE4B5' };
  } else if (riskScore >= 40) {
    return { level: 'Medium', color: '#FFA500', bgColor: '#FFFFE0' };
  } else {
    return { level: 'Low', color: '#228B22', bgColor: '#E0FFE0' };
  }
}

/**
 * Format date for display
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateString;
  }
}

/**
 * Get days ago text
 */
export function getDaysAgoText(daysAgo: number | null): string {
  if (daysAgo === null || daysAgo === undefined) return 'Never';
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return `${daysAgo} days ago`;
}
