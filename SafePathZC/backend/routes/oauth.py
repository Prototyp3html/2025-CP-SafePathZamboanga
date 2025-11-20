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
    # Try to find existing user by email
    user = db.query(User).filter(User.email == email).first()
    
    if user:
        # Update OAuth info if needed
        if not user.oauth_provider:
            user.oauth_provider = provider
            user.oauth_id = provider_id
            db.commit()
        return user
    
    # Create new user
    # Split name into parts for the new name structure
    name_parts = name.strip().split()
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[-1] if len(name_parts) > 1 else ""
    middle_name = " ".join(name_parts[1:-1]) if len(name_parts) > 2 else None
    
    new_user = User(
        email=email,
        name=name,
        first_name=first_name,
        middle_name=middle_name,
        last_name=last_name,
        password_hash="",  # No password for OAuth users
        oauth_provider=provider,
        oauth_id=provider_id,
        created_at=datetime.utcnow(),
        role="user"
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/google")
async def google_login():
    """Redirect to Google OAuth"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
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
        # Exchange code for access token
        async with httpx.AsyncClient() as client:
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
                raise HTTPException(status_code=400, detail="Failed to exchange code for token")
            
            token_data = token_response.json()
            access_token = token_data.get("access_token")
            
            # Get user info from Google
            user_response = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if user_response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch user info")
            
            user_info = user_response.json()
            
            # Find or create user
            user = find_or_create_user(
                db=db,
                email=user_info["email"],
                name=user_info.get("name", ""),
                provider="google",
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
                    "oauth_provider": "google"
                }
            }
            
    except Exception as e:
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