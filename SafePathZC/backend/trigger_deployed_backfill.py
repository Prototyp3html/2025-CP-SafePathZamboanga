#!/usr/bin/env python3
"""
Trigger flood data backfill on deployed Railway app
"""

import requests
import time
import sys

# Configuration
BACKEND_URL = "https://safepath-zc-production.up.railway.app"
ADMIN_EMAIL = "admin@safepath.com"
ADMIN_PASSWORD = "admin123"

# Historical rainfall data (from Open-Meteo for Dec 15-19)
rainfall_data = {
    "2025-12-15": 9.7,
    "2025-12-16": 1.1,
    "2025-12-17": 4.3,
    "2025-12-18": 3.2,
    "2025-12-19": 0.3
}

print("=" * 70)
print("BACKFILLING FLOOD DATA TO DEPLOYED APP (Railway)")
print("=" * 70)

# Step 1: Login
print("\n🔐 Logging in to admin account...")
try:
    login_response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10
    )
    
    if login_response.status_code == 200:
        login_data = login_response.json()
        token = login_data.get('access_token')
        if token:
            print(f"✅ Login successful! Got auth token")
        else:
            print(f"❌ Login response doesn't have access_token")
            print(f"Response: {login_data}")
            sys.exit(1)
    else:
        print(f"❌ Login failed: {login_response.status_code}")
        print(f"Response: {login_response.text}")
        sys.exit(1)
        
except Exception as e:
    print(f"❌ Login error: {e}")
    sys.exit(1)

# Step 2: Trigger flood updates for each day
print("\n" + "=" * 70)
print("Triggering flood updates for each day...")
print("=" * 70)

headers = {"Authorization": f"Bearer {token}"}

for date_str in sorted(rainfall_data.keys()):
    rainfall_mm = rainfall_data[date_str]
    
    print(f"\n📅 {date_str}: Triggering update with {rainfall_mm}mm rainfall...")
    
    try:
        # Call the manual flood update endpoint
        update_response = requests.post(
            f"{BACKEND_URL}/admin/flood/update",
            json={"rainfall_mm": rainfall_mm},
            headers=headers,
            timeout=300  # 5 minute timeout for long-running update
        )
        
        if update_response.status_code == 200:
            print(f"   ✅ Update triggered successfully")
        else:
            print(f"   ❌ Update failed: {update_response.status_code}")
            print(f"   Response: {update_response.text[:200]}")
    
    except requests.exceptions.Timeout:
        print(f"   ⏱️  Update is running (timeout after 5 mins - this is normal)")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Small delay between requests
    print("   Waiting 3 seconds before next update...")
    time.sleep(3)

print("\n" + "=" * 70)
print("✅ BACKFILL REQUESTS COMPLETED!")
print("=" * 70)
print("\nThe deployed app should now be processing the historical flood data.")
print("Check your deployed site in a few minutes to see the flood hotspots!")
print("https://safepath-zamboanga-city.vercel.app/")
