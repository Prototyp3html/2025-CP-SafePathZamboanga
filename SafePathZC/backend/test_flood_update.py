import requests
import json

BACKEND_URL = 'http://localhost:8001'
LOGIN_URL = f'{BACKEND_URL}/admin/auth/login'
UPDATE_URL = f'{BACKEND_URL}/admin/flood/update-now'

credentials = {
    'email': 'admin@safepath.com',
    'password': 'admin123'
}

print('Step 1: Login')
try:
    response = requests.post(LOGIN_URL, json=credentials, timeout=10)
    if response.status_code != 200:
        print(f'✗ Login failed: {response.json()}')
        exit(1)
    
    data = response.json()
    token = data['token']
    print(f'✓ Got token: {token[:50]}...')
except Exception as e:
    print(f'✗ Login error: {e}')
    exit(1)

print('\nStep 2: Test flood update endpoint')
try:
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    print(f'URL: {UPDATE_URL}')
    print(f'Headers: {{"Authorization": "Bearer {token[:30]}...", "Content-Type": "application/json"}}')
    
    response = requests.post(UPDATE_URL, headers=headers, timeout=10)
    print(f'Status: {response.status_code}')
    
    if response.status_code == 200:
        print('✓ Update triggered successfully!')
        print(f'Response: {response.json()}')
    else:
        print(f'✗ Update failed')
        print(f'Response: {response.json()}')
        
except Exception as e:
    print(f'✗ Error: {e}')
