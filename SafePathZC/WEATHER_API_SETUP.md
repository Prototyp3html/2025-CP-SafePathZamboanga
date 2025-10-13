# Weather API Setup Guide

## WeatherAPI.com Integration

The weather dashboard now uses **WeatherAPI.com** for accurate Zamboanga City weather data.

### Why WeatherAPI.com?

- ✅ **1,000,000 free requests/month** (very generous free tier)
- ✅ **Excellent coverage for Philippines/Southeast Asia**
- ✅ **More accurate than Open-Meteo for local weather**
- ✅ **No credit card required** for free tier
- ✅ **Real-time weather updates**

---

## Setup Instructions

### Step 1: Get Your Free API Key

1. **Visit**: https://www.weatherapi.com/signup.aspx
2. **Sign up** with your email (takes 30 seconds)
3. **Verify your email** (check inbox/spam)
4. **Login** to your dashboard: https://www.weatherapi.com/my/
5. **Copy your API key** from the dashboard

### Step 2: Configure the API Key

1. Open the file: `SafePathZC/frontend/.env`
2. Replace `your_weatherapi_key_here` with your actual API key:

```env
VITE_WEATHER_API_KEY=abc123your_actual_api_key_here456
```

3. **Save the file**

### Step 3: Restart the Frontend

If your frontend is running, restart it to load the new environment variable:

```powershell
# Stop the current frontend (Ctrl+C in the terminal)
# Then start it again:
cd SafePathZC/frontend
npm run dev
```

---

## Testing the Weather Dashboard

1. **Open your application** in the browser
2. **Click the Weather icon** in the map interface
3. You should see:
   - Current temperature for Zamboanga City
   - Humidity and wind speed
   - Weather condition (Clear, Rainy, Cloudy, etc.)
   - 3-hour forecast
   - Weather advisory for travel safety

---

## Troubleshooting

### Error: "Invalid API key"

- Make sure you copied the entire API key correctly
- Check that there are no extra spaces before/after the key in `.env`
- Restart your frontend server after changing `.env`

### Error: "Failed to fetch weather data"

- Check your internet connection
- Verify the API key is active in your WeatherAPI.com dashboard
- Check if you've exceeded the free tier limit (unlikely with 1M requests/month)

### Weather data seems incorrect

- WeatherAPI.com pulls from multiple reliable sources
- Data updates every 15 minutes
- If weather seems very different from reality, try refreshing the dashboard

---

## API Limits (Free Tier)

- **1,000,000 calls/month** = ~33,000 calls/day
- **Real-time weather** updates
- **3-day forecast** included
- **No credit card** required

---

## File Locations

- **Weather Component**: `SafePathZC/frontend/src/components/WeatherDashboard.tsx`
- **Environment Config**: `SafePathZC/frontend/.env`
- **Example Config**: `SafePathZC/frontend/.env.example`

---

## Support

- **WeatherAPI Docs**: https://www.weatherapi.com/docs/
- **Dashboard**: https://www.weatherapi.com/my/
- **API Status**: https://www.weatherapi.com/api-status.aspx

---

## Changes Made

✅ Replaced Open-Meteo API with WeatherAPI.com
✅ Updated weather data structure to match WeatherAPI format
✅ Configured for Zamboanga City specifically
✅ No fallback APIs (clean, single source)
✅ Added environment variable configuration
✅ Better accuracy for Philippine weather conditions
