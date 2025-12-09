# APPENDIX B: SYSTEM DESIGN

## Overview

This appendix documents the system architecture and user interfaces of SafePath Zamboanga. The design follows a modular approach with separate components for route planning, flood assessment, and community reporting.

---

## Figure B.1: Main Navigation & Map Interface

**Description:**
This figure shows the primary user interface with the interactive mapping system.

1. **Top Navigation Bar** – Displays SafePath ZC branding and main menu options (Map, Routes, Alerts, Community, Settings)
2. **Search Bar** – Allows users to search for locations and navigate to destinations
3. **Interactive Map** – Central mapping component showing Zamboanga City with road network, terrain visualization, and flood zones
4. **Weather Widget** – Real-time weather conditions displayed in the bottom-left corner
5. **Control Buttons** – Zoom in/out, layer toggle, and location services
6. **Reports Panel** – Quick access to community reports and alerts on the right sidebar

---

## Figure B.2: Route Planning & Risk Assessment Interfaces

**Description:**
This figure presents the route selection and risk evaluation system.

1. **Route Input Form** – Origin and destination address fields with location search
2. **Transport Mode Selector** – Options for Walking, Bicycle, Motorcycle, Jeepney, Car
3. **Risk Profile Toggle** – User selects desired risk level (Safe, Manageable, Flood-Prone)
4. **Route Results Display** – Three alternative routes shown with:
   - Green line = Safe Route
   - Orange line = Manageable Route
   - Red line = Flood-Prone Route
5. **Route Details Panel** – Distance, duration, elevation gain/loss, and safety scores
6. **Hazard Summary** – Number of flooded segments and at-risk areas highlighted

---

## Figure B.3: Flood Risk Visualization & Data Layers

**Description:**
This figure demonstrates the flood risk assessment visualization on the map.

1. **Flood Zone Overlay** – Red/orange colored areas indicating active flood zones
2. **Elevation Heatmap Layer** – Color gradient showing terrain elevation (blue=low, red=high)
3. **Legend Display** – Scale showing elevation ranges (0m to 75m) and risk classifications
4. **Layer Toggle Menu** – Options to show/hide specific data layers:
   - Road Network
   - Elevation Heatmap
   - Flood Zones
   - Weather Radar
   - Community Reports
5. **Data Timestamp** – Last update time for flood and weather data

---

## Figure B.4: Community Reports & Alert System

**Description:**
This figure shows the user-generated reporting and alert management interface.

1. **Report Submission Form** – Fields for:

   - Report Category (Flood, Road Closure, Accident, Emergency, Infrastructure)
   - Urgency Level (Critical, High, Medium, Low)
   - Location Selection (Map-based or address input)
   - Description and Evidence Upload
   - Reporter Contact Information

2. **Reports List View** – Displays all community reports with:

   - Report title and category badges
   - Urgency level indicators
   - Location on map
   - Verification score
   - Timestamp

3. **Report Detail Modal** – Shows expanded information:

   - Full description
   - Attached images/evidence
   - Reporter information
   - Verification status
   - Admin notes (if reviewed)

4. **Map Pin Clustering** – Multiple reports grouped on map, expandable by zoom level

---

## Figure B.5: Weather Data Integration & Forecast

**Description:**
This figure illustrates the real-time weather monitoring and forecast system.

1. **Current Weather Widget** – Displays:

   - Temperature (°C)
   - Rainfall amount (mm)
   - Humidity percentage (%)
   - Wind speed (kph)
   - Weather condition icon
   - Last update timestamp

2. **Weather Forecast Panel** – 3-day outlook showing:

   - Daily weather conditions
   - Expected precipitation
   - Wind speed predictions
   - Risk level for each day

3. **Rainfall Graph** – Timeline showing rainfall trends over the past 24 hours

4. **Data Source Attribution** – Credit to Open-Meteo API

---

## Figure B.6: User Account & Settings Interfaces

**Description:**
This figure shows the user profile and system preferences management.

1. **User Profile Dashboard** – Displays:

   - User name and avatar
   - Account creation date
   - Number of saved routes
   - Favorite routes list
   - Search history

2. **Route History Interface** – Table showing:

   - Previous routes (origin, destination, date)
   - Route type selected (Safe/Manageable/Flood-Prone)
   - Duration and distance
   - Completion status

3. **Favorites Management** – Allows users to:

   - Save frequently used routes
   - Add custom route names
   - View frequency statistics
   - Delete saved routes

4. **Settings Panel** – Options for:
   - Notification preferences
   - Distance unit preferences (km/miles)
   - Map theme (light/dark)
   - Language selection
   - Data usage preferences

---

## Figure B.7: Admin Dashboard & Data Management

**Description:**
This figure presents the administrative interface for system management.

1. **System Overview Dashboard** – Displays key metrics:

   - Total road segments monitored (10,494)
   - Currently flooded roads (49)
   - Active users today
   - Recent reports count
   - System uptime percentage

2. **Flood Data Management** – Panel for:

   - Uploading flood zone updates
   - Adjusting flood risk thresholds
   - Viewing flood history timeline
   - Manual flood status verification

3. **Report Verification Interface** – Shows:

   - Unverified reports list
   - Verification score breakdown
   - Admin approval/rejection buttons
   - Evidence review (images)
   - Admin notes field

4. **System Configuration** – Options for:
   - Risk calculation weights adjustment
   - Route penalty multipliers
   - API integration settings
   - Data update frequency

---

## Figure B.8: Mobile Responsive Design

**Description:**
This figure demonstrates the mobile-optimized interface for smartphone users.

1. **Mobile Navigation Header** – Compact menu with hamburger button
2. **Responsive Map View** – Full-width map with touch controls
3. **Bottom Action Sheet** – Quick route options accessible without scrolling
4. **Mobile Search Interface** – Simplified location input for smaller screens
5. **Simplified Risk Profiles** – Three route buttons clearly visible
6. **Tap-friendly Buttons** – Large touch targets for easy mobile interaction

---

_System Design Documentation Date: December 9, 2025_  
_Version: 2.0.0_
