import { useState, useEffect } from "react";
import {
  searchZamboCityLocations,
  type ZamboCityLocation,
} from "../utils/zamboCityLocations";

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id: string;
  type?: string;
  isLocal?: boolean;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect?: (location: LocationSuggestion) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
}

export const LocationAutocomplete = ({
  value,
  onChange,
  onLocationSelect,
  placeholder = "e.g., Sinunuc, Tetuan, City Hall",
  disabled = false,
  className = "",
  required = false,
}: LocationAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Search for locations when input changes
  useEffect(() => {
    const searchLocations = async () => {
      if (value.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      setIsLoading(true);
      try {
        console.log(`🔍 Searching for "${value}" in Zamboanga locations...`);

        // Use the same search function as the route planner
        const zamboCityResults = await searchZamboCityLocations(value, 8);

        if (!Array.isArray(zamboCityResults)) {
          console.error(
            "❌ Location search returned invalid data:",
            zamboCityResults
          );
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        const locationSuggestions = zamboCityResults.map(
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
          `✅ Found ${locationSuggestions.length} locations for "${value}"`
        );
        setSuggestions(locationSuggestions);
        setShowSuggestions(locationSuggestions.length > 0);
      } catch (error) {
        console.error("❌ Error searching locations:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchLocations, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [value]);

  const handleSuggestionClick = (suggestion: LocationSuggestion) => {
    console.log("📍 Location selected:", suggestion);
    onChange(suggestion.display_name);
    setShowSuggestions(false);
    if (onLocationSelect) {
      onLocationSelect(suggestion);
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => setShowSuggestions(false), 150);
  };

  return (
    <div className="relative">
      {/* Location Input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
          <i className="fas fa-map-marker-alt text-gray-400"></i>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={`w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all duration-200 ${
            disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"
          } ${className}`}
        />
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
        {/* Location found indicator */}
        {!isLoading && value.length >= 2 && suggestions.length > 0 && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <i className="fas fa-check-circle text-green-500"></i>
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto z-50">
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
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
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

          {/* Footer */}
          <div className="border-t border-gray-100 p-2">
            <div className="text-xs text-gray-400 text-center">
              Powered by OpenStreetMap • Zamboanga City locations
            </div>
          </div>
        </div>
      )}

      {/* No results message */}
      {value.length >= 2 && !isLoading && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
          <div className="p-4 text-center">
            <div className="text-gray-500">
              <i className="fas fa-search mb-2 text-xl"></i>
              <div className="text-sm">No locations found for "{value}"</div>
              <div className="text-xs text-gray-400 mt-1">
                Try searching for areas like: Sinunuc, Tetuan, City Hall, RT Lim
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
