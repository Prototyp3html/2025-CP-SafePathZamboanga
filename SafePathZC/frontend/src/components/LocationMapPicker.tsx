import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  searchZamboCityLocations,
  type ZamboCityLocation,
} from "../utils/zamboCityLocations";

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/icons/location.png",
  iconUrl: "/icons/location.png",
  shadowUrl: "/icons/location.png",
});

interface LocationMapPickerProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect?: (location: {
    lat: string;
    lon: string;
    display_name: string;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
}

const CITY_CENTER: { lat: number; lng: number } = { lat: 6.91, lng: 122.08 };

export const LocationMapPicker = ({
  value,
  onChange,
  onLocationSelect,
  placeholder = "Search or click on map...",
  disabled = false,
  required = false,
}: LocationMapPickerProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Create map
    const map = L.map(containerRef.current, {
      center: [CITY_CENTER.lat, CITY_CENTER.lng],
      zoom: 13,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Add tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    mapRef.current = map;

    // Handle map clicks
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (disabled) return;

      const { lat, lng } = e.latlng;
      setSelectedLocation({ lat, lng });

      // Update or create marker
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = L.marker([lat, lng], {
          icon: L.Icon.Default.prototype,
          draggable: true,
        })
          .addTo(map)
          .on("dragend", () => {
            if (markerRef.current) {
              const position = markerRef.current.getLatLng();
              setSelectedLocation({ lat: position.lat, lng: position.lng });
              // Trigger location name fetch
              getLocationName(position.lat, position.lng);
            }
          });
      }

      // Fetch location name
      getLocationName(lat, lng);
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
    };
  }, [disabled]);

  // Search for locations
  useEffect(() => {
    const searchLocations = async () => {
      if (value.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      try {
        const zamboCityResults = await searchZamboCityLocations(value, 8);

        if (!Array.isArray(zamboCityResults)) {
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        const locationSuggestions = zamboCityResults.map(
          (location: ZamboCityLocation) => ({
            display_name: location.displayName,
            lat: location.lat.toString(),
            lon: location.lng.toString(),
            type: location.type,
          })
        );

        setSuggestions(locationSuggestions);
        setShowSuggestions(locationSuggestions.length > 0);
      } catch (error) {
        console.error("Error searching locations:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchLocations, 300);
    return () => clearTimeout(timeoutId);
  }, [value]);

  // Fetch location name from coordinates using reverse geocoding
  const getLocationName = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      );
      const data = await response.json();

      if (data.address) {
        const locationName =
          data.address.neighbourhood ||
          data.address.suburb ||
          data.address.town ||
          data.address.city ||
          data.address.county ||
          "Selected Location";

        onChange(locationName);

        if (onLocationSelect) {
          onLocationSelect({
            lat: lat.toString(),
            lon: lng.toString(),
            display_name: locationName,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching location name:", error);
    }
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion: LocationSuggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);

    onChange(suggestion.display_name);
    setSelectedLocation({ lat, lng });
    setShowSuggestions(false);

    // Update map
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16);
    }

    // Update or create marker
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], {
        icon: L.Icon.Default.prototype,
        draggable: true,
      })
        .addTo(mapRef.current!)
        .on("dragend", () => {
          if (markerRef.current) {
            const position = markerRef.current.getLatLng();
            setSelectedLocation({ lat: position.lat, lng: position.lng });
            getLocationName(position.lat, position.lng);
          }
        });
    }

    if (onLocationSelect) {
      onLocationSelect(suggestion);
    }
  };

  return (
    <div className="location-map-picker flex flex-col gap-3">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10 pointer-events-none">
          <i className="fas fa-search text-gray-400"></i>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 ${
            disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"
          }`}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
        {!isLoading && value.length >= 2 && suggestions.length > 0 && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <i className="fas fa-check-circle text-green-500"></i>
          </div>
        )}

        {/* Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto z-50">
            <div className="p-2">
              <div className="text-xs text-gray-500 mb-2 px-2">
                <i className="fas fa-map-marked-alt mr-1"></i>
                Zamboanga City Locations
              </div>
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer rounded-md transition-colors duration-150 border-l-4 border-l-transparent hover:border-l-blue-500"
                >
                  <div className="flex items-start space-x-2">
                    <div className="flex-shrink-0 mt-1">
                      <i className="fas fa-map-marker-alt text-blue-500 text-sm"></i>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {suggestion.display_name.split(",")[0]}
                      </div>
                      <div className="text-xs text-gray-500">
                        {suggestion.display_name}
                      </div>
                      {suggestion.type && (
                        <div className="text-xs text-blue-600 mt-1">
                          <span className="bg-blue-100 px-2 py-0.5 rounded-full">
                            {suggestion.type.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {value.length >= 2 && !isLoading && suggestions.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
            <div className="p-4 text-center">
              <div className="text-gray-500 text-sm">
                No locations found for "{value}"
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Map Container - Fixed Size */}
      <div className="w-full h-64 max-h-64 rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100 relative flex-shrink-0">
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ height: "256px" }}
        />
        
        {/* Map Instructions Overlay */}
        {!selectedLocation && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black bg-opacity-5">
            <div className="text-center">
              <div className="text-gray-600 text-sm font-medium">
                <i className="fas fa-mouse-pointer mr-2"></i>
                Click on map to select location
              </div>
            </div>
          </div>
        )}
        
        {/* Location Selected Indicator */}
        {selectedLocation && (
          <div className="absolute bottom-3 left-3 bg-green-500 text-white px-3 py-2 rounded-lg text-sm flex items-center shadow-lg z-40">
            <i className="fas fa-check-circle mr-2"></i>
            Location Selected
          </div>
        )}
        
        {/* Map Controls Help */}
        <div className="absolute top-3 right-3 bg-white rounded-lg shadow-md p-2 text-xs text-gray-600 z-40">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center">
              <i className="fas fa-search mr-2 text-blue-500"></i>
              <span>Search to navigate</span>
            </div>
            <div className="flex items-center">
              <i className="fas fa-mouse-pointer mr-2 text-blue-500"></i>
              <span>Click to pin marker</span>
            </div>
            {selectedLocation && (
              <div className="flex items-center">
                <i className="fas fa-arrows-alt mr-2 text-blue-500"></i>
                <span>Drag marker to adjust</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Location Confirmation */}
      {selectedLocation && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-3 flex-shrink-0">
          <div className="flex items-start space-x-2">
            <i className="fas fa-check-circle text-green-600 mt-1 flex-shrink-0"></i>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-green-800">
                Location Selected
              </div>
              <div className="text-xs text-green-700 mt-1">
                <div className="truncate">{value}</div>
                <div className="mt-1 font-mono text-gray-600 text-xs">
                  {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 flex items-center flex-shrink-0">
        <i className="fas fa-lightbulb mr-2"></i>
        Type to search or click on the map to select your location
      </div>
    </div>
  );
};
