import requests
import json

try:
    response = requests.get('http://localhost:8001/api/flood-history/hotspots?limit=5&min_risk_score=0')
    print(f'Status: {response.status_code}')
    data = response.json()
    print(f'Total hotspots returned: {len(data) if isinstance(data, list) else "N/A"}')
    if isinstance(data, list) and len(data) > 0:
        print(f'\nFirst hotspot:')
        print(json.dumps(data[0], indent=2, default=str))
    else:
        print(f'Response: {json.dumps(data, indent=2, default=str)[:500]}')
except Exception as e:
    print(f'Error: {e}')
