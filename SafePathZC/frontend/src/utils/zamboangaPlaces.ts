const BOUNDING_BOX = "6.80,121.95,7.20,122.25"; // south,west,north,east roughly covering Zamboanga City
const CACHE_DURATION_MS = 1000 * 60 * 15; // 15 minutes

export type ZamboangaPlaceGroup =
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

export interface ZamboangaPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  group: ZamboangaPlaceGroup;
  categoryLabel: string;
  address?: string;
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


let cachedPlaces: ZamboangaPlace[] | null = null;
let lastFetchTimestamp = 0;

const FALLBACK_PLACES: ZamboangaPlace[] = [
  {
    id: "kcc-mall",
    name: "KCC Mall de Zamboanga",
    lat: 6.9156,
    lng: 122.0789,
    category: "shopping",
    address: "Gov. Camins Ave, Zamboanga City",
    description: "A major retail and lifestyle destination with supermarket, cinema, and dining strip.",
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
    description: "City center mall featuring restaurants, fashion brands, and events space.",
    minZoom: 13,
    tags: ["Mall", "Dining", "Retail"],
  },
  {
    id: "paseo-del-mar",
    name: "Paseo del Mar",
    lat: 6.9123,
    lng: 122.0781,
    category: "park",
    address: "Valderrosa St, Zamboanga City",
    description: "Waterfront promenade for sunset views, street food, and weekend events.",
    minZoom: 13,
    tags: ["Sunset", "Promenade", "Food Stalls"],
  },
  {
    id: "zamboanga-city-hall",
    name: "Zamboanga City Hall",
    lat: 6.9214,
    lng: 122.079,
    category: "government",
    address: "Valderrosa St, Zamboanga City",
    description: "Iconic Spanish colonial-era city hall fronting Plaza Rizal.",
    minZoom: 11,
    tags: ["Landmark", "History"],
  },
  {
    id: "zamboanga-airport",
    name: "Zamboanga International Airport",
    lat: 6.9224,
    lng: 122.0596,
    category: "transport",
    address: "Canelar, Zamboanga City",
    description: "Gateway airport serving Western Mindanao with daily domestic flights.",
    minZoom: 10,
    tags: ["Airport"],
  },
  {
    id: "pasonanca-park",
    name: "Pasonanca Park",
    lat: 6.9797,
    lng: 122.1061,
    category: "park",
    address: "Pasonanca Rd, Zamboanga City",
    description: "Expansive eco-park with tree house, aviary, and camping grounds.",
    minZoom: 12,
    tags: ["Nature", "Picnic", "Adventure Park"],
  },
  {
    id: "city-medical-center",
    name: "Zamboanga City Medical Center",
    lat: 6.9127,
    lng: 122.0731,
    category: "hospital",
    address: "Dr. Evangelista St, Zamboanga City",
    description: "Regional government hospital offering tertiary medical services.",
    minZoom: 12,
    tags: ["Emergency", "Tertiary Hospital"],
  },
  {
    id: "brent-hospital",
    name: "Brent Hospital & Colleges",
    lat: 6.9138,
    lng: 122.0748,
    category: "hospital",
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
    category: "church",
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
    category: "park",
    address: "Valderrosa St, Zamboanga City",
    description: "17th century Spanish fort and Marian shrine with cultural museum.",
    minZoom: 12,
    tags: ["Heritage", "Museum"],
  },
  {
    id: "big-j-restaurant",
    name: "Big J Restaurant",
    lat: 6.9564,
    lng: 122.0853,
    category: "restaurant",
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
    category: "hotel",
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
    category: "hotel",
    address: "Gov. Camins Ave, Zamboanga City",
    description: "Longstanding convention hotel near the airport with pool and dining.",
    minZoom: 13,
    tags: ["Convention", "Pool"],
  },
  {
    id: "jardin-de-antonio",
    name: "Jardin de Antonio",
    lat: 6.9465,
    lng: 122.0518,
    category: "resort",
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
    category: "park",
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
    category: "park",
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
    category: "restaurant",
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
    category: "resort",
    address: "Barangay Pasonanca, Zamboanga City",
    description: "Mountain-view resort with infinity pools and glamping.",
    minZoom: 15,
    tags: ["Infinity Pool", "Staycation"],
  },
];

const EARTH_RADIUS_METERS = 6371000;

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
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
    osmTags: {},
    source: "fallback",
  },
];

const AMENITY_CATEGORY_MAP: Record<
  string,
  { group: ZamboangaPlaceGroup; label: string }
> = {
  restaurant: { group: "food", label: "Restaurant" },
  fast_food: { group: "food", label: "Fast Food" },
  cafe: { group: "food", label: "Café" },
  bar: { group: "food", label: "Bar" },
  pub: { group: "food", label: "Pub" },
  food_court: { group: "food", label: "Food Court" },
  ice_cream: { group: "food", label: "Ice Cream Shop" },
  bakery: { group: "food", label: "Bakery" },
  hospital: { group: "health", label: "Hospital" },
  clinic: { group: "health", label: "Clinic" },
  doctors: { group: "health", label: "Medical Practice" },
  pharmacy: { group: "health", label: "Pharmacy" },
  dentist: { group: "health", label: "Dental Clinic" },
  bank: { group: "finance", label: "Bank" },
  atm: { group: "finance", label: "ATM" },
  bureau_de_change: { group: "finance", label: "Money Changer" },
  police: { group: "services", label: "Police Station" },
  fire_station: { group: "services", label: "Fire Station" },
  post_office: { group: "services", label: "Post Office" },

  bus_station: { group: "transport", label: "Bus Station" },
  ferry_terminal: { group: "transport", label: "Ferry Terminal" },
  parking: { group: "transport", label: "Parking" },
  fuel: { group: "transport", label: "Fuel Station" },
  school: { group: "education", label: "School" },
  college: { group: "education", label: "College" },
  university: { group: "education", label: "University" },
  library: { group: "education", label: "Library" },

  place_of_worship: { group: "worship", label: "Place of Worship" },
};

const TOURISM_CATEGORY_MAP: Record<
  string,
  { group: ZamboangaPlaceGroup; label: string }
> = {
  hotel: { group: "lodging", label: "Hotel" },
  guest_house: { group: "lodging", label: "Guest House" },
  hostel: { group: "lodging", label: "Hostel" },
  motel: { group: "lodging", label: "Motel" },
  resort: { group: "lodging", label: "Resort" },
  apartment: { group: "lodging", label: "Serviced Apartment" },
  attraction: { group: "leisure", label: "Attraction" },
  museum: { group: "leisure", label: "Museum" },
  theme_park: { group: "leisure", label: "Theme Park" },
  zoo: { group: "leisure", label: "Zoo" },
};

const SHOP_CATEGORY_MAP: Record<
  string,
  { group: ZamboangaPlaceGroup; label: string }
> = {
  mall: { group: "shopping", label: "Shopping Mall" },
  department_store: { group: "shopping", label: "Department Store" },
  supermarket: { group: "shopping", label: "Supermarket" },
  convenience: { group: "shopping", label: "Convenience Store" },
  bakery: { group: "food", label: "Bakery" },
  boutique: { group: "shopping", label: "Boutique" },
  clothes: { group: "shopping", label: "Clothing Store" },
  shoes: { group: "shopping", label: "Shoe Store" },
  sports: { group: "shopping", label: "Sports Store" },
  furniture: { group: "shopping", label: "Furniture Store" },
  electronics: { group: "shopping", label: "Electronics Store" },
  supermarket_hypermarket: { group: "shopping", label: "Hypermarket" },
};

const LEISURE_CATEGORY_MAP: Record<
  string,
  { group: ZamboangaPlaceGroup; label: string }
> = {
  park: { group: "leisure", label: "Park" },
  playground: { group: "leisure", label: "Playground" },
  fitness_centre: { group: "leisure", label: "Fitness Centre" },
  sports_centre: { group: "leisure", label: "Sports Centre" },
  water_park: { group: "leisure", label: "Water Park" },
  garden: { group: "leisure", label: "Garden" },

};

const OVERPASS_QUERY = `
  [out:json][timeout:60];
  (

  );
  out center tags ${PLACE_LIMIT};
`;

const titleCase = (value: string) =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const resolveCategory = (
  tags: Record<string, string>
): { group: ZamboangaPlaceGroup; label: string } | null => {
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
      group: "worship",
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

const toPlace = (element: OverpassElement): ZamboangaPlace | null => {
  if (!element.tags) {
    return null;
  }

  const coords = {
    lat: element.lat ?? element.center?.lat,
    lng: element.lon ?? element.center?.lon,
  };

  if (!coords.lat || !coords.lng) {
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
    `${category.label} (${titleCase(category.group)})`;

  return {
    id: `${element.type}-${element.id}`,
    name,
    lat: coords.lat,
    lng: coords.lng,
    group: category.group,
    categoryLabel: category.label,
    address: buildAddress(element.tags),
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
export async function fetchZamboangaPlaces(): Promise<ZamboangaPlace[]> {
  const now = Date.now();
  if (cachedPlaces && now - lastFetchTimestamp < CACHE_DURATION_MS) {
    return cachedPlaces;
  }

}
