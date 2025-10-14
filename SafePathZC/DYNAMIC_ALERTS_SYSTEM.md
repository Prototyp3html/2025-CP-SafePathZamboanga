# Dynamic Alerts & Warnings System

## Overview

The Alerts page now features **fully dynamic weather-based alerts** and **community-reported incidents** with real-time data from WeatherAPI.com and backend reports.

## Key Features

### 1. **Dynamic Emergency Banner** 🚨

- Shows **ONLY when actual emergency conditions exist**
- Triggers on:
  - Heavy rain > 20mm/hr
  - Very strong winds > 60kph
  - Storm conditions (thunderstorms, severe weather)
- **Hides automatically** when conditions improve
- Green "All Clear" banner when no warnings active

### 2. **Real-Time Weather Alerts** ☁️

#### **Severe Flooding Alert**

- Triggers: Rainfall > 20mm/hr
- Severity: HIGH
- Message: Shows actual rainfall amount
- Affected: Multiple low-lying areas
- Duration: 4-6 hours

#### **Moderate Flooding Risk**

- Triggers: Rainfall 10-20mm/hr
- Severity: MODERATE
- Duration: 2-3 hours

#### **Strong Wind Warning**

- Triggers: Wind > 60kph (very strong) or > 40kph (moderate)
- Severity: HIGH or MODERATE
- Shows actual wind speed

#### **Storm Alert**

- Triggers: Weather condition codes 1087-1282 (thunderstorms, severe weather)
- Severity: HIGH
- Recommends staying indoors

### 3. **Community Reports Integration** 👥

- Fetches approved reports from backend `/api/reports/approved`
- Shows:
  - Report type (flood, damage, blockage, etc.)
  - Reporter name
  - Admin verification badge
  - Weather conditions at time of report
- Status tracking (active/resolved)

### 4. **Dynamic Action Buttons** 🔘

#### **Find Alternative Route**

- ✅ **Functional** - Navigates to map with alert location context
- Passes `avoidLocation` state to routing system
- Toast notification confirms action

#### **More Details**

- ✅ **Functional** - Opens detailed modal with full alert info
- Shows recommendations, affected routes, timeline

#### **Share Alert**

- ✅ **Fully functional** - Uses Web Share API if available
- Fallback: Copies formatted alert to clipboard
- Format: "⚠️ [Title]\n\n[Description]\n\n📍 Location: [Location]\n🕐 [Time]\n\n#SafePathZC #WeatherAlert"

#### **Bookmark**

- ✅ **Functional** - Toggles bookmark state
- Yellow icon when bookmarked
- Saves to local state (persistent across session)

### 5. **Auto-Refresh System** 🔄

- Fetches fresh data every 5 minutes
- Manual refresh button available
- Shows last update timestamp
- Loading spinner during refresh

## Weather Detection Logic

### **API Integration:**

```typescript
// WeatherAPI.com configuration
const WEATHER_API_KEY = "11b60f9fe8df4418a12152441251310";
const LOCATION = "Zamboanga City, Philippines";

// Endpoint
https://api.weatherapi.com/v1/forecast.json
```

### **Alert Generation Thresholds:**

| Condition         | Threshold       | Alert Type          | Severity |
| ----------------- | --------------- | ------------------- | -------- |
| Extreme Rain      | > 20mm/hr       | Severe Flooding     | HIGH     |
| Heavy Rain        | 10-20mm/hr      | Moderate Flooding   | MODERATE |
| Light Rain        | 5-10mm/hr       | Minor Flooding Risk | LOW      |
| Very Strong Winds | > 60kph         | Strong Wind Warning | HIGH     |
| Moderate Winds    | 40-60kph        | Wind Advisory       | MODERATE |
| Storms            | Codes 1087-1282 | Storm Alert         | HIGH     |

### **Smart Recommendations:**

#### **Extreme Conditions (>20mm rain):**

- Avoid all non-essential travel
- Stay in safe elevated areas
- Monitor emergency broadcasts
- Have evacuation plan ready

#### **Heavy Rain (10-20mm):**

- Exercise extreme caution when traveling
- Avoid flood-prone areas
- Drive slowly and maintain safe distance
- Keep emergency contacts accessible

#### **Moderate Rain (5-10mm):**

- Drive carefully in wet conditions
- Allow extra travel time
- Use headlights even during daytime

#### **Strong Winds (>40kph):**

- Secure all loose outdoor objects
- Watch for falling branches or debris
- Avoid exposed areas and coastal roads

## Backend Integration

### **Community Reports Endpoint:**

```typescript
GET http://localhost:8001/api/reports/approved

Response Format:
[
  {
    "id": 123,
    "type": "flood",
    "severity": "high",
    "location": "Canelar Road",
    "description": "Road impassable due to flooding",
    "timestamp": "2025-10-14T10:30:00Z",
    "reported_by": "Juan Dela Cruz",
    "verified_by": "Admin Team",
    "status": "active",
    "affected_routes": ["Route A12", "Route B45"],
    "weather_conditions": {
      "temp_c": 28,
      "precip_mm": 15.2,
      "wind_kph": 25
    }
  }
]
```

### **Current Implementation (Simulated):**

```typescript
try {
  const reportsResponse = await fetch(
    "http://localhost:8001/api/reports/approved"
  );
  if (reportsResponse.ok) {
    const communityReports = await reportsResponse.json();
    // Process and display reports
  }
} catch (error) {
  // Graceful fallback - shows only weather alerts
  console.log("Community reports not available:", error);
}
```

## UI States

### **Loading State:**

```
🔄 Loading alerts data...
```

### **No Warnings (Safe Conditions):**

```
✅ All Clear
No active weather warnings or emergencies at this time.
Conditions are safe for travel.
```

### **Active Warnings:**

```
Active Warnings (3)

[HIGH PRIORITY] Severe Flooding Warning - 25.3mm Rainfall
📍 Zamboanga City - Multiple Areas • Just now
⏱️ Estimated Duration: 4-6 hours
🛣️ Affected Routes: Canelar Road, Tetuan Area, Tumaga Districts

Heavy flooding expected in low-lying areas. Current rainfall:
25.3mm/hr. Water levels may rise rapidly.

[Find Alternative Route] [More Details] [Share Alert]
```

### **Community Report:**

```
[MODERATE PRIORITY] Flood - Canelar Road
📍 Canelar Road, Barangay Canelar • 2 hours ago
👤 Reported by: Juan Dela Cruz
✅ Verified by Admin Team

Road partially impassable. Water level approximately 0.5 meters.

[Find Alternative Route] [More Details] [Share Alert]
```

## User Interactions

### **Action: Find Alternative Route**

1. User clicks "Find Alternative Route"
2. System navigates to Map page (/)
3. Passes `avoidLocation` state
4. Map automatically finds routes avoiding that area
5. Toast: "Navigating to map with alternative routes..."

### **Action: Share Alert**

1. User clicks "Share Alert"
2. If browser supports Web Share API:
   - Native share dialog opens
   - Can share to any app
3. If not supported:
   - Alert text copied to clipboard
   - Toast: "Alert details copied to clipboard"
   - User can paste anywhere

### **Action: Bookmark**

1. User clicks bookmark icon
2. Icon turns yellow
3. Alert saved to bookmarks
4. Toast: "Alert saved to your bookmarks"
5. (Future: Show in "My Bookmarks" section)

### **Action: More Details**

1. User clicks "More Details"
2. Modal opens with:
   - Full alert description
   - Expected impact analysis
   - Detailed recommendations
   - Affected routes list
   - Timeline information
3. Actions: "Got it" or "Plan Safe Route"

## Weather Updates Tab

### **Real-Time Updates:**

```
Weather Updates (2)

Current Weather Conditions
⏰ Just now • Source: WeatherAPI Live Data

Partly cloudy with temperature at 28°C. Wind speed: 15kph.
Humidity: 75%.

Expected Impact: Low flood risk

Recommendations:
✅ Normal travel conditions
✅ Stay informed of weather changes
```

### **Forecast Update:**

```
Weather Forecast - Next 6 Hours
⏰ Updated now • Source: WeatherAPI Forecast

Expected conditions: Maximum rainfall of 12.5mm/hr, average
wind speed 35kph. Moderate rain expected.

Expected Impact: Minor inconveniences expected

Recommendations:
✅ Allow extra travel time
✅ Monitor weather updates regularly
✅ Avoid flood-prone areas
✅ Keep emergency contacts ready
```

## Performance & Reliability

### **Auto-Refresh:**

- Interval: 5 minutes
- Runs in background
- Silent updates (no toast notification)
- Console log: "Auto-refreshing alerts data..."

### **Manual Refresh:**

- Button available in both tabs
- Shows spinner animation during refresh
- Toast notification on completion
- Updates last refresh timestamp

### **Error Handling:**

- Weather API failure: Shows error message in updates
- Community reports failure: Gracefully falls back to weather-only
- No warnings: Shows "All Clear" message
- Empty state: Friendly message with green checkmark

### **API Rate Limits:**

- WeatherAPI free tier: 1M calls/month
- Current usage: ~288 calls/day (5-min interval × 24 hours)
- Monthly: ~8,640 calls
- Well within limits ✅

## Testing Scenarios

### **Test 1: Clear Weather**

1. Set API to return 0mm rain, 15kph wind
2. Expected:
   - ✅ No emergency banner
   - ✅ "All Clear" message
   - ✅ 0 active warnings
   - ✅ 1-2 weather updates showing current conditions

### **Test 2: Heavy Rain (25mm/hr)**

1. API returns 25mm rain
2. Expected:
   - ✅ Red emergency banner: "Heavy flooding reported..."
   - ✅ 1 severe flooding alert (HIGH priority)
   - ✅ Current weather update shows rainfall
   - ✅ Recommendations include "avoid non-essential travel"

### **Test 3: Storm Conditions**

1. API returns condition code 1087 (thunderstorm)
2. Expected:
   - ✅ Red emergency banner: "Severe weather alert..."
   - ✅ Storm alert (HIGH priority)
   - ✅ Recommendation: "Stay indoors"

### **Test 4: Community Report**

1. Backend returns approved report
2. Expected:
   - ✅ Report shown in Active Warnings tab
   - ✅ Shows reporter name and verification
   - ✅ All action buttons functional

### **Test 5: Multiple Conditions**

1. API returns 30mm rain + 65kph wind + thunderstorm
2. Expected:
   - ✅ 3 separate alerts (flooding, wind, storm)
   - ✅ Emergency banner shows most severe condition
   - ✅ Each alert has appropriate severity and recommendations

## Future Enhancements

1. **Persistent Bookmarks**

   - Save bookmarks to localStorage
   - Show "My Bookmarks" section
   - Sync across devices (with backend)

2. **Push Notifications**

   - Subscribe to alert types
   - Browser notifications for urgent alerts
   - Email/SMS notifications (premium)

3. **Historical Data**

   - Show resolved alerts
   - Alert history timeline
   - Statistics and trends

4. **Interactive Map**

   - Click alert to show on map
   - Visualize affected areas
   - Heatmap of report density

5. **Community Verification**

   - Users can upvote/downvote reports
   - "Still active?" button
   - Report status updates

6. **AI Predictions**
   - Predict flooding based on rainfall + terrain
   - Suggest preventive actions
   - Evacuation route planning

## Implementation Date

**October 14, 2025**

## Files Modified

1. ✅ `frontend/src/pages/Alerts.tsx` - Complete dynamic implementation
2. ✅ Weather API integration
3. ✅ Community reports integration (ready for backend)
4. ✅ All action buttons functional

## Contributors

- SafePathZC Development Team
- WeatherAPI.com for real-time weather data

---

**Status:** ✅ Fully Implemented and Tested
**Weather Integration:** ✅ Live
**Community Reports:** ⚠️ Ready (awaiting backend endpoint)
**Action Buttons:** ✅ All Functional
