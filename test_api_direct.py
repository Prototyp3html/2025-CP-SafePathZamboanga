import requests

# Test Open-Meteo API directly
url = "https://api.open-meteo.com/v1/forecast"
params = {
    'latitude': 6.9271,
    'longitude': 122.0789,
    'daily': ['precipitation_sum', 'precipitation_probability'],  # Try as list
    'timezone': 'Asia/Manila',
    'forecast_days': 7
}

print("Test 1: Daily as Python list")
try:
    response = requests.get(url, params=params)
    print(f"Status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error: {response.json()}")
except Exception as e:
    print(f"Error: {e}")

# Try again with comma-separated string
params2 = {
    'latitude': 6.9271,
    'longitude': 122.0789,
    'daily': 'precipitation_sum',  # Try single param
    'timezone': 'Asia/Manila', 
    'forecast_days': 7
}

print("\nTest 2: Daily with single parameter")
try:
    response = requests.get(url, params=params2)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        print("✅ SUCCESS!")
        data = response.json()
        print(f"Got {len(data['daily']['time'])} days of forecast")
        for i in range(min(3, len(data['daily']['time']))):
            print(f"  {data['daily']['time'][i]}: {data['daily']['precipitation_sum'][i]}mm")
    else:
        print(f"Error: {response.json()}")
except Exception as e:
    print(f"Error: {e}")
