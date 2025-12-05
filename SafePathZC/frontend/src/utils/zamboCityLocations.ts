// OpenStreetMap-based location search for Zamboanga City
export interface ZamboCityLocation {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type: string;
  importance?: number;
  place_id?: string;
  osm_type?: string;
  osm_id?: string;
  boundingbox?: [string, string, string, string];
}

// OpenStreetMap Nominatim API response interface
interface NominatimResult {
  place_id: string;
  licence: string;
  osm_type: string;
  osm_id: string;
  boundingbox: [string, string, string, string];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
}

// Search locations using backend geocoding API
export async function searchZamboCityLocations(
  query: string,
  limit: number = 10
): Promise<ZamboCityLocation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // In production, use VITE_API_URL; in dev, use relative path for Vite proxy
    const apiBase = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL 
      : '';
    
    const apiUrl = `${apiBase}/api/geocoding/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;

    console.log(`🌐 Calling API: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`❌ API returned status ${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get response as text first to debug JSON parse errors
    const responseText = await response.text();
    console.log(`📄 Raw response (first 200 chars): ${responseText.substring(0, 200)}`);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ JSON parse error: ${parseError}`);
      console.error(`Response was: ${responseText.substring(0, 500)}`);
      return getBasicZamboCityLocations(query, limit);
    }

    const results: NominatimResult[] = data.results || [];

    console.log(`📊 API Response for "${query}":`, {
      total: data.total,
      resultsCount: results.length,
      results: results.slice(0, 2), // Log first 2 results for debugging
    });

    // Format results for Zamboanga City
    const zamboCityResults = results
      .map((result) => ({
        name: result.display_name.split(",")[0].toUpperCase(),
        displayName: result.display_name.split(",")[0],
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        type: result.type,
        importance: result.importance,
        place_id: result.place_id,
        osm_type: result.osm_type,
        osm_id: result.osm_id,
        boundingbox: result.boundingbox,
      }))
      .sort((a, b) => (b.importance || 0) - (a.importance || 0));

    console.log(`✅ Formatted ${zamboCityResults.length} results for query: "${query}"`);
    
    // If we got results, return them
    if (zamboCityResults.length > 0) {
      return zamboCityResults;
    }

    // If API returned no results, try fallback locations
    console.log(`⚠️ No API results found, trying fallback locations for: "${query}"`);
    return getBasicZamboCityLocations(query, limit);
  } catch (error) {
    console.error("Error searching locations:", error);

    // Fallback to basic locations if API fails
    return getBasicZamboCityLocations(query, limit);
  }
}

// Basic fallback locations for when OpenStreetMap is unavailable
function getBasicZamboCityLocations(
  query: string,
  limit: number
): ZamboCityLocation[] {
  const basicLocations: ZamboCityLocation[] = [
    {
      name: "ZAMBOANGA CITY HALL",
      displayName: "Zamboanga City Hall",
      lat: 6.9214,
      lng: 122.079,
      type: "government",
    },
    {
      name: "ATENEO DE ZAMBOANGA",
      displayName: "Ateneo de Zamboanga University",
      lat: 6.9167,
      lng: 122.0834,
      type: "educational",
    },
    {
      name: "ZAMBOANGA AIRPORT",
      displayName: "Zamboanga International Airport",
      lat: 6.9224,
      lng: 122.0596,
      type: "transport",
    },
    {
      name: "KCC MALL",
      displayName: "KCC Mall of Zamboanga",
      lat: 6.9156,
      lng: 122.0789,
      type: "commercial",
    },
    {
      name: "WMSU",
      displayName: "Western Mindanao State University",
      lat: 6.9078,
      lng: 122.0656,
      type: "educational",
    },
    {
      name: "ZAMBOANGA PORT",
      displayName: "Zamboanga Port",
      lat: 6.9244,
      lng: 122.0816,
      type: "transport",
    },
  ];

  const searchTerm = query.toLowerCase().trim();

  return basicLocations
    .filter(
      (location) =>
        location.name.toLowerCase().includes(searchTerm) ||
        location.displayName.toLowerCase().includes(searchTerm)
    )
    .slice(0, limit);
}

// Get location details by coordinates (reverse geocoding) using backend API
export async function getLocationByCoordinates(
  lat: number,
  lng: number
): Promise<ZamboCityLocation | null> {
  try {
    // In production, use VITE_API_URL; in dev, use relative path for Vite proxy
    const apiBase = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL 
      : '';
    
    const apiUrl = `${apiBase}/api/geocoding/reverse?lat=${lat}&lon=${lng}`;

    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const result: NominatimResult = data.result;

    return {
      name: result.display_name.split(",")[0].toUpperCase(),
      displayName: result.display_name.split(",")[0],
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      type: result.type,
      importance: result.importance,
      place_id: result.place_id,
      osm_type: result.osm_type,
      osm_id: result.osm_id,
      boundingbox: result.boundingbox,
    };
  } catch (error) {
    console.error("Error getting location by coordinates:", error);
    return null;
  }
}
