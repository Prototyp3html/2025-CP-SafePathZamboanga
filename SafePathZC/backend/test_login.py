import requests
import json

BACKEND_URL = 'http://localhost:8001'
LOGIN_URL = f'{BACKEND_URL}/admin/auth/login'

credentials = {
    'email': 'admin@safepath.com',
    'password': 'admin123'
}

print('Testing admin login...')
print(f'URL: {LOGIN_URL}')
print(f'Credentials: {json.dumps(credentials)}')

try:
    response = requests.post(LOGIN_URL, json=credentials, timeout=10)
    print(f'Status: {response.status_code}')
    
    if response.status_code == 200:
        data = response.json()
        print('✓ Login SUCCESS')
        print(f'Token: {data["token"][:50]}...')
        print(f'User: {data["user"]}')
    else:
        print('✗ Login FAILED')
        print(f'Response: {response.json()}')
except requests.exceptions.ConnectionError as e:
    print(f'✗ Connection Error: {e}')
    print('Is the backend running on port 8001?')
except requests.exceptions.Timeout:
    print('✗ Request timed out - backend may be hanging')
except Exception as e:
    print(f'✗ Error: {e}')
