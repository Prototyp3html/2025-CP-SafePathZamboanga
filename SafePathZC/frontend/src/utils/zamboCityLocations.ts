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

// Overpass API response interface for places
interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    amenity?: string;
    shop?: string;
    tourism?: string;
    leisure?: string;
    historic?: string;
    [key: string]: string | undefined;
  };
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// Search locations using both Nominatim and Overpass APIs
export async function searchZamboCityLocations(
  query: string,
  limit: number = 10
): Promise<ZamboCityLocation[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  try {
    // Run both Nominatim and Overpass searches in parallel
    const [nominatimResults, overpassResults] = await Promise.all([
      searchNominatim(query, limit),
      searchOverpassAPI(query, limit),
    ]);

    // Combine results: prioritize Nominatim, then add Overpass results
    const combinedResults = [
      ...nominatimResults,
      ...overpassResults.filter(
        (overpassResult) =>
          !nominatimResults.some(
            (nomResult) =>
              nomResult.lat === overpassResult.lat &&
              nomResult.lng === overpassResult.lng
          )
      ),
    ].slice(0, limit);

    console.log(
      `✅ Combined search results: ${nominatimResults.length} from Nominatim + ${overpassResults.length} from Overpass`
    );

    if (combinedResults.length > 0) {
      return combinedResults;
    }

    // Fallback to basic locations if both APIs fail
    console.log(`⚠️ No results from APIs, trying fallback locations for: "${query}"`);
    return getBasicZamboCityLocations(query, limit);
  } catch (error) {
    console.error("Error searching locations:", error);
    return getBasicZamboCityLocations(query, limit);
  }
}

// Search using Nominatim API
async function searchNominatim(
  query: string,
  limit: number
): Promise<ZamboCityLocation[]> {
  try {
    const apiBase = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : "";
    const apiUrl = `${apiBase}/api/geocoding/search?q=${encodeURIComponent(
      query.trim()
    )}&limit=${limit}`;

    console.log(`🌐 Nominatim search: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`❌ Nominatim API returned status ${response.status}`);
      return [];
    }

    const responseText = await response.text();
    console.log(
      `📄 Nominatim response (first 200 chars): ${responseText.substring(
        0,
        200
      )}`
    );

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ Nominatim JSON parse error: ${parseError}`);
      return [];
    }

    const results: NominatimResult[] = data.results || [];

    console.log(
      `📊 Nominatim Response for "${query}": ${results.length} results`
    );

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

    return zamboCityResults;
  } catch (error) {
    console.error("Error searching Nominatim:", error);
    return [];
  }
}

// Search using Overpass API for specific place types
async function searchOverpassAPI(
  query: string,
  limit: number
): Promise<ZamboCityLocation[]> {
  try {
    // Zamboanga City bounding box (south, west, north, east)
    const south = 6.85;
    const west = 121.95;
    const north = 7.15;
    const east = 122.30;

    const searchTerm = query.trim();

    // Build exact tag match query (this works reliably)
    const exactTagQuery = `[out:json];
(
  node["amenity"="${searchTerm}"](${south},${west},${north},${east});
  node["shop"="${searchTerm}"](${south},${west},${north},${east});
  node["tourism"="${searchTerm}"](${south},${west},${north},${east});
  node["leisure"="${searchTerm}"](${south},${west},${north},${east});
  way["amenity"="${searchTerm}"](${south},${west},${north},${east});
  way["shop"="${searchTerm}"](${south},${west},${north},${east});
);
out body center;`;

    console.log(`🌐 Overpass API search for: "${searchTerm}"`);

    try {
      // Try exact tag match first
      const exactResponse = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: exactTagQuery,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });

      let results: ZamboCityLocation[] = [];

      if (exactResponse.ok) {
        const exactData: OverpassResponse = await exactResponse.json();
        results = convertOverpassElements(exactData.elements || []);
        console.log(
          `📊 Overpass exact tag match for "${searchTerm}": ${results.length} elements`
        );
      }

      // If exact match returned few results, try searching by name using wildcard
      if (results.length < limit) {
        try {
          // Use wildcard search instead of regex to avoid 400 errors
          const nameSearchQuery = `[out:json];
(
  node["name"](${south},${west},${north},${east});
  way["name"](${south},${west},${north},${east});
);
out body center;`;

          const nameResponse = await fetch("https://overpass-api.de/api/interpreter", {
            method: "POST",
            body: nameSearchQuery,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          });

          if (nameResponse.ok) {
            const nameData: OverpassResponse = await nameResponse.json();
            const allNamedElements = nameData.elements || [];
            
            // Filter client-side for name matches
            const nameResults = allNamedElements
              .filter(el => {
                const name = el.tags?.name || "";
                return name.toLowerCase().includes(searchTerm.toLowerCase());
              })
              .slice(0, limit - results.length);
            
            const convertedResults = convertOverpassElements(nameResults);
            
            // Combine results, avoiding duplicates
            const resultMap = new Map(results.map(r => [`${r.lat},${r.lng}`, r]));
            convertedResults.forEach(r => {
              const key = `${r.lat},${r.lng}`;
              if (!resultMap.has(key)) {
                resultMap.set(key, r);
              }
            });
            
            results = Array.from(resultMap.values());
            console.log(
              `📊 Overpass name search for "${searchTerm}": ${convertedResults.length} additional elements`
            );
          }
        } catch (nameError) {
          console.debug("Name-based search failed, continuing with tag match results");
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      console.error("Error searching Overpass API:", error);
      return [];
    }
  } catch (error) {
    console.error("Error in searchOverpassAPI:", error);
    return [];
  }
}

// Helper function to convert Overpass elements to ZamboCityLocation
function convertOverpassElements(elements: OverpassElement[]): ZamboCityLocation[] {
  return elements
    .filter((element) => {
      const tags = element.tags || {};
      return tags.name; // Only include elements with names
    })
    .map((element) => {
      const tags = element.tags || {};
      const lat = element.lat || element.center?.lat || 0;
      const lon = element.lon || element.center?.lon || 0;

      // Determine type from tags
      let type = element.type;
      if (tags.amenity) type = tags.amenity;
      else if (tags.shop) type = tags.shop;
      else if (tags.tourism) type = tags.tourism;
      else if (tags.leisure) type = tags.leisure;
      else if (tags.historic) type = tags.historic;

      return {
        name: (tags.name || "Unknown Place").toUpperCase(),
        displayName: tags.name || "Unknown Place",
        lat,
        lng: lon,
        type,
        osm_type: element.type,
        osm_id: element.id.toString(),
      };
    });
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
