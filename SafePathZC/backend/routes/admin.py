from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional
import hashlib
import jwt
import os
from dotenv import load_dotenv

load_dotenv()

# Import models and database 
from models import AdminUser, Report, User, Post, Comment, PostLike, RouteHistory, FavoriteRoute, SearchHistory, SessionLocal

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Security setup
security = HTTPBearer()
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")  # Change this in production
ALGORITHM = "HS256"

# Pydantic models for API
class AdminLoginRequest(BaseModel):
    email: str
    password: str

class AdminLoginResponse(BaseModel):
    token: str
    user: dict

class ReportCreate(BaseModel):
    title: str
    description: str
    category: str
    urgency: str = "medium"
    location_lat: float
    location_lng: float
    location_address: str
    reporter_name: str
    reporter_email: str

class ReportUpdate(BaseModel):
    status: Optional[str] = None
    urgency: Optional[str] = None
    is_visible: Optional[bool] = None
    admin_notes: Optional[str] = None

class ReportResponse(BaseModel):
    id: int
    title: str
    description: str
    category: str
    urgency: str
    status: str
    is_visible: bool
    location: dict
    reporter: dict
    admin_notes: Optional[str]
    verification_score: Optional[float]
    created_at: datetime
    updated_at: datetime

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool
    report_count: int
    joined_at: datetime
    last_activity: datetime

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
        expire = datetime.utcnow() + timedelta(hours=24)  # Default 24 hours
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_admin_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# Router setup
router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/auth/login", response_model=AdminLoginResponse)
async def admin_login(login_data: AdminLoginRequest, db: Session = Depends(get_db)):
    """Admin login endpoint"""
    
    # Find admin user
    admin = db.query(AdminUser).filter(AdminUser.email == login_data.email).first()
    if not admin or not verify_password(login_data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not admin.is_active:
        raise HTTPException(status_code=401, detail="Account is deactivated")
    
    # Update last login
    admin.last_login = datetime.utcnow()
    db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": str(admin.id), "role": admin.role})
    
    return {
        "token": access_token,
        "user": {
            "id": admin.id,
            "email": admin.email,
            "name": admin.name,
            "role": admin.role
        }
    }

@router.get("/verify")
async def verify_admin_token_endpoint(user_id: int = Depends(verify_admin_token), db: Session = Depends(get_db)):
    """Verify admin token"""
    admin = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not admin or not admin.is_active:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"valid": True, "user_id": user_id}

@router.get("/reports")
async def get_reports(
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db),
    status: Optional[str] = None,
    urgency: Optional[str] = None,
    category: Optional[str] = None
):
    """Get all reports with optional filtering"""
    
    query = db.query(Report)
    
    if status:
        query = query.filter(Report.status == status)
    if urgency:
        query = query.filter(Report.urgency == urgency)
    if category:
        query = query.filter(Report.category == category)
    
    reports = query.order_by(Report.created_at.desc()).all()
    
    # Format response
    formatted_reports = []
    for report in reports:
        formatted_reports.append({
            "id": report.id,
            "title": report.title,
            "description": report.description,
            "category": report.category,
            "urgency": report.urgency,
            "status": report.status,
            "isVisible": report.is_visible,
            "location": {
                "lat": report.location_lat,
                "lng": report.location_lng,
                "address": report.location_address
            },
            "reporter": {
                "id": report.reporter_id,
                "name": report.reporter_name,
                "email": report.reporter_email
            },
            "adminNotes": report.admin_notes,
            "verificationScore": report.verification_score,
            "createdAt": report.created_at.isoformat(),
            "updatedAt": report.updated_at.isoformat()
        })
    
    return {"reports": formatted_reports}

@router.patch("/reports/{report_id}/status")
async def update_report_status(
    report_id: int,
    update_data: ReportUpdate,
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Update report status"""
    
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if update_data.status:
        report.status = update_data.status
        
        # If report is approved, also approve the corresponding forum post
        if update_data.status == "approved":
            try:
                from models import Post
                # Find forum post that contains this report ID
                forum_post = db.query(Post).filter(
                    Post.content.contains(f"Report ID:** #{report_id}"),
                    Post.category == "reports",
                    Post.is_approved == False
                ).first()
                
                if forum_post:
                    forum_post.is_approved = True
                    forum_post.updated_at = datetime.utcnow()
                    print(f"Auto-approved forum post {forum_post.id} for report {report_id}")
                
            except Exception as e:
                print(f"Failed to auto-approve forum post for report {report_id}: {e}")
    
    if update_data.admin_notes:
        report.admin_notes = update_data.admin_notes
    
    report.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Report status updated successfully"}

@router.post("/reports/sync-forum-posts")
async def sync_reports_with_forum_posts(
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Sync approved reports with their forum posts (approve forum posts for approved reports)"""
    try:
        # Find all approved reports
        approved_reports = db.query(Report).filter(Report.status == "approved").all()
        synced_count = 0
        
        for report in approved_reports:
            # Find corresponding forum post
            forum_post = db.query(Post).filter(
                Post.content.contains(f"Report ID:** #{report.id}"),
                Post.category == "reports"
            ).first()
            
            if forum_post and not forum_post.is_approved:
                forum_post.is_approved = True
                forum_post.updated_at = datetime.utcnow()
                synced_count += 1
        
        db.commit()
        return {
            "message": f"Successfully synced {synced_count} forum posts with approved reports",
            "synced_count": synced_count
        }
        
    except Exception as e:
        return {"error": f"Failed to sync reports: {str(e)}"}

@router.patch("/reports/{report_id}/visibility")
async def toggle_report_visibility(
    report_id: int,
    visibility_data: dict,
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Toggle report visibility"""
    
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.is_visible = visibility_data.get("isVisible", not report.is_visible)
    report.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Report visibility updated successfully"}

@router.patch("/reports/{report_id}/urgency")
async def update_report_urgency(
    report_id: int,
    urgency_data: dict,
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Update report urgency"""
    
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.urgency = urgency_data.get("urgency")
    report.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Report urgency updated successfully"}

@router.get("/users")
async def get_users(
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Get all users"""
    
    users = db.query(User).order_by(User.joined_at.desc()).all()
    
    formatted_users = []
    for user in users:
        formatted_users.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "isActive": user.is_active,
            "reportCount": user.reports_submitted,
            "joinedAt": user.joined_at.isoformat(),
            "lastActivity": user.last_activity.isoformat()
        })
    
    return {"users": formatted_users}

@router.post("/reports")
async def create_report(
    report_data: ReportCreate,
    db: Session = Depends(get_db)
):
    """Create a new report (public endpoint for users)"""
    
    new_report = Report(
        title=report_data.title,
        description=report_data.description,
        category=report_data.category,
        urgency=report_data.urgency,
        location_lat=report_data.location_lat,
        location_lng=report_data.location_lng,
        location_address=report_data.location_address,
        reporter_name=report_data.reporter_name,
        reporter_email=report_data.reporter_email,
        status="pending",
        is_visible=False  # Admin must approve first
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    
    return {"message": "Report submitted successfully", "id": new_report.id}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Delete a user account (Admin only)"""
    
    # Find the user to delete
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deletion of admin users (safety check)
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete admin users")
    
    # Store user info for response
    deleted_user_info = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role
    }
    
    try:
        # Delete related data first (to avoid foreign key constraints)
        
        # Delete user's posts
        db.query(Post).filter(Post.author_id == user_id).delete()
        
        # Delete user's comments
        db.query(Comment).filter(Comment.author_id == user_id).delete()
        
        # Delete user's post likes
        db.query(PostLike).filter(PostLike.user_id == user_id).delete()
        
        # Delete user's route history
        db.query(RouteHistory).filter(RouteHistory.user_id == str(user_id)).delete()
        
        # Delete user's favorite routes
        db.query(FavoriteRoute).filter(FavoriteRoute.user_id == str(user_id)).delete()
        
        # Delete user's search history
        db.query(SearchHistory).filter(SearchHistory.user_id == str(user_id)).delete()
        
        # Finally delete the user
        db.delete(user)
        db.commit()
        
        return {
            "message": "User account deleted successfully",
            "deleted_user": deleted_user_info
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    status_data: dict,
    admin_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Activate or deactivate a user account (Admin only)"""
    
    # Find the user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get is_active from request body
    is_active = status_data.get("is_active")
    if is_active is None:
        raise HTTPException(status_code=422, detail="is_active field is required")
    
    # Prevent deactivation of admin users
    if user.role == "admin" and not is_active:
        raise HTTPException(status_code=403, detail="Cannot deactivate admin users")
    
    # Update user status
    user.is_active = is_active
    db.commit()
    
    status_text = "activated" if is_active else "deactivated"
    return {
        "message": f"User account {status_text} successfully",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_active": user.is_active
        }
    }

# Initialize admin user if not exists
def init_admin_user(db: Session):
    """Create default admin user if none exists"""
    admin_count = db.query(AdminUser).count()
    if admin_count == 0:
        default_admin = AdminUser(
            email="admin@safepath.com",
            password_hash=hash_password("admin123"),  # Change this in production
            name="Admin User",
            role="admin",
            is_active=True
        )
        db.add(default_admin)
        db.commit()
        print("✅ Default admin user created: admin@safepath.com / admin123")