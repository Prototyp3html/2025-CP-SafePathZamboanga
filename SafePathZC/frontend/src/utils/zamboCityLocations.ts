// Comprehensive Zamboanga City locations database
export interface ZamboCityLocation {
  name: string;
  displayName: string;
  lat: number;
  lng: number;
  type:
    | "barangay"
    | "district"
    | "landmark"
    | "commercial"
    | "government"
    | "educational"
    | "religious"
    | "transport";
  aliases?: string[];
  description?: string;
}

export const zamboCityLocations: ZamboCityLocation[] = [
  // Major Districts and Areas
  {
    name: "TETUAN",
    displayName: "Tetuan District",
    lat: 6.9214,
    lng: 122.079,
    type: "district",
    aliases: ["tetuan", "downtown"],
  },
  {
    name: "RIO HONDO",
    displayName: "Rio Hondo",
    lat: 6.9139,
    lng: 122.0791,
    type: "district",
    aliases: ["rio hondo", "hondo"],
  },
  {
    name: "ZONE IV",
    displayName: "Zone IV (Poblacion)",
    lat: 6.9069,
    lng: 122.0792,
    type: "district",
    aliases: ["zone 4", "poblacion"],
  },
  {
    name: "CAMINO NUEVO",
    displayName: "Camino Nuevo",
    lat: 6.9244,
    lng: 122.0816,
    type: "district",
    aliases: ["camino"],
  },
  {
    name: "SANTA CATALINA",
    displayName: "Santa Catalina",
    lat: 6.9163,
    lng: 122.0697,
    type: "district",
    aliases: ["sta catalina", "catalina"],
  },
  {
    name: "GUIWAN",
    displayName: "Guiwan",
    lat: 6.8969,
    lng: 122.0831,
    type: "district",
    aliases: ["guiwan"],
  },
  {
    name: "PUTIK",
    displayName: "Putik",
    lat: 6.9089,
    lng: 122.0639,
    type: "district",
    aliases: ["putik"],
  },
  {
    name: "TUMAGA",
    displayName: "Tumaga",
    lat: 6.8889,
    lng: 122.0547,
    type: "district",
    aliases: ["tumaga"],
  },

  // Major Barangays
  {
    name: "BALIWASAN",
    displayName: "Barangay Baliwasan",
    lat: 6.932,
    lng: 122.0456,
    type: "barangay",
    aliases: ["baliwasan"],
  },
  {
    name: "SINUNUC",
    displayName: "Barangay Sinunuc",
    lat: 6.9456,
    lng: 122.0623,
    type: "barangay",
    aliases: ["sinunuc"],
  },
  {
    name: "AYALA",
    displayName: "Barangay Ayala",
    lat: 6.9178,
    lng: 122.0834,
    type: "barangay",
    aliases: ["ayala"],
  },
  {
    name: "CANELAR",
    displayName: "Barangay Canelar",
    lat: 6.9456,
    lng: 122.0912,
    type: "barangay",
    aliases: ["canelar"],
  },
  {
    name: "CULIANAN",
    displayName: "Barangay Culianan",
    lat: 6.9123,
    lng: 122.0456,
    type: "barangay",
    aliases: ["culianan"],
  },
  {
    name: "DIVISORIA",
    displayName: "Barangay Divisoria",
    lat: 6.9089,
    lng: 122.0745,
    type: "barangay",
    aliases: ["divisoria"],
  },
  {
    name: "KASANYANGAN",
    displayName: "Barangay Kasanyangan",
    lat: 6.9378,
    lng: 122.0534,
    type: "barangay",
    aliases: ["kasanyangan"],
  },
  {
    name: "LA PAZ",
    displayName: "Barangay La Paz",
    lat: 6.8967,
    lng: 122.0612,
    type: "barangay",
    aliases: ["la paz", "lapaz"],
  },
  {
    name: "MAMPANG",
    displayName: "Barangay Mampang",
    lat: 6.9234,
    lng: 122.0723,
    type: "barangay",
    aliases: ["mampang"],
  },
  {
    name: "MANICAHAN",
    displayName: "Barangay Manicahan",
    lat: 6.9345,
    lng: 122.0678,
    type: "barangay",
    aliases: ["manicahan"],
  },
  {
    name: "RECODO",
    displayName: "Barangay Recodo",
    lat: 6.8912,
    lng: 122.0789,
    type: "barangay",
    aliases: ["recodo"],
  },
  {
    name: "SAN JOSE GUSU",
    displayName: "Barangay San Jose Gusu",
    lat: 6.9456,
    lng: 122.0789,
    type: "barangay",
    aliases: ["san jose gusu", "gusu"],
  },
  {
    name: "SAN ROQUE",
    displayName: "Barangay San Roque",
    lat: 6.9012,
    lng: 122.0623,
    type: "barangay",
    aliases: ["san roque"],
  },
  {
    name: "TUGBUNGAN",
    displayName: "Barangay Tugbungan",
    lat: 6.9234,
    lng: 122.0567,
    type: "barangay",
    aliases: ["tugbungan"],
  },

  // Government Buildings
  {
    name: "ZAMBOANGA CITY HALL",
    displayName: "Zamboanga City Hall",
    lat: 6.9214,
    lng: 122.079,
    type: "government",
    aliases: ["city hall", "municipal hall"],
  },
  {
    name: "PROVINCIAL CAPITOL",
    displayName: "Zamboanga del Sur Provincial Capitol",
    lat: 6.9189,
    lng: 122.0756,
    type: "government",
    aliases: ["capitol", "provincial capitol"],
  },
  {
    name: "REGIONAL TRIAL COURT",
    displayName: "Regional Trial Court Zamboanga",
    lat: 6.9201,
    lng: 122.0812,
    type: "government",
    aliases: ["rtc", "court", "trial court"],
  },
  {
    name: "BIR ZAMBOANGA",
    displayName: "Bureau of Internal Revenue - Zamboanga",
    lat: 6.9167,
    lng: 122.0798,
    type: "government",
    aliases: ["bir", "internal revenue"],
  },
  {
    name: "COMELEC ZAMBOANGA",
    displayName: "COMELEC Zamboanga City",
    lat: 6.9203,
    lng: 122.0785,
    type: "government",
    aliases: ["comelec", "election office"],
  },

  // Educational Institutions
  {
    name: "ATENEO DE ZAMBOANGA",
    displayName: "Ateneo de Zamboanga University",
    lat: 6.9167,
    lng: 122.0834,
    type: "educational",
    aliases: ["adzu", "ateneo zamboanga", "ateneo"],
  },
  {
    name: "WMSU",
    displayName: "Western Mindanao State University",
    lat: 6.9078,
    lng: 122.0656,
    type: "educational",
    aliases: [
      "western mindanao",
      "state university",
      "wmsu",
      "western mindanao university",
      "west mindanao",
    ],
  },
  {
    name: "UZ",
    displayName: "University of Zamboanga",
    lat: 6.9145,
    lng: 122.0789,
    type: "educational",
    aliases: ["university of zamboanga", "univ zamboanga"],
  },
  {
    name: "CLSU ZAMBOANGA",
    displayName: "Central Luzon State University - Zamboanga",
    lat: 6.9234,
    lng: 122.0712,
    type: "educational",
    aliases: ["clsu", "central luzon"],
  },
  {
    name: "BRENT INTERNATIONAL SCHOOL",
    displayName: "Brent International School Zamboanga",
    lat: 6.9312,
    lng: 122.0623,
    type: "educational",
    aliases: ["brent", "international school"],
  },

  // Medical/Health Facilities
  {
    name: "ZAMBOANGA CITY MEDICAL CENTER",
    displayName: "Zamboanga City Medical Center",
    lat: 6.9089,
    lng: 122.0723,
    type: "government",
    aliases: ["zcmc", "medical center", "city hospital"],
  },
  {
    name: "BRENT HOSPITAL",
    displayName: "Brent Hospital",
    lat: 6.9298,
    lng: 122.0634,
    type: "government",
    aliases: ["brent hospital"],
  },
  {
    name: "ZAMBOANGA PENINSULA MEDICAL CENTER",
    displayName: "Zamboanga Peninsula Medical Center",
    lat: 6.9156,
    lng: 122.0845,
    type: "government",
    aliases: ["zpmc", "peninsula medical"],
  },

  // Transportation Hubs
  {
    name: "ZAMBOANGA AIRPORT",
    displayName: "Zamboanga International Airport",
    lat: 6.9224,
    lng: 122.0596,
    type: "transport",
    aliases: ["airport", "international airport", "zam airport"],
  },
  {
    name: "ZAMBOANGA PORT",
    displayName: "Zamboanga Port",
    lat: 6.9244,
    lng: 122.0816,
    type: "transport",
    aliases: ["port", "seaport", "wharf"],
  },
  {
    name: "CANELAR WHARF",
    displayName: "Canelar Wharf",
    lat: 6.9456,
    lng: 122.0923,
    type: "transport",
    aliases: ["canelar port", "wharf"],
  },
  {
    name: "CENTRAL BUS TERMINAL",
    displayName: "Zamboanga Central Bus Terminal",
    lat: 6.9134,
    lng: 122.0756,
    type: "transport",
    aliases: ["bus terminal", "central terminal"],
  },

  // Commercial Centers & Malls
  {
    name: "KCC MALL",
    displayName: "KCC Mall of Zamboanga",
    lat: 6.9156,
    lng: 122.0789,
    type: "commercial",
    aliases: ["kcc", "kcc mall", "mall"],
  },
  {
    name: "MINDPRO CITIMALL",
    displayName: "Mindpro Citimall",
    lat: 6.9089,
    lng: 122.0712,
    type: "commercial",
    aliases: ["citimall", "mindpro"],
  },
  {
    name: "GARDEN ORCHID HOTEL",
    displayName: "Garden Orchid Hotel",
    lat: 6.9201,
    lng: 122.0823,
    type: "commercial",
    aliases: ["garden orchid", "orchid hotel"],
  },
  {
    name: "LANTAKA HOTEL",
    displayName: "Lantaka Hotel by the Sea",
    lat: 6.9267,
    lng: 122.0845,
    type: "commercial",
    aliases: ["lantaka", "lantaka hotel"],
  },

  // Religious Sites
  {
    name: "ZAMBOANGA CATHEDRAL",
    displayName: "Metropolitan Cathedral of the Immaculate Conception",
    lat: 6.9212,
    lng: 122.0798,
    type: "religious",
    aliases: ["cathedral", "zambo cathedral", "immaculate conception"],
  },
  {
    name: "PINK MOSQUE",
    displayName: "Sheik Karimal Masjid (Pink Mosque)",
    lat: 6.9145,
    lng: 122.0823,
    type: "religious",
    aliases: ["pink mosque", "masjid", "sheik karimal"],
  },
  {
    name: "SANTO ROSARIO CHURCH",
    displayName: "Santo Rosario Church",
    lat: 6.9178,
    lng: 122.0767,
    type: "religious",
    aliases: ["santo rosario", "rosario church"],
  },

  // Parks and Recreation
  {
    name: "PLAZA PERSHING",
    displayName: "Plaza Pershing",
    lat: 6.9201,
    lng: 122.0789,
    type: "landmark",
    aliases: ["pershing", "plaza"],
  },
  {
    name: "PASEO DEL MAR",
    displayName: "Paseo del Mar",
    lat: 6.9278,
    lng: 122.0856,
    type: "landmark",
    aliases: ["paseo", "del mar", "waterfront"],
  },
  {
    name: "PASONANCA PARK",
    displayName: "Pasonanca Park",
    lat: 6.9389,
    lng: 122.0534,
    type: "landmark",
    aliases: ["pasonanca", "park"],
  },

  // Markets
  {
    name: "BARTER TRADE CENTER",
    displayName: "Zamboanga Barter Trade Center",
    lat: 6.9234,
    lng: 122.0834,
    type: "commercial",
    aliases: ["barter trade", "barter", "trade center"],
  },
  {
    name: "CENTRAL MARKET",
    displayName: "Zamboanga Central Market",
    lat: 6.9167,
    lng: 122.0789,
    type: "commercial",
    aliases: ["central market", "market"],
  },
  {
    name: "TALUKSANGAY MARKET",
    displayName: "Taluksangay Market",
    lat: 6.9312,
    lng: 122.0456,
    type: "commercial",
    aliases: ["taluksangay", "taluk market"],
  },

  // Industrial Areas
  {
    name: "ZAMBOANGA ECOZONE",
    displayName: "Zamboanga Economic Zone",
    lat: 6.9456,
    lng: 122.0345,
    type: "commercial",
    aliases: ["ecozone", "economic zone", "industrial"],
  },
  {
    name: "FREEPORT",
    displayName: "Zamboanga City Special Economic Zone",
    lat: 6.9523,
    lng: 122.0298,
    type: "commercial",
    aliases: ["freeport", "special economic zone"],
  },
];

// Function to search Zamboanga locations
export const searchZamboCityLocations = (
  query: string,
  limit: number = 10
): ZamboCityLocation[] => {
  if (!query || query.length < 2) return [];

  const searchTerm = query.toLowerCase().trim();
  const results: Array<ZamboCityLocation & { score: number }> = [];

  zamboCityLocations.forEach((location) => {
    let score = 0;

    // Exact name match (highest priority)
    if (location.name.toLowerCase() === searchTerm) {
      score += 100;
    }
    // Display name exact match
    else if (location.displayName.toLowerCase() === searchTerm) {
      score += 90;
    }
    // Name starts with search term
    else if (location.name.toLowerCase().startsWith(searchTerm)) {
      score += 80;
    }
    // Display name starts with search term
    else if (location.displayName.toLowerCase().startsWith(searchTerm)) {
      score += 70;
    }
    // Name contains search term
    else if (location.name.toLowerCase().includes(searchTerm)) {
      score += 60;
    }
    // Display name contains search term
    else if (location.displayName.toLowerCase().includes(searchTerm)) {
      score += 50;
    }

    // Check aliases
    if (location.aliases) {
      location.aliases.forEach((alias) => {
        if (alias.toLowerCase() === searchTerm) {
          score += 85;
        } else if (alias.toLowerCase().startsWith(searchTerm)) {
          score += 65;
        } else if (alias.toLowerCase().includes(searchTerm)) {
          score += 45;
        }
      });
    }

    // Boost popular locations
    const popularLocations = [
      "CITY HALL",
      "KCC MALL",
      "AIRPORT",
      "PORT",
      "ATENEO",
      "WMSU",
    ];
    if (popularLocations.some((pop) => location.name.includes(pop))) {
      score += 10;
    }

    if (score > 0) {
      results.push({ ...location, score });
    }
  });

  // Sort by score (descending) and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...location }) => location);
};

// Function to get location by coordinates (reverse lookup)
export const getLocationByCoordinates = (
  lat: number,
  lng: number,
  radiusKm: number = 1
): ZamboCityLocation | null => {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;

  for (const location of zamboCityLocations) {
    const dLat = toRadians(lat - location.lat);
    const dLng = toRadians(lng - location.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(location.lat)) *
        Math.cos(toRadians(lat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusKm * c;

    if (distance <= radiusKm) {
      return location;
    }
  }

  return null;
};
