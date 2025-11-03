from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import jwt
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import models and database
from models import User, SessionLocal

# Security setup
security = HTTPBearer()
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    emergencyContact: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    phone: Optional[str]
    location: str
    emergencyContact: Optional[str]
    role: str
    isActive: bool
    communityPoints: int
    routesUsed: int
    reportsSubmitted: int
    memberSince: str
    lastActivity: str

# Utility functions
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hash_password(password) == hashed

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return int(user_id)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

def format_user_response(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
        "location": user.location,
        "emergencyContact": user.emergency_contact,
        "role": user.role,
        "isActive": user.is_active,
        "communityPoints": user.community_points or 0,
        "routesUsed": user.routes_used or 0,
        "reportsSubmitted": user.reports_submitted or 0,
        "memberSince": user.joined_at.isoformat() if user.joined_at else datetime.utcnow().isoformat(),
        "lastActivity": user.last_activity.isoformat() if user.last_activity else datetime.utcnow().isoformat()
    }

# Router setup
router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/register")
async def register_user(user_data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    new_user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        name=user_data.name,
        phone=user_data.phone,
        joined_at=datetime.utcnow(),
        last_activity=datetime.utcnow()
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Create access token
    access_token = create_access_token(data={"sub": str(new_user.id)})
    
    return {
        "token": access_token,
        "user": format_user_response(new_user),
        "message": "User registered successfully"
    }

@router.post("/login")
async def login_user(login_data: UserLogin, db: Session = Depends(get_db)):
    """User login"""
    
    # Find user
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is deactivated")
    
    # Update last activity
    user.last_activity = datetime.utcnow()
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return {
        "token": access_token,
        "user": format_user_response(user),
        "message": "Login successful"
    }

@router.get("/profile")
async def get_user_profile(user_id: int = Depends(verify_token), db: Session = Depends(get_db)):
    """Get user profile"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return format_user_response(user)

@router.patch("/profile")
async def update_user_profile(
    update_data: UserUpdate,
    user_id: int = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update fields
    if update_data.name:
        user.name = update_data.name
    if update_data.phone:
        user.phone = update_data.phone
    if update_data.location:
        user.location = update_data.location
    if update_data.emergencyContact is not None:
        user.emergency_contact = update_data.emergencyContact
    
    user.last_activity = datetime.utcnow()
    db.commit()
    
    return format_user_response(user)

@router.post("/logout")
async def logout_user(user_id: int = Depends(verify_token)):
    """User logout (client-side token removal)"""
    return {"message": "Logout successful"}

@router.get("/verify")
async def verify_user_token(user_id: int = Depends(verify_token), db: Session = Depends(get_db)):
    """Verify user token"""
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return {"valid": True, "user_id": user_id}

# Initialize demo user
def init_demo_user(db: Session):
    """Create demo user if not exists"""
    demo_email = "maria.santos@email.com"
    existing_user = db.query(User).filter(User.email == demo_email).first()
    
    if not existing_user:
        demo_user = User(
            email=demo_email,
            password_hash=hash_password("demo123"),
            name="Maria Santos",
            phone="+63 912 345 6789",
            location="Zamboanga City",
            community_points=340,
            routes_used=127,
            reports_submitted=8,
            joined_at=datetime(2024, 6, 1),
            last_activity=datetime.utcnow()
        )
        db.add(demo_user)
        db.commit()
        print("✅ Demo user created: maria.santos@email.com / demo123")

# Preferences model
class UserPreferences(BaseModel):
    # Route Preferences
    prioritizeSafety: Optional[bool] = True
    avoidPoorlyLit: Optional[bool] = True
    includePublicTransport: Optional[bool] = False
    avoidFloods: Optional[bool] = True
    fastestRoute: Optional[bool] = True
    avoidTolls: Optional[bool] = False
    mainRoads: Optional[bool] = False
    
    # Notifications
    safetyAlerts: Optional[bool] = True
    routeSuggestions: Optional[bool] = True
    weeklyReports: Optional[bool] = False
    floodAlerts: Optional[bool] = True
    weatherUpdates: Optional[bool] = True
    trafficUpdates: Optional[bool] = False
    communityReports: Optional[bool] = True
    emergencyAlerts: Optional[bool] = True
    routeReminders: Optional[bool] = False
    
    # Privacy
    shareAnonymousData: Optional[bool] = True
    allowLocationTracking: Optional[bool] = False
    
    # App Preferences
    language: Optional[str] = 'english'
    units: Optional[str] = 'metric'
    theme: Optional[str] = 'light'
    mapStyle: Optional[str] = 'standard'

@router.get("/preferences")
async def get_user_preferences(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Get user preferences"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Return user preferences (stored as JSON in preferences column)
        # For now, return default preferences since we haven't added preferences column
        default_preferences = {
            "prioritizeSafety": True,
            "avoidPoorlyLit": True,
            "includePublicTransport": False,
            "avoidFloods": True,
            "fastestRoute": True,
            "avoidTolls": False,
            "mainRoads": False,
            "safetyAlerts": True,
            "routeSuggestions": True,
            "weeklyReports": False,
            "floodAlerts": True,
            "weatherUpdates": True,
            "trafficUpdates": False,
            "communityReports": True,
            "emergencyAlerts": True,
            "routeReminders": False,
            "shareAnonymousData": True,
            "allowLocationTracking": False,
            "language": "english",
            "units": "metric",
            "theme": "light",
            "mapStyle": "standard"
        }
        
        return default_preferences
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.put("/preferences")
async def update_user_preferences(
    preferences: UserPreferences,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Update user preferences"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # For now, just return success since we haven't added preferences column to User model
        # In a real implementation, you would save preferences to the database
        # user.preferences = preferences.dict()
        # db.commit()
        
        return {"message": "Preferences updated successfully"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.put("/profile")
async def update_user_profile(
    profile_data: UserUpdate,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Update user profile"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Update user fields
        if profile_data.name:
            user.name = profile_data.name
        if profile_data.email:
            # Check if email is already taken by another user
            existing_user = db.query(User).filter(User.email == profile_data.email, User.id != user.id).first()
            if existing_user:
                raise HTTPException(status_code=400, detail="Email already in use")
            user.email = profile_data.email
        if profile_data.phone:
            user.phone = profile_data.phone
        if profile_data.location:
            user.location = profile_data.location
        if profile_data.emergencyContact is not None:
            user.emergency_contact = profile_data.emergencyContact
            
        db.commit()
        db.refresh(user)
        
        return {
            "message": "Profile updated successfully",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "phone": user.phone,
                "location": user.location
            }
        }
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Profile picture endpoints
@router.put("/profile-picture")
async def update_profile_picture(
    picture_data: dict,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Update user profile picture"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # In a real implementation, you would save the image to a file storage service
        # For now, we'll just acknowledge the update
        return {"message": "Profile picture updated successfully"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.delete("/profile-picture")
async def remove_profile_picture(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Remove user profile picture"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # In a real implementation, you would delete the image from file storage
        return {"message": "Profile picture removed successfully"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Password change endpoint
class PasswordChange(BaseModel):
    currentPassword: str
    newPassword: str

@router.put("/change-password")
async def change_password(
    password_data: PasswordChange,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Change user password"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify current password
        if not verify_password(password_data.currentPassword, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        
        # Update password
        user.password_hash = hash_password(password_data.newPassword)
        db.commit()
        
        return {"message": "Password updated successfully"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Account deletion endpoint
@router.delete("/delete-account")
async def delete_account(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Delete user account"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Delete user account
        db.delete(user)
        db.commit()
        
        return {"message": "Account deleted successfully"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# 2FA endpoints
class TwoFactorEnable(BaseModel):
    phoneNumber: str

class TwoFactorVerify(BaseModel):
    code: str

@router.post("/enable-2fa")
async def enable_two_factor(
    tfa_data: TwoFactorEnable,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Enable two-factor authentication"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # In a real implementation, you would:
        # 1. Send SMS verification code to the phone number
        # 2. Store the code temporarily
        # For demo purposes, we'll just return success
        
        return {"message": "Verification code sent to your phone"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/verify-2fa")
async def verify_two_factor(
    verify_data: TwoFactorVerify,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Verify two-factor authentication code"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # In a real implementation, you would verify the SMS code
        # For demo purposes, we'll accept any 6-digit code
        if len(verify_data.code) == 6 and verify_data.code.isdigit():
            # Enable 2FA for user (would add to user model in real implementation)
            return {"message": "Two-factor authentication enabled successfully"}
        else:
            raise HTTPException(status_code=400, detail="Invalid verification code")
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.post("/disable-2fa")
async def disable_two_factor(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Disable two-factor authentication"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Disable 2FA for user (would update user model in real implementation)
        return {"message": "Two-factor authentication disabled successfully"}
        
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

class UserStatsUpdate(BaseModel):
    routes_used: Optional[int] = None
    reports_submitted: Optional[int] = None
    community_points: Optional[int] = None

@router.patch("/stats")
async def update_user_stats(
    stats_update: UserStatsUpdate,
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Update user statistics"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        
        if not user_id_str:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        
        # Convert string ID to integer
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Invalid token: invalid user ID format")
        
        print(f"🔍 Stats update for user ID: {user_id}, payload: {payload}")  # Debug log
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail=f"User not found with ID: {user_id}")
        
        print(f"📊 Current user stats - Reports: {user.reports_submitted}, Routes: {user.routes_used}")
        
        # Update statistics (increment existing values)
        if stats_update.routes_used is not None:
            user.routes_used = (user.routes_used or 0) + stats_update.routes_used
        
        if stats_update.reports_submitted is not None:
            old_reports = user.reports_submitted or 0
            user.reports_submitted = old_reports + stats_update.reports_submitted
            print(f"📈 Reports updated: {old_reports} + {stats_update.reports_submitted} = {user.reports_submitted}")
            
        if stats_update.community_points is not None:
            user.community_points = (user.community_points or 0) + stats_update.community_points
        
        user.last_activity = datetime.utcnow()
        
        db.commit()
        db.refresh(user)
        
        print(f"✅ Stats updated successfully for user: {user.name}")
        
        return {
            "message": "User statistics updated successfully",
            "user_id": user_id,
            "user_name": user.name,
            "stats": {
                "routes_used": user.routes_used,
                "reports_submitted": user.reports_submitted,
                "community_points": user.community_points
            }
        }
        
    except jwt.PyJWTError as e:
        print(f"❌ JWT Error: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"❌ Stats update error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update stats: {str(e)}")

@router.get("/profile")
async def get_user_profile(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Security(security)
):
    """Get current user profile and stats"""
    try:
        # Verify token
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str = payload.get("sub")
        
        if not user_id_str:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        
        user_id = int(user_id_str)
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "user": format_user_response(user),
            "jwt_payload": payload,
            "debug": {
                "user_id_from_token": user_id,
                "user_found": True,
                "token_valid": True
            }
        }
        
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile error: {str(e)}")
