#!/usr/bin/env python3
"""
Test script to verify admin authentication flow
"""
import os
import sys
import jwt
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"

print("=" * 50)
print("ADMIN AUTHENTICATION TEST")
print("=" * 50)

# Test 1: Check SECRET_KEY
print(f"\n[TEST 1] SECRET_KEY Configuration")
print(f"SECRET_KEY length: {len(SECRET_KEY)}")
print(f"SECRET_KEY value: {SECRET_KEY}")
if SECRET_KEY == "your-secret-key-here":
    print("⚠️  WARNING: Using default SECRET_KEY! This is a security risk.")
else:
    print("✓ Custom SECRET_KEY is set")

# Test 2: Create a test token
print(f"\n[TEST 2] Creating Test Token")
test_payload = {
    "sub": "1",
    "role": "admin"
}
expire = datetime.utcnow() + timedelta(hours=24)
test_payload["exp"] = expire

try:
    test_token = jwt.encode(test_payload, SECRET_KEY, algorithm=ALGORITHM)
    print(f"✓ Token created successfully")
    print(f"Token length: {len(test_token)}")
    print(f"Token (first 50 chars): {test_token[:50]}...")
    print(f"Token type: {type(test_token)}")
except Exception as e:
    print(f"✗ Failed to create token: {e}")
    sys.exit(1)

# Test 3: Verify the token
print(f"\n[TEST 3] Verifying Test Token")
try:
    decoded = jwt.decode(test_token, SECRET_KEY, algorithms=[ALGORITHM])
    print(f"✓ Token verified successfully")
    print(f"Decoded payload: {decoded}")
    print(f"User ID (sub): {decoded.get('sub')}")
    print(f"Role: {decoded.get('role')}")
except jwt.ExpiredSignatureError:
    print(f"✗ Token has expired")
    sys.exit(1)
except jwt.PyJWTError as e:
    print(f"✗ Token verification failed: {e}")
    sys.exit(1)

# Test 4: Check HTTPBearer
print(f"\n[TEST 4] HTTPBearer Configuration")
try:
    from fastapi.security import HTTPBearer
    security = HTTPBearer()
    print(f"✓ HTTPBearer imported successfully")
    print(f"HTTPBearer scheme: {security.scheme}")
except Exception as e:
    print(f"✗ Failed to import HTTPBearer: {e}")

# Test 5: Check database admin user
print(f"\n[TEST 5] Database Admin User Check")
try:
    from database.config import SessionLocal
    from models import AdminUser
    
    db = SessionLocal()
    admin_users = db.query(AdminUser).all()
    print(f"✓ Database connected")
    print(f"Number of admin users: {len(admin_users)}")
    
    if admin_users:
        for admin in admin_users:
            print(f"  - ID: {admin.id}, Email: {admin.email}, Active: {admin.is_active}")
    else:
        print("  ⚠️  No admin users found in database!")
    
    db.close()
except Exception as e:
    print(f"✗ Database check failed: {e}")

print("\n" + "=" * 50)
print("TEST COMPLETE")
print("=" * 50)
