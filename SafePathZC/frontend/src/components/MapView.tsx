import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet-control-geocoder';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-routing-machine';
import '../App.css';


interface LatLng {
  lat: number;
  lng: number;
}

interface RouteDetails {
  distance: string;
  time: string;
  startName: string;
  endName: string;
  instructions: string[];
}

interface TerrainData {
  elevation: number;
  slope: number;
  floodRisk: string;
  terrainType: string;
  lat: string;
  lng: string;
}

interface TileLayerConfig {
  url: string;
  options: {
    maxZoom: number;
    attribution: string;
  };
}

interface LocationSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  place_id: string;
}

export const MapView = () => {
  const [routeMode, setRouteMode] = useState(false);
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<LatLng | null>(null);
  const [routeDetails, setRouteDetails] = useState<RouteDetails | null>(null);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [travelMode, setTravelMode] = useState('car');
  const [mapLayer, setMapLayer] = useState('street');
  const [showTerrainData, setShowTerrainData] = useState(false);
  const [terrainData, setTerrainData] = useState<TerrainData | null>(null);
  const [isTerrainMode, setIsTerrainMode] = useState(false);
  const [showTerrainOverlay, setShowTerrainOverlay] = useState(false);
  
  // New states for route planner modal
  const [showRoutePlannerModal, setShowRoutePlannerModal] = useState(false);
  const [startLocationInput, setStartLocationInput] = useState('');
  const [endLocationInput, setEndLocationInput] = useState('');
  const [startSuggestions, setStartSuggestions] = useState<LocationSuggestion[]>([]);
  const [endSuggestions, setEndSuggestions] = useState<LocationSuggestion[]>([]);
  const [selectedStartLocation, setSelectedStartLocation] = useState<LocationSuggestion | null>(null);
  const [selectedEndLocation, setSelectedEndLocation] = useState<LocationSuggestion | null>(null);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);
  const [routeOptions, setRouteOptions] = useState({
    avoidFloods: false,
    highGround: false,
    fastest: true,
    safest: false
  });
  
  const mapRef = useRef<L.Map | null>(null);
  const routingControlRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const layersRef = useRef<Record<string, L.TileLayer>>({});
  const terrainPopupRef = useRef<L.CircleMarker | null>(null);
  const terrainOverlayRef = useRef<L.LayerGroup | null>(null);

  // Custom icons
  const startIcon = L.icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x-green.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });
  const endIcon = L.icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x-red.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });

  // Geocoding function for location search
  const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
    if (query.length < 3) return [];
    
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`
      );
      const data = await response.json();
      return data.map((item: any) => ({
        display_name: item.display_name,
        lat: item.lat,
        lon: item.lon,
        place_id: item.place_id
      }));
    } catch (error) {
      console.error('Error searching locations:', error);
      return [];
    }
  };

  // Handle start location input change
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (startLocationInput.length >= 3) {
        const suggestions = await searchLocations(startLocationInput);
        setStartSuggestions(suggestions);
        setShowStartSuggestions(true);
      } else {
        setStartSuggestions([]);
        setShowStartSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [startLocationInput]);

  // Handle end location input change
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (endLocationInput.length >= 3) {
        const suggestions = await searchLocations(endLocationInput);
        setEndSuggestions(suggestions);
        setShowEndSuggestions(true);
      } else {
        setEndSuggestions([]);
        setShowEndSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [endLocationInput]);

  // Handle selecting start location
  const handleSelectStartLocation = (location: LocationSuggestion) => {
    setSelectedStartLocation(location);
    setStartLocationInput(location.display_name);
    setStartSuggestions([]);
    setShowStartSuggestions(false);
    setStartPoint({ lat: parseFloat(location.lat), lng: parseFloat(location.lon) });
  };

  // Handle selecting end location
  const handleSelectEndLocation = (location: LocationSuggestion) => {
    setSelectedEndLocation(location);
    setEndLocationInput(location.display_name);
    setEndSuggestions([]);
    setShowEndSuggestions(false);
    setEndPoint({ lat: parseFloat(location.lat), lng: parseFloat(location.lon) });
  };

  // Handle find route button click
  const handleFindRoute = () => {
    if (selectedStartLocation && selectedEndLocation) {
      setShowRoutePlannerModal(false);
      setRouteMode(true);
      
      // Clear existing markers
      markersRef.current.forEach(marker => {
        if (mapRef.current && mapRef.current.hasLayer(marker)) {
          mapRef.current.removeLayer(marker);
        }
      });
      markersRef.current = [];

      // Add markers for start and end points
      if (mapRef.current) {
        const startMarker = L.marker([startPoint!.lat, startPoint!.lng], { icon: startIcon })
          .addTo(mapRef.current)
          .bindPopup('Start: ' + selectedStartLocation.display_name);
        
        const endMarker = L.marker([endPoint!.lat, endPoint!.lng], { icon: endIcon })
          .addTo(mapRef.current)
          .bindPopup('End: ' + selectedEndLocation.display_name);
        
        markersRef.current.push(startMarker, endMarker);
      }
    }
  };

  // Use current location for start point
  const useCurrentLocationAsStart = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        
        // Reverse geocode to get location name
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
          );
          const data = await response.json();
          
          const locationData: LocationSuggestion = {
            display_name: data.display_name || 'Current Location',
            lat: lat.toString(),
            lon: lng.toString(),
            place_id: 'current'
          };
          
          handleSelectStartLocation(locationData);
        } catch (error) {
          // Fallback if reverse geocoding fails
          const locationData: LocationSuggestion = {
            display_name: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            lat: lat.toString(),
            lon: lng.toString(),
            place_id: 'current'
          };
          
          handleSelectStartLocation(locationData);
        }
      }, (error) => {
        alert('Unable to get current location: ' + error.message);
      });
    } else {
      alert('Geolocation is not supported by this browser');
    }
  };

  // Define tile layers with working URLs
  const tileLayers: Record<string, TileLayerConfig> = {
    street: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    },
    terrain: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      options: {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
      }
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      options: {
        maxZoom: 18,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    },
    topo: {
      url: 'https://tile.thunderforest.com/landscape/{z}/{x}/{y}.png?apikey=6170aad10dfd42a38d4d8c709a536f38',
      options: {
        maxZoom: 18,
        attribution: '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    }
  };

  // Create smooth terrain overlay using polygon grid
  const createTerrainOverlay = () => {
    if (!mapRef.current) return;

    // Remove existing overlay
    if (terrainOverlayRef.current) {
      mapRef.current.removeLayer(terrainOverlayRef.current);
    }

    const bounds = mapRef.current.getBounds();
    const zoom = mapRef.current.getZoom();
    const center = mapRef.current.getCenter();
    
    // Create a denser grid for smoother appearance
    const gridResolution = Math.max(5, Math.min(20, Math.floor(zoom * 1.5))); // Adaptive resolution based on zoom
    const latStep = (bounds.getNorth() - bounds.getSouth()) / gridResolution;
    const lngStep = (bounds.getEast() - bounds.getWest()) / gridResolution;
    
    const terrainLayer = L.layerGroup();
    
    // Generate grid of rectangles/polygons for smooth coverage
    for (let i = 0; i < gridResolution; i++) {
      for (let j = 0; j < gridResolution; j++) {
        const lat = bounds.getSouth() + (i * latStep);
        const lng = bounds.getWest() + (j * lngStep);
        const nextLat = lat + latStep;
        const nextLng = lng + lngStep;
        
        // Calculate center of this grid cell for elevation calculation
        const cellCenterLat = lat + (latStep / 2);
        const cellCenterLng = lng + (lngStep / 2);
        
        // Calculate distance from coast based on current view
        const distanceFromCoast = Math.min(
          Math.abs(cellCenterLat - bounds.getSouth()),
          Math.abs(cellCenterLat - bounds.getNorth()),
          Math.abs(cellCenterLng - bounds.getWest()),
          Math.abs(cellCenterLng - bounds.getEast())
        ) * 111; // Convert to km
        
        // Calculate distance from center
        const distanceFromCenter = Math.sqrt(
          Math.pow(cellCenterLat - center.lat, 2) + 
          Math.pow(cellCenterLng - center.lng, 2)
        ) * 111; // Convert to km

        // Dynamic elevation calculation based on position
        let elevation;
        
        // Coastal areas - low elevation
        if (distanceFromCoast < 2) {
          elevation = Math.random() * 5; // 0-5m
        } 
        // Coastal plains
        else if (distanceFromCoast < 5) {
          elevation = 5 + Math.random() * 5; // 5-10m
        } 
        // Low plains
        else if (distanceFromCenter < 10) {
          elevation = 10 + Math.random() * 20; // 10-30m
        }
        // City areas
        else if (distanceFromCenter < 20) {
          elevation = 30 + Math.random() * 20; // 30-50m
        }
        // Hills
        else if (distanceFromCenter < 30) {
          elevation = 50 + Math.random() * 50; // 50-100m
        }
        // Mountains
        else {
          elevation = 100 + Math.random() * 200; // 100-300m
        }
        
        // Add smooth terrain variation using sine waves for more natural appearance
        const terrainNoise = 
          (Math.sin(cellCenterLat * 100) * 0.3 + 
           Math.cos(cellCenterLng * 100) * 0.3 + 
           Math.sin((cellCenterLat + cellCenterLng) * 50) * 0.4) * 5;
        
        elevation = Math.max(0, elevation + terrainNoise);
        
        const color = getElevationColor(elevation);
        
        // Create a rectangle/polygon for each grid cell
        const rectangle = L.rectangle(
          [[lat, lng], [nextLat, nextLng]], 
          {
            fillColor: color,
            color: color,
            weight: 0,
            fillOpacity: 0.4,
            stroke: false
          }
        );
        
        rectangle.addTo(terrainLayer);
      }
    }
    
    // Add gradient overlay for smoother transitions (using larger semi-transparent patches)
    const smoothingResolution = Math.max(3, gridResolution / 3);
    const smoothLatStep = (bounds.getNorth() - bounds.getSouth()) / smoothingResolution;
    const smoothLngStep = (bounds.getEast() - bounds.getWest()) / smoothingResolution;
    
    for (let i = 0; i < smoothingResolution; i++) {
      for (let j = 0; j < smoothingResolution; j++) {
        const lat = bounds.getSouth() + (i * smoothLatStep);
        const lng = bounds.getWest() + (j * smoothLngStep);
        const nextLat = lat + smoothLatStep;
        const nextLng = lng + smoothLngStep;
        
        const cellCenterLat = lat + (smoothLatStep / 2);
        const cellCenterLng = lng + (smoothLngStep / 2);
        
        // Calculate average elevation for smoother overlay
        const distanceFromCenter = Math.sqrt(
          Math.pow(cellCenterLat - center.lat, 2) + 
          Math.pow(cellCenterLng - center.lng, 2)
        ) * 111;
        
        let avgElevation = 30 + (distanceFromCenter * 2);
        avgElevation = Math.min(200, avgElevation);
        
        const color = getElevationColor(avgElevation);
        
        // Add larger semi-transparent patches for smoothing
        L.rectangle(
          [[lat, lng], [nextLat, nextLng]], 
          {
            fillColor: color,
            color: color,
            weight: 0,
            fillOpacity: 0.2,
            stroke: false
          }
        ).addTo(terrainLayer);
      }
    }

    terrainOverlayRef.current = terrainLayer;
    terrainLayer.addTo(mapRef.current);
  };

  // Update overlay when map moves (for continuous coverage)
  useEffect(() => {
    if (!mapRef.current || !showTerrainOverlay) return;

    const updateOverlay = () => {
      if (showTerrainOverlay) {
        createTerrainOverlay();
      }
    };

    mapRef.current.on('moveend', updateOverlay);
    mapRef.current.on('zoomend', updateOverlay);

    return () => {
      if (mapRef.current) {
        mapRef.current.off('moveend', updateOverlay);
        mapRef.current.off('zoomend', updateOverlay);
      }
    };
  }, [showTerrainOverlay]);

  // Handle terrain overlay toggle
  useEffect(() => {
    if (showTerrainOverlay && mapRef.current) {
      createTerrainOverlay();
    } else if (terrainOverlayRef.current) {
      mapRef.current.removeLayer(terrainOverlayRef.current);
      terrainOverlayRef.current = null;
    }
  }, [showTerrainOverlay]);

  // Auto-enable terrain overlay when switching to terrain map
  useEffect(() => {
    if (mapLayer === 'terrain') {
      setShowTerrainOverlay(true);
    }
  }, [mapLayer]);

  const getElevationData = async (lat: number, lng: number): Promise<TerrainData | null> => {
    try {
      const response = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`);
      const data = await response.json();
      if (data.results && data.results[0]) {
        const elevation = data.results[0].elevation;
        return {
          elevation: elevation,
          slope: calculateSlope(elevation),
          floodRisk: calculateFloodRisk(elevation),
          terrainType: getTerrainType(elevation),
          lat: lat.toFixed(6),
          lng: lng.toFixed(6)
        };
      }
    } catch (error) {
      console.error('Error fetching elevation:', error);
      // Fallback to simulated data
      return {
        elevation: Math.floor(Math.random() * 100) + 1,
        slope: Math.floor(Math.random() * 15) + 1,
        floodRisk: Math.random() > 0.7 ? 'High' : Math.random() > 0.4 ? 'Medium' : 'Low',
        terrainType: ['Flat', 'Hilly', 'Mountainous'][Math.floor(Math.random() * 3)],
        lat: lat.toFixed(6),
        lng: lng.toFixed(6)
      };
    }
    return null;
  };

  // Helper functions for terrain analysis
  const calculateSlope = (elevation: number): number => {
    // Simplified slope calculation based on elevation
    if (elevation < 10) return Math.floor(Math.random() * 3) + 1;
    if (elevation < 50) return Math.floor(Math.random() * 8) + 2;
    return Math.floor(Math.random() * 15) + 5;
  };

  const calculateFloodRisk = (elevation: number): string => {
    if (elevation < 5) return 'High';
    if (elevation < 20) return 'Medium';
    return 'Low';
  };

  const getTerrainType = (elevation: number): string => {
    if (elevation < 20) return 'Flat/Coastal';
    if (elevation < 100) return 'Hills';
    return 'Mountains';
  };

  const getElevationColor = (elevation: number): string => {
    // Enhanced color gradient for smoother transitions
    if (elevation < 5) return '#0066CC'; // Blue for low elevation
    if (elevation < 10) return '#0099CC'; // Light blue
    if (elevation < 20) return '#00CC99'; // Teal
    if (elevation < 30) return '#00CC66'; // Green
    if (elevation < 40) return '#33CC33'; // Light green
    if (elevation < 50) return '#66CC00'; // Yellow-green
    if (elevation < 70) return '#99CC00'; // Light yellow-green
    if (elevation < 90) return '#CCCC00'; // Yellow
    if (elevation < 110) return '#CC9900'; // Orange-yellow
    if (elevation < 150) return '#CC6600'; // Orange
    if (elevation < 200) return '#CC3300'; // Red-orange
    return '#CC0000'; // Red for high elevation
  };

  // Initialize map and controls
  useEffect(() => {
    const map = L.map('map', {
      zoomControl: false // Disable default zoom control to add it in custom position
    }).setView([6.9111, 122.0794], 13);
    mapRef.current = map;

    // Initialize all tile layers
    Object.keys(tileLayers).forEach(layerName => {
      layersRef.current[layerName] = L.tileLayer(
        tileLayers[layerName].url, 
        tileLayers[layerName].options
      );
    });

    // Add default layer
    layersRef.current[mapLayer].addTo(map);
    

    // 1. FIRST: Add geocoder (search bar)
  const geocoder = (L.Control as any).geocoder({
    defaultMarkGeocode: false,
    position: 'topleft',
    placeholder: 'Search here...',
    collapsed: false
  })
  .on('markgeocode', function (e: any) {
        const latlng = e.geocode.center;
        map.setView(latlng, 16);
      })
      .addTo(map);

    // 2. SECOND: Add routing button control (MODIFIED to show modal)
    const RoutingBtn = L.Control.extend({
      options: {
        position: 'topleft'
      },
      onAdd: function () {
        const btn = L.DomUtil.create('button', 'leaflet-control-custom');
        
        btn.style.background = '#451ae0ff';
        btn.style.border = '2px solid #190fd8ff';
        btn.style.width = '170px';
        btn.style.height = '37px';
        btn.style.cursor = 'pointer';
        btn.style.borderRadius = '8px';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.gap = '6px';
        btn.style.marginTop = '10px';

        const icon = L.DomUtil.create('img', '', btn);
        icon.src = '/icons/circle.png';
        icon.style.width = '24px';
        icon.style.height = '24px';

        const text = L.DomUtil.create('span', '', btn);
        text.innerText = 'Plan Route';
        text.style.fontSize = '14px';
        text.style.color = '#ffffffff';
        text.style.fontWeight = 'bold';

        btn.onclick = (e: Event) => {
          e.stopPropagation();
          setShowRoutePlannerModal(true);
          setIsTerrainMode(false);
        };

        return btn;
      }
    });
    const routingBtn = new RoutingBtn({ position: 'topleft' });
    map.addControl(routingBtn);

    // 3. THIRD: Add zoom controls
    const zoomControl = new L.Control.Zoom({
      position: 'topleft'
    });
    map.addControl(zoomControl);

    // 4. FOURTH: Add "Use My Location" button
    const MyLocBtn = L.Control.extend({
      options: {
        position: 'topleft'
      },
      onAdd: function () {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
        
        btn.style.background = '#451ae0ff';
        btn.style.width = '40px';
        btn.style.height = '40px';
        btn.style.borderRadius = '50%';
        btn.style.cursor = 'pointer';
        btn.style.border = '2px solid #190fd8ff';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.padding = '0';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
        btn.style.marginTop = '10px';
        
        
        const icon = document.createElement('img');
        icon.src = '/icons/location.png';
        icon.style.width = '24px';
        icon.style.height = '24px';
        icon.style.filter = 'brightness(0) invert(1)';
        
        btn.appendChild(icon);
        btn.title = 'Use My Location';

        btn.onclick = (e: Event) => {
          e.stopPropagation();
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
              const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              map.setView([latlng.lat, latlng.lng], 15);
            });
          } else {
            alert('Geolocation not supported');
          }
        };
        
        return btn;
      }
    });
    const myLocBtn = new MyLocBtn({ position: 'topleft' });
    map.addControl(myLocBtn);

    // 5. FIFTH: Add terrain analysis button
    const TerrainBtn = L.Control.extend({
      options: {
        position: 'topleft'
      },
      onAdd: function () {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
        
        btn.style.cssText = `
          background: #451ae0ff;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid #190fd8ff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          margin-top: 10px;
        `;
        
         const icon = document.createElement('img');
        icon.src = '/icons/terrain.png';
        icon.style.width = '24px';
        icon.style.height = '24px';
        icon.style.filter = 'brightness(0) invert(1)';
        
        btn.appendChild(icon);
        btn.title = 'Terrain Analysis'

        btn.onclick = (e: Event) => {
          e.stopPropagation();
          setIsTerrainMode((prev) => !prev);
          setRouteMode(false);
        };
        
        return btn;
      }
    });
    const terrainBtn = new TerrainBtn({ position: 'topleft' });
    map.addControl(terrainBtn);

    // 6. SIXTH: Add terrain overlay toggle button
    const TerrainOverlayBtn = L.Control.extend({
      options: {
        position: 'topright'
      },
      onAdd: function () {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control leaflet-control-custom');
        
        btn.style.cssText = `
          background: #ffffff;
          border: 2px solid #000000;
          width: 160px;
          height: 37px;
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          gap: 8px;
          margin: 10px;
        `;
        
      const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  `;
  
  // Add mountain icon
  const icon = document.createElement('img');
  icon.src = '/icons/mountain.png';
  icon.style.cssText = `
    width: 20px;
    height: 20px;
    object-fit: contain;
  `;
  
  // Add text
  const text = document.createElement('span');
  text.innerText = 'Show Terrain';
  
  // Append elements
  container.appendChild(icon);
  container.appendChild(text);
  btn.appendChild(container);
  
  btn.onclick = (e: Event) => {
    e.stopPropagation();
    setShowTerrainOverlay(prev => {
      text.innerText = !prev ? 'Hide Terrain' : 'Show Terrain';
      btn.style.background = !prev ? '#f0f0f0' : '#ffffff';
      return !prev;
    });
  };
  
  return btn;
}
    });
    const terrainOverlayBtn = new TerrainOverlayBtn();
    map.addControl(terrainOverlayBtn);

    return () => {
      map.remove();
      if (routingControlRef.current) routingControlRef.current.remove();
    };
    // eslint-disable-next-line
  }, []);

  // Handle layer switching
  useEffect(() => {
    if (!mapRef.current || !layersRef.current) return;

    // Remove current layer
    Object.values(layersRef.current).forEach(layer => {
      if (mapRef.current!.hasLayer(layer)) {
        mapRef.current!.removeLayer(layer);
      }
    });

    // Add new layer
    layersRef.current[mapLayer].addTo(mapRef.current);
  }, [mapLayer]);

  // Map click handlers (only for terrain mode now)
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      if (isTerrainMode) {
        // Terrain analysis
        const { lat, lng } = e.latlng;
        const elevationData = await getElevationData(lat, lng);
        
        if (elevationData) {
          setTerrainData(elevationData);
          setShowTerrainData(true);

          // Add temporary marker with elevation color
          const elevationMarker = L.circleMarker(e.latlng, {
            radius: 8,
            fillColor: getElevationColor(elevationData.elevation),
            color: '#000',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.5
          }).addTo(mapRef.current!);

          // Remove previous terrain marker if exists
          if (terrainPopupRef.current) {
            mapRef.current!.removeLayer(terrainPopupRef.current);
          }
          terrainPopupRef.current = elevationMarker;
        }
      }
    };

    mapRef.current.on('click', handleMapClick);

    return () => {
      mapRef.current!.off('click', handleMapClick);
    };
  }, [isTerrainMode]);

  // Routing logic
  useEffect(() => {
    if (startPoint && endPoint && mapRef.current && routeMode) {
      if (routingControlRef.current) {
        routingControlRef.current.remove();
        routingControlRef.current = null;
      }
      routingControlRef.current = (L as any).Routing.control({
        waypoints: [
          L.latLng(startPoint.lat, startPoint.lng),
          L.latLng(endPoint.lat, endPoint.lng)
        ],
        router: (L as any).Routing.osrmv1({
          serviceUrl: 'https://router.project-osrm.org/route/v1',
          profile:
            travelMode === 'car'
              ? 'car'
              : travelMode === 'motorcycle'
              ? 'bike'
              : 'foot'
        }),
        routeWhileDragging: false,
        showAlternatives: false,
        lineOptions: {
          styles: [{ color: '#0078ff', opacity: 0.8, weight: 5 }]
        },
        createMarker: () => null,
        collapsible: true,
        fitSelectedRoutes: true,
        show: true
      }).addTo(mapRef.current);

      routingControlRef.current.on('routesfound', (e: any) => {
        const route = e.routes[0];
        if (route) {
          const summary = route.summary;
          const instructions = route.instructions;
          setRouteDetails({
            distance: (summary.totalDistance / 1000).toFixed(1) + ' km',
            time: Math.round(summary.totalTime / 60) + ' min',
            startName: selectedStartLocation?.display_name || 'Start Point',
            endName: selectedEndLocation?.display_name || 'End Point',
            instructions: instructions.map((inst: any) => inst.text)
          });
          setShowRouteModal(true);
        }
      });
    }
  }, [startPoint, endPoint, travelMode, routeMode, selectedStartLocation, selectedEndLocation]);

  // Get layer display name
  const getLayerDisplayName = (layer: string): string => {
    const names: Record<string, string> = {
      street: 'Street Map',
      terrain: 'Terrain',
      satellite: 'Satellite',
      topo: 'Topographic'
    };
    return names[layer] || layer;
  };

  // Reset route
  const resetRoute = () => {
    setStartPoint(null);
    setEndPoint(null);
    setRouteDetails(null);
    setShowRouteModal(false);
    setRouteMode(false);
    setStartLocationInput('');
    setEndLocationInput('');
    setSelectedStartLocation(null);
    setSelectedEndLocation(null);
    setStartSuggestions([]);
    setEndSuggestions([]);
    setShowStartSuggestions(false);
    setShowEndSuggestions(false);
    markersRef.current.forEach(marker => {
      if (mapRef.current && mapRef.current.hasLayer(marker)) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];
    if (routingControlRef.current) {
      routingControlRef.current.remove();
      routingControlRef.current = null;
    }
    // Clear terrain marker
    if (terrainPopupRef.current) {
      mapRef.current!.removeLayer(terrainPopupRef.current);
      terrainPopupRef.current = null;
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '10px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <label>Travel Mode:</label>
          <select
            value={travelMode}
            onChange={e => setTravelMode(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: '4px' }}
          >
            <option value="car">Car</option>
            <option value="motorcycle">Motorcycle</option>
            <option value="foot">Walking</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <label>Map View:</label>
          <select
            value={mapLayer}
            onChange={e => setMapLayer(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: '4px' }}
          >
            <option value="street">Street Map</option>
            <option value="terrain">Terrain</option>
            <option value="satellite">Satellite</option>
            <option value="topo">Topographic</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <label>
            <input
              type="checkbox"
              checked={showTerrainOverlay}
              onChange={e => setShowTerrainOverlay(e.target.checked)}
              style={{ marginRight: '5px' }}
            />
            Terrain Colors
          </label>
        </div>

        <div style={{
          background: '#f0f8ff',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '0.9em',
          color: '#2c3e50'
        }}>
          Current: {getLayerDisplayName(mapLayer)}
        </div>
      </div>

      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        {routeMode && (
          <div style={{
            background: '#e3f2fd',
            padding: '8px 12px',
            borderRadius: '4px',
            flexGrow: 1
          }}>
            <p style={{ margin: 0 }}>Route planned from {selectedStartLocation?.display_name} to {selectedEndLocation?.display_name}</p>
          </div>
        )}
        
        {isTerrainMode && (
          <div style={{
            background: '#f0f8e6',
            display: 'flex',
            padding: '8px 12px',
            flexDirection: 'column',
            borderRadius: '4px',
            gap: '3px',
            flexGrow: 1
          }}>
            <p style={{ margin: 0 }}>Click on the map to analyze terrain elevation</p>
          </div>
        )}

        {(startPoint || endPoint || isTerrainMode || showTerrainOverlay) && (
          <button
            onClick={resetRoute}
            style={{
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Clear All
          </button>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <div
          id="map"
          style={{
            height: '500px',
            width: '100%',
            borderRadius: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            marginBottom: '20px'
          }}
        ></div>

        {/* Elevation Legend - ONLY shows when showTerrainOverlay is true */}
        {showTerrainOverlay && (
          <div style={{
            position: 'absolute',
            bottom: '30px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.85)',
            padding: '10px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            fontSize: '0.8em',
            zIndex: 1000,
            maxWidth: '200px'
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#2c3e50' }}>
              🌈 Terrain Elevation
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#0066CC', borderRadius: '2px' }}></div>
                <span>0-5m (Sea Level)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#0099CC', borderRadius: '2px' }}></div>
                <span>5-10m (Coastal)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#00CC99', borderRadius: '2px' }}></div>
                <span>10-20m (Low Plains)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#00CC66', borderRadius: '2px' }}></div>
                <span>20-30m (Plains)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#66CC00', borderRadius: '2px' }}></div>
                <span>30-50m (City)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#CCCC00', borderRadius: '2px' }}></div>
                <span>50-90m (Hills)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#CC6600', borderRadius: '2px' }}></div>
                <span>90-150m (High Hills)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', background: '#CC0000', borderRadius: '2px' }}></div>
                <span>150m+ (Mountains)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Route Planner Modal */}
      {showRoutePlannerModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '0',
            width: '400px',
            maxWidth: '90vw',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: '20px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{ fontSize: '24px' }}>🗺️</div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>Route Planner</h2>
              <button
                onClick={() => setShowRoutePlannerModal(false)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  opacity: 0.8
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              {/* From Input */}
              <div style={{ marginBottom: '20px', position: 'relative' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold', 
                  color: '#333',
                  fontSize: '14px'
                }}>
                  From
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    background: '#22c55e',
                    borderRadius: '50%',
                    zIndex: 1
                  }}></div>
                  <input
                    type="text"
                    value={startLocationInput}
                    onChange={(e) => setStartLocationInput(e.target.value)}
                    placeholder="Choose starting point"
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 32px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={() => setShowStartSuggestions(startSuggestions.length > 0)}
                  />
                  <button
                    onClick={useCurrentLocationAsStart}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: '#667eea',
                      border: 'none',
                      color: 'white',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    📍 Current
                  </button>
                </div>
                
                {/* Start Location Suggestions */}
                {showStartSuggestions && startSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000
                  }}>
                    {startSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        onClick={() => handleSelectStartLocation(suggestion)}
                        style={{
                          padding: '12px',
                          borderBottom: index < startSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#374151'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                      >
                        📍 {suggestion.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                marginBottom: '20px' 
              }}>
                <button
                  onClick={() => {
                    // Swap locations
                    const tempStart = selectedStartLocation;
                    const tempStartInput = startLocationInput;
                    const tempStartPoint = startPoint;
                    
                    setSelectedStartLocation(selectedEndLocation);
                    setStartLocationInput(endLocationInput);
                    setStartPoint(endPoint);
                    
                    setSelectedEndLocation(tempStart);
                    setEndLocationInput(tempStartInput);
                    setEndPoint(tempStartPoint);
                  }}
                  style={{
                    background: '#f3f4f6',
                    border: '2px solid #e5e7eb',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  ⇅
                </button>
              </div>

              {/* To Input */}
              <div style={{ marginBottom: '24px', position: 'relative' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: 'bold', 
                  color: '#333',
                  fontSize: '14px'
                }}>
                  To
                </label>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    background: '#ef4444',
                    borderRadius: '50%',
                    zIndex: 1
                  }}></div>
                  <input
                    type="text"
                    value={endLocationInput}
                    onChange={(e) => setEndLocationInput(e.target.value)}
                    placeholder="Choose destination"
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 32px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={() => setShowEndSuggestions(endSuggestions.length > 0)}
                  />
                </div>
                
                {/* End Location Suggestions */}
                {showEndSuggestions && endSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000
                  }}>
                    {endSuggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        onClick={() => handleSelectEndLocation(suggestion)}
                        style={{
                          padding: '12px',
                          borderBottom: index < endSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                          cursor: 'pointer',
                          fontSize: '14px',
                          color: '#374151'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#f9fafb'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                      >
                        📍 {suggestion.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Find Route Button */}
              <button
                onClick={handleFindRoute}
                disabled={!selectedStartLocation || !selectedEndLocation}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: (!selectedStartLocation || !selectedEndLocation) ? '#d1d5db' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: (!selectedStartLocation || !selectedEndLocation) ? 'not-allowed' : 'pointer',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>⚡</span> Find Route
              </button>

              {/* Quick Options */}
              <div>
                <h4 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  color: '#374151' 
                }}>
                  Quick Options:
                </h4>
                
                <div style={{ 
                  display: 'flex', 
                  gap: '8px', 
                  marginBottom: '12px',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => setRouteOptions(prev => ({ ...prev, avoidFloods: !prev.avoidFloods }))}
                    style={{
                      padding: '6px 12px',
                      background: routeOptions.avoidFloods ? '#667eea' : '#f3f4f6',
                      color: routeOptions.avoidFloods ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Avoid Floods
                  </button>
                  
                  <button
                    onClick={() => setRouteOptions(prev => ({ ...prev, highGround: !prev.highGround }))}
                    style={{
                      padding: '6px 12px',
                      background: routeOptions.highGround ? '#667eea' : '#f3f4f6',
                      color: routeOptions.highGround ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    High Ground
                  </button>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  gap: '8px',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => setRouteOptions(prev => ({ ...prev, fastest: !prev.fastest, safest: false }))}
                    style={{
                      padding: '6px 12px',
                      background: routeOptions.fastest ? '#22c55e' : '#f3f4f6',
                      color: routeOptions.fastest ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Fastest
                  </button>
                  
                  <button
                    onClick={() => setRouteOptions(prev => ({ ...prev, safest: !prev.safest, fastest: false }))}
                    style={{
                      padding: '6px 12px',
                      background: routeOptions.safest ? '#22c55e' : '#f3f4f6',
                      color: routeOptions.safest ? 'white' : '#374151',
                      border: 'none',
                      borderRadius: '16px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Safest
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map Instructions */}
      <div style={{
        background: '#f8f9fa',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #e9ecef'
      }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#495057' }}>Map Controls:</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', fontSize: '0.9em' }}>
          <div><strong>🔍 Search:</strong> Find locations</div>
          <div><strong>📍 Route Mode:</strong> Plan routes with modal</div>
          <div><strong>👤 My Location:</strong> Center on current location</div>
          <div><strong>🌈 Terrain Colors:</strong> Smooth elevation overlay</div>
          <div><strong>🗻 Terrain Mode:</strong> Analyze elevation</div>
        </div>
      </div>

 {/* Terrain Data Modal */}
      {showTerrainData && terrainData && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '10px',
          boxShadow: '0 5px 20px rgba(0,0,0,0.2)',
          padding: '20px',
          marginTop: '20px',
          position: 'relative',
          border: '2px solid #27ae60'
        }}>
          <button
            onClick={() => setShowTerrainData(false)}
            style={{
              position: 'absolute',
              top: '15px',
              right: '15px',
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#888',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>

          <h2 style={{
            marginTop: '0',
            marginBottom: '15px',
            color: '#27ae60',
            borderBottom: '2px solid #f0f0f0',
            paddingBottom: '10px'
          }}>
            🗻 Terrain Analysis
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            marginBottom: '20px'
          }}>
            <div style={{
              background: '#f8f9fa',
              padding: '15px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '5px' }}>📏</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {terrainData.elevation}m
              </div>
              <div style={{ fontSize: '0.9rem', color: '#666' }}>Elevation</div>
            </div>

            <div style={{
              background: '#f8f9fa',
              padding: '15px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '5px' }}>⛰️</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {terrainData.slope}°
              </div>
              <div style={{ fontSize: '0.9rem', color: '#666' }}>Slope</div>
            </div>

            <div style={{
              background: '#f8f9fa',
              padding: '15px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '5px' }}>💧</div>
              <div style={{ 
                fontSize: '1.2rem', 
                fontWeight: 'bold',
                color: terrainData.floodRisk === 'High' ? '#e74c3c' : 
                      terrainData.floodRisk === 'Medium' ? '#f39c12' : '#27ae60'
              }}>
                {terrainData.floodRisk}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#666' }}>Flood Risk</div>
            </div>

            <div style={{
              background: '#f8f9fa',
              padding: '15px',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '5px' }}>🌍</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2c3e50' }}>
                {terrainData.terrainType}
              </div>
              <div style={{ fontSize: '0.9rem', color: '#666' }}>Terrain Type</div>
            </div>
          </div>

          <div style={{
            background: '#e8f5e8',
            padding: '15px',
            borderRadius: '8px',
            borderLeft: '4px solid #27ae60'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>📍 Location Details</h4>
            <p style={{ margin: '0', fontSize: '0.9rem', color: '#666' }}>
              <strong>Coordinates:</strong> {terrainData.lat}, {terrainData.lng}
            </p>
            {terrainData.floodRisk === 'High' && (
              <p style={{ margin: '10px 0 0 0', fontSize: '0.9rem', color: '#e74c3c' }}>
                ⚠️ <strong>Warning:</strong> This area has high flood risk due to low elevation.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Route Details Modal */}
      {showRouteModal && routeDetails && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '10px',
          boxShadow: '0 5px 20px rgba(0,0,0,0.2)',
          padding: '20px',
          marginTop: '20px',
          position: 'relative'
        }}>
          <button
            onClick={() => setShowRouteModal(false)}
            style={{
              position: 'absolute',
              top: '15px',
              right: '15px',
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#888',
              fontWeight: 'bold'
            }}
          >
            ×
          </button>

          <h2 style={{
            marginTop: '0',
            marginBottom: '15px',
            color: '#2c3e50',
            borderBottom: '2px solid #f0f0f0',
            paddingBottom: '10px'
          }}>
            Route Details
          </h2>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '20px',
            background: '#f8f9fa',
            padding: '15px',
            borderRadius: '8px'
          }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#27ae60' }}>From:</h3>
              <p style={{ margin: 0, fontWeight: 'bold' }}>{routeDetails.startName}</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#666' }}>
                {startPoint?.lat.toFixed(6)}, {startPoint?.lng.toFixed(6)}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <h3 style={{ margin: '0 0 5px 0', color: '#e74c3c' }}>To:</h3>
              <p style={{ margin: 0, fontWeight: 'bold' }}>{routeDetails.endName}</p>
              <p style={{ margin: '5px 0 0 0', fontSize: '0.9rem', color: '#666' }}>
                {endPoint?.lat.toFixed(6)}, {endPoint?.lng.toFixed(6)}
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            background: '#4a6491',
            color: 'white',
            padding: '12px 15px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <div>
              <div style={{ fontSize: '0.9rem', opacity: 0.3 }}>DISTANCE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{routeDetails.distance}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.9rem', opacity: 0.3 }}>ESTIMATED TIME</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{routeDetails.time}</div>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>Directions:</h3>
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '15px'
            }}>
              {routeDetails.instructions.map((instruction, index) => (
                <div key={index} style={{
                  padding: '10px 0',
                  borderBottom: index < routeDetails.instructions.length - 1 ? '1px solid #f0f0f0' : 'none',
                  display: 'flex',
                  alignItems: 'flex-start'
                }}>
                  <div style={{
                    background: '#4a6491',
                    color: 'white',
                    width: '25px',
                    height: '25px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '10px',
                    flexShrink: 0,
                    fontSize: '0.8rem'
                  }}>
                    {index + 1}
                  </div>
                  <div>{instruction}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};