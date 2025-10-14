# Weather Updates News Feed System

## Overview

The Weather Updates tab on the Alerts page now functions as a **dynamic news feed** displaying weather bulletins in chronological order, with newest posts appearing first. This mimics popular social media platforms like Facebook, Twitter, and Instagram.

---

## 📰 News Feed Features

### 1. **Chronological Sorting**

- **Newest First**: Most recent bulletins appear at the top
- **Automatic Sorting**: Posts sorted by `postedAt` timestamp (descending order)
- **Dynamic Updates**: New bulletins automatically appear at top when fetched

### 2. **Post Types**

The feed displays three types of weather updates:

#### 🌪️ PAGASA Official Bulletins (Highest Priority)

- **Source**: Philippine Atmospheric, Geophysical and Astronomical Services Administration
- **Visual Indicator**: Orange left border, gradient background, "Official" badge
- **Region Filter**: Shows only Zamboanga/Mindanao-relevant bulletins
- **Types**: Typhoon bulletins, rainfall advisories, general weather advisories
- **Badge**: "Zamboanga" badge for region-specific bulletins

#### 🌤️ Current Weather Conditions

- **Source**: WeatherAPI Live Data
- **Real-time Updates**: Shows current temperature, rainfall, wind speed, humidity
- **Risk Assessment**: Displays flood risk level based on current conditions
- **Blue Left Border**: Standard SafePath weather post styling

#### 📊 Weather Forecast (6-Hour)

- **Source**: WeatherAPI Forecast
- **Predictive Data**: Shows expected rainfall and wind conditions
- **Conditional Display**: Only appears when significant weather expected (>5mm rain OR >30kph wind)
- **Impact Analysis**: Predicts flash flooding risk and travel disruptions

---

## 🎨 Social Media-Style UI Elements

### Post Card Design

```
┌─────────────────────────────────────────────────────┐
│ [Avatar] PAGASA             [Official] [Zamboanga]  │
│          Just now • PAGASA Official                  │
├─────────────────────────────────────────────────────┤
│ 🌧️ Rainfall Advisory                                │
│                                                       │
│ Heavy rainfall expected in Zamboanga Peninsula...   │
│                                                       │
│ ⚠️ Expected Impact                                   │
│   Flooding possible in low-lying areas               │
│                                                       │
│ 💡 Safety Recommendations                            │
│   ✓ Follow official PAGASA updates                  │
│   ✓ Prepare emergency supplies                      │
│                                                       │
│ [Share] [Details] [View Source]                     │
└─────────────────────────────────────────────────────┘
```

### Visual Elements

- **Avatar Icons**:
  - PAGASA: Orange gradient circle with cloud-sun icon
  - SafePath: Blue gradient circle with temperature/chart icon
- **Badges**:
  - "Official" (Orange): PAGASA verified content
  - "Zamboanga" (Green): Region-specific bulletins
  - Bulletin Type (Orange outline): e.g., "🌧️ Rainfall Advisory"
- **Colored Borders**:
  - Orange (left border): PAGASA posts
  - Blue (left border): SafePath weather posts
- **Gradient Backgrounds**: PAGASA posts have subtle orange-to-white gradient
- **Staggered Animation**: Posts fade in with 100ms delay between each

---

## 🔄 Data Flow

### Backend Data Sources

1. **PAGASA Website Scraping** (`fetch_pagasa_bulletin()`)

   - URL: https://www.pagasa.dost.gov.ph/
   - Method: BeautifulSoup4 web scraping
   - Filters: Zamboanga/Mindanao keywords
   - Endpoint: `GET /api/pagasa/bulletins`

2. **WeatherAPI.com Live Data** (`fetch_zamboanga_weather()`)
   - Location: Zamboanga City, Philippines (6.91°N, 122.07°E)
   - Data: Current conditions + 6-hour forecast
   - API Key: 11b60f9fe8df4418a12152441251310

### Frontend Data Processing

```typescript
// 1. Fetch PAGASA bulletins (highest priority)
const pagasaResponse = await fetch(
  "http://localhost:8001/api/pagasa/bulletins"
);

// 2. Add to updates array with metadata
updates.push({
  id: `pagasa-${Date.now()}-${index}`,
  type: bulletin.type,
  title: bulletin.title,
  postedAt: new Date().toISOString(), // For sorting
  isPagasa: true,
  regionSpecific: bulletin.region_specific,
  // ... other fields
});

// 3. Add current weather as news post
updates.push({
  id: `weather-${Date.now()}`,
  type: "current",
  postedAt: new Date().toISOString(),
  // ... weather data
});

// 4. Add forecast if significant
if (maxRain > 5 || avgWind > 30) {
  updates.push({
    id: `forecast-${Date.now()}`,
    type: "forecast",
    postedAt: new Date().toISOString(),
    // ... forecast data
  });
}

// 5. Sort by timestamp (newest first)
updates.sort((a, b) => {
  const dateA = new Date(a.postedAt || 0).getTime();
  const dateB = new Date(b.postedAt || 0).getTime();
  return dateB - dateA; // Descending
});
```

---

## 🗂️ Post Metadata Structure

Each post in the feed contains:

```typescript
interface WeatherUpdate {
  id: string; // Unique ID (e.g., "pagasa-1729012345-0")
  type: string; // 'advisory', 'typhoon', 'rainfall', 'current', 'forecast'
  title: string; // Post headline
  description: string; // Main content
  timestamp: string; // Human-readable (e.g., "Just now", "5 minutes ago")
  postedAt: string; // ISO timestamp for sorting
  source: string; // "PAGASA Official", "WeatherAPI Live Data"
  bulletinType?: string; // "🌪️ Typhoon Bulletin", "🌧️ Rainfall Advisory"
  impact: string; // Expected consequences
  recommendations: string[]; // Safety tips
  isPagasa: boolean; // True for PAGASA bulletins
  regionSpecific?: boolean; // True if mentions Zamboanga/Mindanao
  isBookmarked: boolean; // User bookmark status
  weather_data?: any; // Raw weather data (for current conditions)
}
```

---

## 🎯 PAGASA Regional Filtering

### Zamboanga/Mindanao Keywords

The backend filters PAGASA bulletins using these keywords:

```python
zamboanga_keywords = [
    'zamboanga', 'mindanao', 'region ix', 'region 9', 'peninsula',
    'basilan', 'sulu', 'tawi-tawi', 'zamboanga del sur', 'zamboanga sibugay',
    'zamboanga del norte', 'southern philippines', 'barmm', 'bangsamoro'
]
```

### Filtering Logic

1. **Region-Specific**: Bulletin mentions Zamboanga/Mindanao keywords → Show with "Zamboanga" badge
2. **General Warning**: Nationwide typhoon/tropical cyclone → Show without regional badge
3. **Irrelevant**: Manila/Luzon/Visayas-only → Skip entirely

### Sorting Priority

1. Region-specific bulletins first
2. General warnings second
3. Newest to oldest within each category

---

## 🔄 Auto-Refresh Mechanism

### Automatic Updates

- **Interval**: Every 5 minutes
- **Implementation**: `useEffect` with `setInterval`
- **Function**: `fetchAlertsData()`

### Manual Refresh

- **Button**: "Refresh" button with spinning icon animation
- **State**: `isRefreshing` prevents multiple simultaneous refreshes
- **Toast Notification**: Shows success message after refresh

```typescript
useEffect(() => {
  fetchAlertsData();
  const interval = setInterval(fetchAlertsData, 5 * 60 * 1000); // 5 minutes
  return () => clearInterval(interval);
}, []);
```

---

## 🎨 Color Scheme

| Element         | Color               | Usage                        |
| --------------- | ------------------- | ---------------------------- |
| PAGASA Border   | Orange-500          | Left border on PAGASA posts  |
| PAGASA Badge    | Orange-500          | "Official" badge background  |
| PAGASA Avatar   | Orange gradient     | Source indicator             |
| SafePath Border | WMSU Blue           | Left border on weather posts |
| SafePath Avatar | Blue gradient       | Source indicator             |
| Region Badge    | Green-500           | "Zamboanga" region indicator |
| Impact Section  | Blue-50 background  | Expected impact highlight    |
| Recommendations | Amber-50 background | Safety tips highlight        |

---

## 📱 Responsive Design

### Desktop (>768px)

- Full-width cards with all metadata visible
- Three-column action buttons
- Large avatar icons (48px)

### Mobile (<768px)

- Stacked layout
- Smaller avatar icons (40px)
- Two-column action buttons
- Condensed badges

---

## 🚀 Future Enhancements

### Planned Features

1. **Live Updates**: WebSocket for real-time push notifications
2. **Comment System**: Allow users to comment on bulletins
3. **React System**: Like/helpful reactions on posts
4. **Filter Options**: Filter by post type, severity, or source
5. **Pagination**: Load more posts as user scrolls
6. **Search**: Search through bulletin history
7. **Notifications**: Push notifications for new PAGASA bulletins
8. **Offline Support**: Cache recent bulletins for offline viewing

### Technical Improvements

1. **Caching**: Redis cache for PAGASA bulletins (15-minute TTL)
2. **Rate Limiting**: Prevent excessive API calls
3. **Error Boundaries**: Graceful degradation if PAGASA scraping fails
4. **Analytics**: Track which bulletins users engage with
5. **A/B Testing**: Test different post card designs

---

## 📊 Performance Metrics

### Target Performance

- **Initial Load**: < 2 seconds
- **Refresh Time**: < 1 second
- **Animation Frame Rate**: 60 FPS
- **Bundle Size Impact**: < 5KB additional

### Optimization Strategies

- **Lazy Loading**: Images and heavy components
- **Memoization**: React.memo for post cards
- **Virtual Scrolling**: For feeds with 50+ posts
- **Code Splitting**: Separate bundle for Alerts page

---

## 🐛 Known Limitations

1. **PAGASA Scraping Brittleness**: Website structure changes break scraper
2. **No Historical Data**: Only shows current bulletins (no archive)
3. **Manual Timestamps**: PAGASA timestamps are scraped text, not structured data
4. **No Real-time Push**: Updates only on 5-minute intervals or manual refresh
5. **No User Personalization**: Same feed for all users (future: personalized based on location)

---

## 🔧 Maintenance

### Regular Tasks

- **Weekly**: Verify PAGASA scraper still works
- **Monthly**: Review filter keywords for relevance
- **Quarterly**: Performance audit and optimization

### Monitoring

- Log PAGASA fetch failures
- Track bulletin relevance (user feedback)
- Monitor API rate limits

---

## 📝 Code Locations

| Component       | File Path                       | Lines     |
| --------------- | ------------------------------- | --------- |
| News Feed UI    | `frontend/src/pages/Alerts.tsx` | 721-870   |
| Data Fetching   | `frontend/src/pages/Alerts.tsx` | 66-330    |
| PAGASA Scraper  | `backend/main.py`               | 1601-1685 |
| PAGASA Endpoint | `backend/main.py`               | 1736-1745 |
| Weather Fetch   | `backend/main.py`               | 1549-1595 |

---

## 🎓 User Guide

### How to Use the News Feed

1. Navigate to **Alerts page** → **Weather Updates tab**
2. Scroll through bulletins (newest at top)
3. Click **"Details"** to see full information
4. Click **"Share"** to share bulletin with others
5. Click **bookmark icon** to save important bulletins
6. Click **"View Source"** on PAGASA posts to visit official website
7. Click **"Refresh"** button to manually fetch latest bulletins

### Understanding Badges

- **🟠 Official**: Verified PAGASA content
- **🟢 Zamboanga**: Region-specific bulletin
- **🌪️ Typhoon Bulletin**: Tropical cyclone information
- **🌧️ Rainfall Advisory**: Precipitation warning

---

## ✅ Testing Checklist

### Functionality Tests

- [ ] PAGASA bulletins appear first in feed
- [ ] Posts sorted newest to oldest
- [ ] Region-specific badges show correctly
- [ ] Bookmark functionality works
- [ ] Share button opens share dialog
- [ ] Details button shows modal with full info
- [ ] Refresh button fetches new data
- [ ] Empty state shows when no bulletins
- [ ] Auto-refresh works every 5 minutes

### Visual Tests

- [ ] PAGASA posts have orange styling
- [ ] SafePath posts have blue styling
- [ ] Avatar icons display correctly
- [ ] Badges align properly
- [ ] Cards animate on load
- [ ] Responsive on mobile devices
- [ ] High contrast for accessibility

### Integration Tests

- [ ] Backend PAGASA endpoint returns data
- [ ] Backend filters Zamboanga bulletins correctly
- [ ] Frontend handles API errors gracefully
- [ ] Frontend handles empty PAGASA response
- [ ] Timezone displays correctly (Asia/Manila)

---

## 📚 Related Documentation

- [PAGASA_INTEGRATION.md](./PAGASA_INTEGRATION.md) - PAGASA scraper details
- [DYNAMIC_ALERTS_SYSTEM.md](./DYNAMIC_ALERTS_SYSTEM.md) - Overall alerts system
- [WEATHER_ROUTING_INTEGRATION.md](./WEATHER_ROUTING_INTEGRATION.md) - Weather-aware routing

---

**Last Updated**: October 15, 2025  
**Version**: 1.0.0  
**Status**: ✅ Production Ready
