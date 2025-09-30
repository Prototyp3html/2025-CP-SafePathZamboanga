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
    id: "fallback-1",
    name: "KCC Mall de Zamboanga",
    lat: 6.9156,
    lng: 122.0789,
    group: "shopping",
    categoryLabel: "Shopping Mall",
    address: "Gov. Camins Ave, Zamboanga City",
    osmTags: {},
    source: "fallback",
  },
  {
    id: "fallback-2",
    name: "Paseo del Mar",
    lat: 6.9123,
    lng: 122.0781,
    group: "leisure",
    categoryLabel: "Waterfront Park",
    address: "Valderrosa St, Zamboanga City",
    osmTags: {},
    source: "fallback",
  },
  {
    id: "fallback-3",
    name: "Ateneo de Zamboanga University",
    lat: 6.9167,
    lng: 122.0834,
    group: "education",
    categoryLabel: "University",
    address: "La Purisima St, Zamboanga City",
    osmTags: {},
    source: "fallback",
  },
  {
    id: "fallback-4",
    name: "CityMall Tetuan",
    lat: 6.9135,
    lng: 122.0995,
    group: "shopping",
    categoryLabel: "Community Mall",
    address: "Tetuan Hwy, Zamboanga City",
    osmTags: {},
    source: "fallback",
  },
  {
    id: "fallback-5",
    name: "Zamboanga City Hall",
    lat: 6.9214,
    lng: 122.079,
    group: "services",
    categoryLabel: "Government Office",
    address: "Valderrosa St, Zamboanga City",
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

const PLACE_FETCH_LIMIT = 400;
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
];

const buildTagQueries = (tag: string, values: string[]): string[] => {
  const uniqueValues = Array.from(new Set(values)).filter(Boolean);

  if (uniqueValues.length === 0) {
    return [];
  }

  const valuePattern = uniqueValues.join("|");

  return [
    `node["${tag}"~"${valuePattern}"](${BOUNDING_BOX});`,
    `way["${tag}"~"${valuePattern}"](${BOUNDING_BOX});`,
    `relation["${tag}"~"${valuePattern}"](${BOUNDING_BOX});`,
  ];
};

const OVERPASS_QUERY = (() => {
  const queryParts: string[] = [];

  queryParts.push(
    ...buildTagQueries("amenity", Object.keys(AMENITY_CATEGORY_MAP))
  );
  queryParts.push(...buildTagQueries("shop", Object.keys(SHOP_CATEGORY_MAP)));
  queryParts.push(
    ...buildTagQueries("tourism", Object.keys(TOURISM_CATEGORY_MAP))
  );
  queryParts.push(
    ...buildTagQueries("leisure", Object.keys(LEISURE_CATEGORY_MAP))
  );

  if (queryParts.length === 0) {
    return "";
  }

  return `
  [out:json][timeout:60];
  (
    ${queryParts.join("\n    ")}
  );
  out center tags ${PLACE_FETCH_LIMIT};
`;
})();

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

export async function fetchZamboangaPlaces(): Promise<ZamboangaPlace[]> {
  const now = Date.now();
  if (cachedPlaces && now - lastFetchTimestamp < CACHE_DURATION_MS) {
    return cachedPlaces;
  }

  if (!OVERPASS_QUERY) {
    cachedPlaces = FALLBACK_PLACES;
    lastFetchTimestamp = now;
    return FALLBACK_PLACES;
  }

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });

      if (!response.ok) {
        console.warn(
          `Overpass request to ${endpoint} failed with status ${response.status}`
        );
        continue;
      }

      const data = (await response.json()) as {
        elements?: OverpassElement[];
      };

      const elements = data.elements ?? [];
      if (elements.length === 0) {
        console.warn(`Overpass request to ${endpoint} returned no elements`);
        continue;
      }

      const deduped = new Map<string, ZamboangaPlace>();

      for (const element of elements) {
        const place = toPlace(element);
        if (!place) continue;

        const dedupeKey = `${place.group}|${place.name.toLowerCase()}|${place.lat.toFixed(
          5
        )}|${place.lng.toFixed(5)}`;

        if (!deduped.has(dedupeKey)) {
          deduped.set(dedupeKey, place);
        }
      }

      if (deduped.size === 0) {
        continue;
      }

      const places = Array.from(deduped.values()).sort((a, b) => {
        if (a.group === b.group) {
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        }
        return a.group.localeCompare(b.group);
      });

      cachedPlaces = places;
      lastFetchTimestamp = now;
      return places;
    } catch (error) {
      console.warn(`Overpass request to ${endpoint} failed`, error);
    }
  }

  cachedPlaces = FALLBACK_PLACES;
  lastFetchTimestamp = now;
  return cachedPlaces;
}
