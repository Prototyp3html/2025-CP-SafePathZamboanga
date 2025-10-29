# 📍 SafePathZC Data Sources Guide

This document explains where to find the geospatial data files used in SafePathZamboanga.

## 🗺️ Road Network Data (GeoJSON Files)

### `zcroadmap.geojson` (11,982 roads)

**Source**: OpenStreetMap (OSM)  
**Purpose**: OSRM routing engine  
**Coordinate System**: WGS 84 (EPSG:4326)

#### Where to Download:

1. **Overpass Turbo** (Interactive Query)

   - URL: https://overpass-turbo.eu/
   - Bounding Box for Zamboanga City: `[6.8, 122.0, 7.0, 122.2]`
   - Query Example:
     ```
     [bbox:6.8,122.0,7.0,122.2];
     (
       way["highway"];
     );
     out geom;
     ```
   - Export as GeoJSON

2. **BBBike Extract Service** (Free Regional Extracts)

   - URL: https://extract.bbbike.org/
   - Select "Zamboanga City" area on the map
   - Format: GeoJSON
   - Processing time: ~5-10 minutes
   - Email notification when ready

3. **Geofabrik** (Philippines Extract)

   - URL: https://download.geofabrik.de/asia/philippines.html
   - Download: `philippines-latest.osm.pbf`
   - Use QGIS or osmium tool to extract Zamboanga area
   - Convert to GeoJSON using ogr2ogr

4. **QGIS + QuickOSM Plugin**
   - Install QuickOSM plugin in QGIS
   - Query: `highway` in `Zamboanga City`
   - Export layer as GeoJSON

**Properties Include**:

- `osm_id`: OpenStreetMap unique identifier
- `name`: Road name
- `highway`: Road classification (primary, secondary, tertiary, residential, etc.)
- `lanes`: Number of lanes
- `surface`: Road surface type (concrete, asphalt, etc.)
- `maxspeed`: Speed limit
- `oneway`: One-way street flag
- `other_tags`: Additional OSM metadata

---

### `terrain_roads.geojson` (11,675 roads)

**Source**: OpenStreetMap + Enriched with DEM & Flood Data  
**Purpose**: Flood risk analysis  
**Coordinate System**: WGS 84 (EPSG:4326)

**Properties Include**:

- All OSM properties from above
- `elev_mean`: Mean elevation (meters)
- `elev_min`: Minimum elevation (meters)
- `elev_max`: Maximum elevation (meters)
- `flooded`: Boolean flag indicating flood-prone road
- `slope_gradient`: Road slope percentage

#### How to Create This File:

This file was created by enriching OSM road data with elevation and flood extent data:

1. **Download OSM Roads** (see above)
2. **Download Elevation Data** (see DEM section below)
3. **Download Flood Extent Data** (see Flood section below)
4. **Process in QGIS or Python**:
   - Use `rasterio` to extract elevation values along road geometries
   - Overlay flood extent to mark flooded roads
   - Calculate slope from elevation min/max

---

## 🏔️ Elevation Data (DEM Files)

### `Zamboanga_DEM.tiff` (79 KB)

**Source**: Digital Elevation Model  
**Format**: GeoTIFF (Cloud-Optimized)  
**Coordinate System**: WGS 84 (EPSG:4326)  
**Resolution**: ~30m (likely resampled/compressed)

#### Where to Download DEMs:

1. **USGS EarthExplorer** (Free, High Quality)

   - URL: https://earthexplorer.usgs.gov/
   - Dataset Options:
     - **SRTM 1 Arc-Second Global** (~30m resolution) - Best for Zamboanga
     - **ASTER GDEM v3** (~30m resolution)
     - **ALOS PALSAR** (~12.5m resolution)
   - Steps:
     1. Create free USGS account
     2. Search for "Zamboanga City, Philippines"
     3. Select coordinates: 6.9° N, 122.1° E
     4. Choose dataset: Digital Elevation > SRTM
     5. Download GeoTIFF format

2. **OpenTopography** (Research-Grade DEMs)

   - URL: https://opentopography.org/
   - Dataset: SRTM GL1 (30m)
   - Free for research/educational use

3. **Copernicus DEM** (European Space Agency)

   - URL: https://spacedata.copernicus.eu/
   - GLO-30: Global 30m DEM
   - Free registration required

4. **NASA Earthdata Search**
   - URL: https://search.earthdata.nasa.gov/
   - Dataset: NASADEM (Updated SRTM)
   - Free NASA account required

#### Processing DEM for SafePath:

```bash
# Using GDAL to clip and reproject DEM
gdal_translate -projwin 122.0 7.0 122.2 6.8 \
  -of GTiff -co "COMPRESS=DEFLATE" \
  input_dem.tif Zamboanga_DEM.tiff

# Or use QGIS:
# 1. Load DEM in QGIS
# 2. Raster > Extraction > Clip Raster by Extent
# 3. Set extent to Zamboanga City bounds
# 4. Save as GeoTIFF with compression
```

---

## 🌊 Flood Extent Data

### `Zamboanga_FloodExtent_201701.tif` (1.15 MB)

**Source**: Flood inundation mapping (January 2017 event)  
**Format**: GeoTIFF  
**Coordinate System**: WGS 84 (EPSG:4326)  
**Date**: January 2017 (Likely from Tropical Storm Vinta/Tembin)

**Historical Context**: Tropical Storm Vinta (Tembin) struck Mindanao in December 2016, causing severe flooding in Zamboanga Peninsula in early January 2017.

#### Where to Download Flood Data:

1. **Sentinel Hub / Copernicus Emergency Management Service**

   - URL: https://emergency.copernicus.eu/
   - Search for: "Zamboanga flood 2017" or "Philippines flood January 2017"
   - Provides flood extent maps from satellite imagery
   - Free for disaster response use

2. **NASA MODIS Flood Maps**

   - URL: https://floods.nasa.gov/
   - Near Real-Time Global Flood Mapping
   - Historical archives available

3. **UNOSAT Flood Portal**

   - URL: https://unosat.org/products/
   - Humanitarian flood mapping
   - Search for Philippines flood events

4. **Philippine Government Sources**

   - **PAGASA** (Philippine Atmospheric, Geophysical and Astronomical Services Administration)

     - URL: https://www.pagasa.dost.gov.ph/
     - Flood bulletins and historical data

   - **PHIVOLCS** (Philippine Institute of Volcanology and Seismology)

     - URL: https://www.phivolcs.dost.gov.ph/

   - **NOAH (Nationwide Operational Assessment of Hazards)**
     - URL: http://noah.dost.gov.ph/ (may be offline, check archives)
     - Hazard maps including flood susceptibility

5. **University of Philippines Resilience Institute**

   - May have research datasets on Philippine flood events

6. **OpenStreetMap Humanitarian Team**
   - URL: https://www.hotosm.org/
   - Sometimes maps flood-affected areas

#### Creating Flood Extent from Satellite Imagery:

If official flood maps aren't available, you can create them using:

1. **Sentinel-2 Imagery** (Optical, 10m resolution)

   - URL: https://scihub.copernicus.eu/
   - Compare before/during/after flood images
   - Use NDWI (Normalized Difference Water Index) to detect water

2. **Sentinel-1 SAR** (Radar, penetrates clouds)

   - Better for flood detection during storms
   - Free from Copernicus or Google Earth Engine

3. **Planet Labs** (Commercial, high-resolution)
   - URL: https://www.planet.com/
   - Free for research/education

**Processing Steps (QGIS/Python)**:

```python
# Using rasterio to detect water
import rasterio
import numpy as np

# Calculate NDWI from Sentinel-2
# NDWI = (Green - NIR) / (Green + NIR)
# Water bodies have high NDWI values

with rasterio.open('sentinel2_band3.tif') as green:
    with rasterio.open('sentinel2_band8.tif') as nir:
        green_data = green.read(1).astype(float)
        nir_data = nir.read(1).astype(float)

        ndwi = (green_data - nir_data) / (green_data + nir_data + 1e-10)

        # Threshold to create binary flood mask
        flood_mask = ndwi > 0.3

        # Save as GeoTIFF
        # ... (write to Zamboanga_FloodExtent_201701.tif)
```

---

## 📊 Data File Summary

| File                               | Size    | Source            | Update Frequency | Purpose             |
| ---------------------------------- | ------- | ----------------- | ---------------- | ------------------- |
| `zcroadmap.geojson`                | ~15 MB  | OpenStreetMap     | Weekly           | OSRM routing        |
| `terrain_roads.geojson`            | ~18 MB  | OSM + DEM + Flood | Manual           | Flood risk analysis |
| `Zamboanga_DEM.tiff`               | 79 KB   | SRTM/USGS         | Static (2000)    | Elevation lookup    |
| `Zamboanga_FloodExtent_201701.tif` | 1.15 MB | Satellite/Survey  | Event-based      | Flood detection     |

---

## 🔄 Updating the Data

### Update Road Network (Monthly/Quarterly)

```bash
# Download latest OSM data
cd backend/data
wget "https://overpass-api.de/api/interpreter?data=[bbox:6.8,122.0,7.0,122.2];way[highway];out geom;" -O zcroadmap_new.geojson

# Rebuild OSRM
cd ../
python rebuild_osrm.py
```

### Update Flood Data (After Major Events)

1. Check Copernicus EMS for new flood maps
2. Download post-event satellite imagery
3. Process to create flood extent raster
4. Re-enrich terrain_roads.geojson with new flood flags

---

## 🛠️ Tools for Working with This Data

### Desktop GIS

- **QGIS** (Free, Open Source): https://qgis.org/
  - Plugins: QuickOSM, GRASS, Semi-Automatic Classification

### Command Line

- **GDAL/OGR**: Raster/vector processing

  ```bash
  # Convert formats
  ogr2ogr -f GeoJSON output.geojson input.shp

  # Reproject
  gdalwarp -t_srs EPSG:4326 input.tif output.tif
  ```

### Python Libraries

```bash
pip install rasterio geopandas shapely fiona pyproj
```

```python
import geopandas as gpd
import rasterio
from rasterio.mask import mask
from shapely.geometry import mapping

# Read GeoJSON
roads = gpd.read_file('zcroadmap.geojson')

# Read raster
with rasterio.open('Zamboanga_DEM.tiff') as dem:
    # Extract elevation along roads
    ...
```

---

## 📞 Data Source Contacts

- **OpenStreetMap Philippines**: https://wiki.openstreetmap.org/wiki/Philippines
- **PAGASA**: info@pagasa.dost.gov.ph
- **USGS Customer Service**: custserv@usgs.gov
- **Copernicus Support**: https://scihub.copernicus.eu/userguide/

---

## 📝 Metadata Standards

All GeoJSON files follow:

- **Coordinate System**: WGS 84 (EPSG:4326)
- **Coordinates**: [longitude, latitude] order
- **Encoding**: UTF-8

All GeoTIFF files:

- **NoData Value**: Properly set
- **Compression**: DEFLATE or LZW
- **Tiling**: Yes (for large files)

---

## ⚠️ Data Usage Notes

1. **OSM Data**: Licensed under ODbL (Open Database License)

   - Attribution required: "© OpenStreetMap contributors"
   - ShareAlike for derivative works

2. **SRTM/USGS Data**: Public domain (US Government)

   - Free for any use
   - No attribution required but appreciated

3. **Copernicus Data**: Free and open

   - Attribution: "Contains modified Copernicus data [year]"

4. **Flood Event Data**: Check specific license
   - Government data usually public domain
   - Research data may have restrictions

---

## 🔗 Quick Links

- [USGS EarthExplorer](https://earthexplorer.usgs.gov/)
- [Overpass Turbo](https://overpass-turbo.eu/)
- [BBBike Extract](https://extract.bbbike.org/)
- [Copernicus Open Access Hub](https://scihub.copernicus.eu/)
- [OpenTopography](https://opentopography.org/)
- [PAGASA](https://www.pagasa.dost.gov.ph/)

---

**Last Updated**: October 29, 2025  
**Maintained by**: SafePathZamboanga Development Team
