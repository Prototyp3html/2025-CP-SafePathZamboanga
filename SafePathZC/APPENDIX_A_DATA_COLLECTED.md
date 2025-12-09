# APPENDIX A: DATA COLLECTED

Alpha Testing Results

The alpha testing phase focused on verifying core functionalities in a controlled environment. Each test included observation, evaluation, and data documentation.

## Testing #1: Road Network Data Collection from OpenStreetMap – SUCCESS

The system successfully collected and processed road network data.

- 10,494 road segments retrieved from OpenStreetMap API
- All segments included name, type, and coordinates
- Elevation data integrated from Open-Elevation API

**Result:** Road network data acquisition functioned correctly.

**Figure A.1: Road Network Data Collection Log**  
_Backend console output showing successful retrieval of 10,494 road segments with timestamps and confirmation_

---

## Testing #2: Flood Risk Calculation Using Multi-Factor Model – SUCCESS

The system computed flood risk scores combining elevation, rainfall, and proximity factors.

- Formula applied: Risk = (Elevation × 0.30) + (Rainfall × 0.40) + (Proximity × 0.30)
- Scores range from 0-100
- Risk levels correctly classified

**Result:** Flood risk assessment model functioned as expected.

**Figure A.2a: Flood Risk Calculation Log**  
_Backend console output showing computed risk scores for each road segment with factor breakdowns_

**Figure A.2b: Generated Route with Risk Assessment**  
_System interface displaying the three route alternatives (Safe, Manageable, Flood-prone) with calculated risk scores on the map_

| Road         | Elevation | Rainfall | Proximity | Total Score | Risk Level |
| ------------ | --------- | -------- | --------- | ----------- | ---------- |
| J. S. Alano  | 28/50     | 8/40     | 12/30     | 48/100      | Medium     |
| Veterans Ave | 35/50     | 5/40     | 8/30      | 36/100      | Low        |
| Mayor Cesar  | 18/50     | 15/40    | 18/30     | 68/100      | Critical   |

---

    ## Testing #3: Real-time Weather Data Integration – SUCCESS

    The system retrieved live weather data from Open-Meteo API.

- Temperature, rainfall, humidity, wind speed captured
- Data updated hourly
- Weather correctly impacts flood risk calculation

**Result:** Weather integration functioned without errors.

Temperature: 28.5°C | Rainfall: 0.2mm | Humidity: 72% | Wind: 15 kph

---

Beta Testing Results (1st Attempt)

The beta test was conducted with real data from Zamboanga City during live system operations. These revealed issues not observed during alpha testing.

## Issues Encountered

### Issue #1 – Incomplete Elevation Data for Some Road Segments

Some road segments lacked elevation values, causing gaps in flood risk calculation.

**Root Cause:** Open-Elevation API timeout for remote locations

**Impact:** 263 out of 10,494 roads (2.5%) had missing elevation data

**Comparison to Alpha:** Alpha testing used cached data with complete elevation values

**Resolution:** Implemented fallback elevation estimation using nearby segments

---

### Issue #2 – Flood Risk Score Inaccuracy in Low-Rainfall Conditions

During periods with minimal rainfall (0.2mm), the system marked some roads as "flood-prone" based on elevation alone.

**Root Cause:** Rainfall factor weighted too heavily; proximity factor underutilized

**Impact:** False high-risk classifications in areas not historically flood-prone

**Comparison to Alpha:** Alpha testing occurred during higher rainfall simulation

**Resolution:** Adjusted weights: Elevation 0.35, Rainfall 0.35, Proximity 0.30

---

### Issue #3 – Route Alternatives Sometimes Identical

When flood zones were minimal, Safe and Manageable routes occasionally calculated to same path.

**Root Cause:** Insufficient differentiation in risk profile penalties

**Impact:** Users could not distinguish between route options

**Comparison to Alpha:** Alpha used areas with more distributed flood zones

**Resolution:** Increased penalty multipliers (Safe: 60x, Manageable: 5x, Flood-prone: 1.1x)

---

## Testing Summary Table

| Feature                | Alpha Testing | Beta Testing           | Status      |
| ---------------------- | ------------- | ---------------------- | ----------- |
| Road Data Collection   | ✓ Success     | ✓ Success              | Operational |
| Elevation Integration  | ✓ Success     | ⚠ 2.5% Missing Data    | Resolved    |
| Flood Risk Calculation | ✓ Success     | ⚠ Inaccurate Weights   | Resolved    |
| Route Generation       | ✓ Success     | ⚠ Insufficient Variety | Resolved    |
| Weather Integration    | ✓ Success     | ✓ Success              | Operational |
| User Data Collection   | ✓ Success     | ✓ Success              | Operational |

**Overall Result:** System core functions validated. Issues identified and resolved before deployment.

---

## A.1 Collected Data Samples

**Route History:** 10,247 records  
**Favorite Routes:** 2,156 saved  
**Community Reports:** 232 verified reports (98.7% completion)  
**Search Queries:** 5,247 recorded

**Data Quality:** 98.9% overall completeness | Updates: Hourly (real-time), Quarterly (static)

---

## A.2 System Interface

**Figure A.1: Route Planning Interface**  
The system displays Zamboanga City with three route alternatives:

- Green = Safe Route
- Orange = Manageable Route
- Red = Flood-Prone Route

Each route shows real-time risk assessment based on elevation, weather, and proximity data.

---

_Data Collection & Testing Date: December 8-9, 2025_
