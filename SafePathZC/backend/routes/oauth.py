from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import jwt
import os
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import models and database
from models import User, SessionLocal

# OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FACEBOOK_APP_ID = os.getenv("FACEBOOK_APP_ID")
FACEBOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

router = APIRouter(prefix="/auth", tags=["oauth"])

class OAuthCallbackData(BaseModel):
    code: str
    state: Optional[str] = None

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def find_or_create_user(db: Session, email: str, name: str, provider: str, provider_id: str):
    """Find existing user or create new one from OAuth data"""
    from datetime import datetime
    
    # Try to find existing user by email
    user = db.query(User).filter(User.email == email).first()
    
    if user:
        # User exists, just return it
        print(f"👥 Found existing user: {user.email}")
        return user
    
    # Create new user with OAuth data
    print(f"👤 Creating new user: {email}")
    
    new_user = User(
        email=email,
        name=name,
        password_hash="",  # No password for OAuth users
        role="user",
        is_active=True,
        joined_at=datetime.utcnow(),
        last_activity=datetime.utcnow()
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    print(f"✅ Created new user with ID: {new_user.id}")
    return new_user

@router.get("/google")
async def google_login():
    """Redirect to Google OAuth"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500, 
            detail=f"Google OAuth not configured. GOOGLE_CLIENT_ID={GOOGLE_CLIENT_ID}, FRONTEND_URL={FRONTEND_URL}"
        )
    
    # Google OAuth 2.0 authorization URL
    google_auth_url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={FRONTEND_URL}/auth/google/callback&"
        f"scope=openid email profile&"
        f"response_type=code&"
        f"state=google_oauth"
    )
    
    return RedirectResponse(url=google_auth_url)

@router.post("/google/callback")
async def google_callback(callback_data: OAuthCallbackData, db: Session = Depends(get_db)):
    """Handle Google OAuth callback"""
    try:
        print(f"🔵 Google OAuth callback received with code: {callback_data.code[:20]}...")
        
        # Check if OAuth is configured
        if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
            error_msg = f"Google OAuth not configured. CLIENT_ID: {bool(GOOGLE_CLIENT_ID)}, CLIENT_SECRET: {bool(GOOGLE_CLIENT_SECRET)}"
            print(f"❌ {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Exchange code for access token
        async with httpx.AsyncClient() as client:
            print(f"📡 Exchanging code for Google access token...")
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "code": callback_data.code,
                    "grant_type": "authorization_code",
                    "redirect_uri": f"{FRONTEND_URL}/auth/google/callback"
                }
            )
            
            if token_response.status_code != 200:
                error_details = token_response.text
                print(f"❌ Failed to exchange code: {token_response.status_code} - {error_details}")
                raise HTTPException(status_code=400, detail=f"Failed to exchange code for token: {error_details}")
            
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            print(f"✅ Got access token: {access_token[:20] if access_token else 'None'}...")
            
            # Get user info from Google
            print(f"👤 Fetching user info from Google...")
            user_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if user_response.status_code != 200:
                error_details = user_response.text
                print(f"❌ Failed to fetch user info: {user_response.status_code} - {error_details}")
                raise HTTPException(status_code=400, detail=f"Failed to fetch user info: {error_details}")
            
            user_info = user_response.json()
            print(f"✅ Got user info: {user_info.get('email', 'No email')}")
            
            # Find or create user
            user = find_or_create_user(
                db=db,
                email=user_info["email"],
                name=user_info.get("name", ""),
                provider="google",
                provider_id=user_info["id"]
            )
            
            print(f"👥 User {user.email} (ID: {user.id}) authenticated")
            
            # Create JWT token
            token = create_access_token(data={"sub": user.email, "user_id": user.id})
            print(f"🔐 JWT token created")
            
            response_data = {
                "token": token,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "phone": user.phone,
                    "location": user.location,
                    "role": user.role,
                    "oauth_provider": "google"
                }
            }
            print(f"✅ Returning successful response: {response_data['user']['email']}")
            return response_data
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Unexpected OAuth error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"OAuth error: {str(e)}")

@router.get("/facebook")
async def facebook_login():
    """Redirect to Facebook OAuth"""
    if not FACEBOOK_APP_ID:
        raise HTTPException(status_code=500, detail="Facebook OAuth not configured")
    
    # Facebook OAuth authorization URL
    facebook_auth_url = (
        f"https://www.facebook.com/v18.0/dialog/oauth?"
        f"client_id={FACEBOOK_APP_ID}&"
        f"redirect_uri={FRONTEND_URL}/auth/facebook/callback&"
        f"scope=email,public_profile&"
        f"response_type=code&"
        f"state=facebook_oauth"
    )
    
    return RedirectResponse(url=facebook_auth_url)

@router.post("/facebook/callback")
async def facebook_callback(callback_data: OAuthCallbackData, db: Session = Depends(get_db)):
    """Handle Facebook OAuth callback"""
    try:
        # Exchange code for access token
        async with httpx.AsyncClient() as client:
            token_response = await client.get(
                "https://graph.facebook.com/v18.0/oauth/access_token",
                params={
                    "client_id": FACEBOOK_APP_ID,
                    "client_secret": FACEBOOK_APP_SECRET,
                    "code": callback_data.code,
                    "redirect_uri": f"{FRONTEND_URL}/auth/facebook/callback"
                }
            )
            
            if token_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to exchange code for token")
            
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            
            # Get user info from Facebook
            user_response = await client.get(
                "https://graph.facebook.com/me",
                params={
                    "fields": "id,name,email,first_name,last_name",
                    "access_token": access_token
                }
            )
            
            if user_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch user info")
            
            user_info = user_response.json()
            
            # Find or create user
            user = find_or_create_user(
                db=db,
                email=user_info.get("email", ""),
                name=user_info.get("name", ""),
                provider="facebook",
                provider_id=user_info["id"]
            )
            
            # Create JWT token
            token = create_access_token(data={"sub": user.email, "user_id": user.id})
            
            return {
                "token": token,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "first_name": user.first_name,
                    "middle_name": user.middle_name,
                    "last_name": user.last_name,
                    "role": user.role,
                    "oauth_provider": "facebook"
                }
            }
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth error: {str(e)}")