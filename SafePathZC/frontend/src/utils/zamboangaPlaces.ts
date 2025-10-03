const BOUNDING_BOX = "6.80,121.95,7.20,122.25"; // south,west,north,east roughly covering Zamboanga City
const CACHE_DURATION_MS = 1000 * 60 * 15; // 15 minutes
const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const PLACE_LIMIT = 250;
const DEFAULT_DYNAMIC_MIN_ZOOM = 15;

export type PlaceCategory =
  | "food"
  | "lodging"
  | "shopping"
  | "health"
  | "education"
  | "services"
  | "finance"
  | "leisure"
  | "worship"
  | "transport";

export interface PlaceDefinition {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  minZoom: number;
  address?: string;
  description?: string;
  tags?: string[];
  categoryLabel: string;
  osmTags: Record<string, string>;
  source: "overpass" | "fallback";
}

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  type: "node" | "way" | "relation";
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export const PLACE_CATEGORY_STYLES: Record<
  PlaceCategory,
  { label: string; emoji: string; color: string }
> = {
  food: { label: "Food & Dining", emoji: "🍽️", color: "#f2545b" },
  lodging: { label: "Hotels & Stays", emoji: "🏨", color: "#6c5ce7" },
  shopping: { label: "Shopping", emoji: "🛍️", color: "#f4a261" },
  health: { label: "Health Services", emoji: "🏥", color: "#e63946" },
  education: { label: "Education", emoji: "🎓", color: "#457b9d" },
  services: { label: "Public Services", emoji: "🏛️", color: "#8d99ae" },
  finance: { label: "Finance", emoji: "🏦", color: "#2d6a4f" },
  leisure: { label: "Leisure & Parks", emoji: "🌳", color: "#2a9d8f" },
  worship: { label: "Worship", emoji: "⛪", color: "#b56576" },
  transport: { label: "Transport", emoji: "🚍", color: "#ffb703" },
};

type RawFallbackPlace = Omit<
  PlaceDefinition,
  "source" | "categoryLabel" | "osmTags"
> & {
  categoryLabel?: string;
  osmTags?: Record<string, string>;
};

const RAW_FALLBACK_PLACES: RawFallbackPlace[] = [
  {
    id: "kcc-mall",
    name: "KCC Mall de Zamboanga",
    lat: 6.9156,
    lng: 122.0789,
    category: "shopping",
    address: "Gov. Camins Ave, Zamboanga City",
    description:
      "A major retail and lifestyle destination with supermarket, cinema, and dining strip.",
    minZoom: 12,
    tags: ["Shopping", "Dining", "Cinema"],
  },
  {
    id: "sm-mindpro",
    name: "SM City Mindpro",
    lat: 6.9117,
    lng: 122.0768,
    category: "shopping",
    address: "La Purisima St, Zamboanga City",
    description:
      "City center mall featuring restaurants, fashion brands, and events space.",
    minZoom: 13,
    tags: ["Mall", "Dining", "Retail"],
  },
  {
    id: "paseo-del-mar",
    name: "Paseo del Mar",
    lat: 6.9123,
    lng: 122.0781,
    category: "leisure",
    address: "Valderrosa St, Zamboanga City",
    description:
      "Waterfront promenade for sunset views, street food, and weekend events.",
    minZoom: 13,
    tags: ["Sunset", "Promenade", "Food Stalls"],
  },
  {
    id: "zamboanga-city-hall",
    name: "Zamboanga City Hall",
    lat: 6.9214,
    lng: 122.079,
    category: "services",
    address: "Valderrosa St, Zamboanga City",
    description: "Iconic Spanish colonial-era city hall fronting Plaza Rizal.",
    minZoom: 11,
    tags: ["Landmark", "History"],
    categoryLabel: "Government Center",
  },
  {
    id: "zamboanga-airport",
    name: "Zamboanga International Airport",
    lat: 6.9224,
    lng: 122.0596,
    category: "transport",
    address: "Canelar, Zamboanga City",
    description:
      "Gateway airport serving Western Mindanao with daily domestic flights.",
    minZoom: 10,
    tags: ["Airport"],
  },
  {
    id: "pasonanca-park",
    name: "Pasonanca Park",
    lat: 6.9797,
    lng: 122.1061,
    category: "leisure",
    address: "Pasonanca Rd, Zamboanga City",
    description:
      "Expansive eco-park with tree house, aviary, and camping grounds.",
    minZoom: 12,
    tags: ["Nature", "Picnic", "Adventure Park"],
  },
  {
    id: "city-medical-center",
    name: "Zamboanga City Medical Center",
    lat: 6.9127,
    lng: 122.0731,
    category: "health",
    address: "Dr. Evangelista St, Zamboanga City",
    description:
      "Regional government hospital offering tertiary medical services.",
    minZoom: 12,
    tags: ["Emergency", "Tertiary Hospital"],
  },
  {
    id: "brent-hospital",
    name: "Brent Hospital & Colleges",
    lat: 6.9138,
    lng: 122.0748,
    category: "health",
    address: "Veterans Ave, Zamboanga City",
    description: "Private hospital with medical and nursing college campus.",
    minZoom: 13,
    tags: ["Private Hospital"],
  },
  {
    id: "adzu",
    name: "Ateneo de Zamboanga University",
    lat: 6.9167,
    lng: 122.0834,
    category: "education",
    address: "La Purisima St, Zamboanga City",
    description: "Jesuit university offering basic to graduate education.",
    minZoom: 12,
    tags: ["University", "Jesuit"],
  },
  {
    id: "westmin-stateu",
    name: "Western Mindanao State University",
    lat: 6.9106,
    lng: 122.0615,
    category: "education",
    address: "Normal Rd, Baliwasan, Zamboanga City",
    description: "Flagship state university with wide academic programs.",
    minZoom: 12,
    tags: ["State University"],
  },
  {
    id: "metropolitan-cathedral",
    name: "Metropolitan Cathedral of Immaculate Conception",
    lat: 6.9087,
    lng: 122.0748,
    category: "worship",
    address: "Campaner St, Zamboanga City",
    description: "Modern cathedral and Catholic pilgrimage site.",
    minZoom: 13,
    tags: ["Catholic", "Landmark"],
  },
  {
    id: "fort-pilar",
    name: "Fort Pilar Shrine & Museum",
    lat: 6.9042,
    lng: 122.0797,
    category: "leisure",
    address: "Valderrosa St, Zamboanga City",
    description:
      "17th century Spanish fort and Marian shrine with cultural museum.",
    minZoom: 12,
    tags: ["Heritage", "Museum"],
  },
  {
    id: "big-j-restaurant",
    name: "Big J Restaurant",
    lat: 6.9564,
    lng: 122.0853,
    category: "food",
    address: "Gov. Camins Ave, Zamboanga City",
    description: "Homegrown Filipino-Chinese restaurant popular with families.",
    minZoom: 14,
    tags: ["Filipino", "Family Dining"],
  },
  {
    id: "seda-hotel",
    name: "Seda Hotel MindPro",
    lat: 6.9116,
    lng: 122.0762,
    category: "lodging",
    address: "La Purisima St, Zamboanga City",
    description: "Contemporary business hotel connected to the mall podium.",
    minZoom: 13,
    tags: ["Business Hotel"],
  },
  {
    id: "garden-orchids",
    name: "Garden Orchid Hotel",
    lat: 6.9087,
    lng: 122.0609,
    category: "lodging",
    address: "Gov. Camins Ave, Zamboanga City",
    description:
      "Longstanding convention hotel near the airport with pool and dining.",
    minZoom: 13,
    tags: ["Convention", "Pool"],
  },
  {
    id: "jardin-de-antonio",
    name: "Jardin de Antonio",
    lat: 6.9465,
    lng: 122.0518,
    category: "leisure",
    address: "Pasonanca, Zamboanga City",
    description: "Garden resort and event venue tucked in the hills of Pasonanca.",
    minZoom: 15,
    tags: ["Events", "Garden"],
  },
  {
    id: "merloquet-falls",
    name: "Merloquet Falls Visitor Hub",
    lat: 7.0067,
    lng: 122.2349,
    category: "leisure",
    address: "Barangay Sibulao, Zamboanga City",
    description: "Jump-off area for the famed multi-tier Merloquet Falls.",
    minZoom: 11,
    tags: ["Waterfalls", "Nature"],
  },
  {
    id: "city-bus-terminal",
    name: "Zamboanga City Integrated Bus Terminal",
    lat: 6.9543,
    lng: 122.0616,
    category: "transport",
    address: "Divisoria, Zamboanga City",
    description: "Gateway terminal for provincial and regional bus routes.",
    minZoom: 11,
    tags: ["Transit", "Buses"],
  },
  {
    id: "gov-ramon-sports",
    name: "Gov. Ramos Sports Complex",
    lat: 6.9139,
    lng: 122.0823,
    category: "leisure",
    address: "Sta. Maria, Zamboanga City",
    description: "Athletic oval with community sports and wellness programs.",
    minZoom: 13,
    tags: ["Sports", "Running"],
  },
  {
    id: "vivaldi-coffee",
    name: "Vivaldi Coffee Shop",
    lat: 6.9112,
    lng: 122.0831,
    category: "food",
    address: "La Purisima St, Zamboanga City",
    description: "Intimate café known for native blends and pastries.",
    minZoom: 15,
    tags: ["Cafe", "Local Beans"],
  },
  {
    id: "marianas-hill",
    name: "Mariana's Hill",
    lat: 7.0032,
    lng: 122.1025,
    category: "lodging",
    address: "Barangay Pasonanca, Zamboanga City",
    description: "Mountain-view resort with infinity pools and glamping.",
    minZoom: 15,
    tags: ["Infinity Pool", "Staycation"],
  },
];

const FALLBACK_PLACES: PlaceDefinition[] = RAW_FALLBACK_PLACES.map((place) => ({
  ...place,
  source: "fallback" as const,
  categoryLabel:
    place.categoryLabel ?? PLACE_CATEGORY_STYLES[place.category].label,
  osmTags: place.osmTags ?? {},
}));

export const ZAMBOANGA_PLACES: PlaceDefinition[] = FALLBACK_PLACES;

let cachedPlaces: PlaceDefinition[] | null = null;
let lastFetchTimestamp = 0;

const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const distanceInMeters = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
};

const AMENITY_CATEGORY_MAP: Record<
  string,
  { category: PlaceCategory; label: string }
> = {
  restaurant: { category: "food", label: "Restaurant" },
  fast_food: { category: "food", label: "Fast Food" },
  cafe: { category: "food", label: "Café" },
  bar: { category: "food", label: "Bar" },
  pub: { category: "food", label: "Pub" },
  food_court: { category: "food", label: "Food Court" },
  ice_cream: { category: "food", label: "Ice Cream Shop" },
  bakery: { category: "food", label: "Bakery" },
  hospital: { category: "health", label: "Hospital" },
  clinic: { category: "health", label: "Clinic" },
  doctors: { category: "health", label: "Medical Practice" },
  pharmacy: { category: "health", label: "Pharmacy" },
  dentist: { category: "health", label: "Dental Clinic" },
  bank: { category: "finance", label: "Bank" },
  atm: { category: "finance", label: "ATM" },
  bureau_de_change: { category: "finance", label: "Money Changer" },
  police: { category: "services", label: "Police Station" },
  fire_station: { category: "services", label: "Fire Station" },
  post_office: { category: "services", label: "Post Office" },
  bus_station: { category: "transport", label: "Bus Station" },
  ferry_terminal: { category: "transport", label: "Ferry Terminal" },
  parking: { category: "transport", label: "Parking" },
  fuel: { category: "transport", label: "Fuel Station" },
  school: { category: "education", label: "School" },
  college: { category: "education", label: "College" },
  university: { category: "education", label: "University" },
  library: { category: "education", label: "Library" },
  place_of_worship: { category: "worship", label: "Place of Worship" },
};

const TOURISM_CATEGORY_MAP: Record<
  string,
  { category: PlaceCategory; label: string }
> = {
  hotel: { category: "lodging", label: "Hotel" },
  guest_house: { category: "lodging", label: "Guest House" },
  hostel: { category: "lodging", label: "Hostel" },
  motel: { category: "lodging", label: "Motel" },
  resort: { category: "lodging", label: "Resort" },
  apartment: { category: "lodging", label: "Serviced Apartment" },
  attraction: { category: "leisure", label: "Attraction" },
  museum: { category: "leisure", label: "Museum" },
  theme_park: { category: "leisure", label: "Theme Park" },
  zoo: { category: "leisure", label: "Zoo" },
};

const SHOP_CATEGORY_MAP: Record<
  string,
  { category: PlaceCategory; label: string }
> = {
  mall: { category: "shopping", label: "Shopping Mall" },
  department_store: { category: "shopping", label: "Department Store" },
  supermarket: { category: "shopping", label: "Supermarket" },
  convenience: { category: "shopping", label: "Convenience Store" },
  bakery: { category: "food", label: "Bakery" },
  boutique: { category: "shopping", label: "Boutique" },
  clothes: { category: "shopping", label: "Clothing Store" },
  shoes: { category: "shopping", label: "Shoe Store" },
  sports: { category: "shopping", label: "Sports Store" },
  furniture: { category: "shopping", label: "Furniture Store" },
  electronics: { category: "shopping", label: "Electronics Store" },
  supermarket_hypermarket: { category: "shopping", label: "Hypermarket" },
};

const LEISURE_CATEGORY_MAP: Record<
  string,
  { category: PlaceCategory; label: string }
> = {
  park: { category: "leisure", label: "Park" },
  playground: { category: "leisure", label: "Playground" },
  fitness_centre: { category: "leisure", label: "Fitness Centre" },
  sports_centre: { category: "leisure", label: "Sports Centre" },
  water_park: { category: "leisure", label: "Water Park" },
  garden: { category: "leisure", label: "Garden" },
};

const OVERPASS_QUERY = `
  [out:json][timeout:60];
  (
    node["amenity"](${BOUNDING_BOX});
    node["tourism"](${BOUNDING_BOX});
    node["shop"](${BOUNDING_BOX});
    node["leisure"](${BOUNDING_BOX});
    way["amenity"](${BOUNDING_BOX});
    way["tourism"](${BOUNDING_BOX});
    way["shop"](${BOUNDING_BOX});
    way["leisure"](${BOUNDING_BOX});
  );
  out center ${PLACE_LIMIT};
`;

const titleCase = (value: string) =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const resolveCategory = (
  tags: Record<string, string>
): { category: PlaceCategory; label: string } | null => {
  const amenity = tags.amenity;
  if (amenity && AMENITY_CATEGORY_MAP[amenity]) {
    return AMENITY_CATEGORY_MAP[amenity];
  }

  const tourism = tags.tourism;
  if (tourism && TOURISM_CATEGORY_MAP[tourism]) {
    return TOURISM_CATEGORY_MAP[tourism];
  }

  const shop = tags.shop;
  if (shop && SHOP_CATEGORY_MAP[shop]) {
    return SHOP_CATEGORY_MAP[shop];
  }

  const leisure = tags.leisure;
  if (leisure && LEISURE_CATEGORY_MAP[leisure]) {
    return LEISURE_CATEGORY_MAP[leisure];
  }

  if (amenity === "place_of_worship" && tags.religion) {
    return {
      category: "worship",
      label: `${titleCase(tags.religion)} Place of Worship`,
    };
  }

  return null;
};

const buildAddress = (tags: Record<string, string>): string | undefined => {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : undefined;
};

const toPlace = (element: OverpassElement): PlaceDefinition | null => {
  if (!element.tags) {
    return null;
  }

  const coords = {
    lat: element.lat ?? element.center?.lat,
    lng: element.lon ?? element.center?.lon,
  };

  if (coords.lat == null || coords.lng == null) {
    return null;
  }

  const category = resolveCategory(element.tags);
  if (!category) {
    return null;
  }

  const name =
    element.tags.name ||
    element.tags["name:en"] ||
    element.tags.brand ||
    element.tags.operator ||
    `${category.label} (${titleCase(category.category)})`;

  return {
    id: `${element.type}-${element.id}`,
    name,
    lat: coords.lat,
    lng: coords.lng,
    category: category.category,
    categoryLabel: category.label,
    minZoom: DEFAULT_DYNAMIC_MIN_ZOOM,
    address: buildAddress(element.tags),
    tags: undefined,
    osmTags: element.tags,
    source: "overpass",
  };
};

export const getPlacesVisibleAtZoom = (zoom: number) =>
  ZAMBOANGA_PLACES.filter((place) => zoom >= place.minZoom);

export const findNearestPlace = (
  lat: number,
  lng: number,
  maxDistanceMeters = 450
): { place: PlaceDefinition; distance: number } | null => {
  let nearest: { place: PlaceDefinition; distance: number } | null = null;
  for (const place of ZAMBOANGA_PLACES) {
    const distance = distanceInMeters({ lat, lng }, place);
    if (distance <= maxDistanceMeters) {
      if (!nearest || distance < nearest.distance) {
        nearest = { place, distance };
      }
    }
  }
  return nearest;
};

export async function fetchZamboangaPlaces(): Promise<PlaceDefinition[]> {
  const now = Date.now();
  if (cachedPlaces && now - lastFetchTimestamp < CACHE_DURATION_MS) {
    return cachedPlaces;
  }

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: "POST",
      body: new URLSearchParams({ data: OVERPASS_QUERY.trim() }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
    });

    if (!response.ok) {
      throw new Error(`Overpass request failed with status ${response.status}`);
    }

    const data = (await response.json()) as {
      elements?: OverpassElement[];
    };

    const dynamicPlaces = (data.elements ?? [])
      .map(toPlace)
      .filter((place): place is PlaceDefinition => Boolean(place));

    const uniqueFallback = new Map(
      ZAMBOANGA_PLACES.map((place) => [place.id, place] as const)
    );

    for (const place of dynamicPlaces) {
      uniqueFallback.set(place.id, place);
    }

    cachedPlaces = Array.from(uniqueFallback.values());
  } catch (error) {
    console.warn("Failed to load Overpass data, using fallback places", error);
    cachedPlaces = [...ZAMBOANGA_PLACES];
  }

  lastFetchTimestamp = now;
  return cachedPlaces;
}
