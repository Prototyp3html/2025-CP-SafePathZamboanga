from fastapi import APIRouter, HTTPException, Depends, Security, Request, Response, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
import hashlib
import jwt
import os
from dotenv import load_dotenv
import asyncio
import logging

load_dotenv()

# Logging setup
logger = logging.getLogger(__name__)

# Global flood update state tracker
class FloodUpdateState:
    """Tracks the state of flood data updates"""
    def __init__(self):
        self.is_updating = False
        self.progress = 0  # 0-100
        self.status = "idle"  # idle, updating, completed, failed
        self.last_update_time = None
        self.roads_updated = 0
        self.error_message = None
        self.start_time = None
        self.logs = []  # Store update logs
        
    def start_update(self):
        self.is_updating = True
        self.progress = 0
        self.status = "updating"
        self.start_time = datetime.utcnow()
        self.roads_updated = 0
        self.error_message = None
        self.logs = []  # Clear logs on new update
        
    def add_log(self, message: str):
        """Add a log message to the update log"""
        self.logs.append(message)
        
    def complete_update(self, roads_count: int):
        self.is_updating = False
        self.progress = 100
        self.status = "completed"
        self.last_update_time = datetime.utcnow()
        self.roads_updated = roads_count
        
    def fail_update(self, error_msg: str):
        self.is_updating = False
        self.status = "failed"
        self.error_message = error_msg
        
    def get_status(self) -> Dict[str, Any]:
        return {
            "is_updating": self.is_updating,
            "status": self.status,
            "progress": self.progress,
            "roads_updated": self.roads_updated,
            "last_update_time": self.last_update_time.isoformat() if self.last_update_time else None,
            "error_message": self.error_message,
            "elapsed_seconds": (datetime.utcnow() - self.start_time).total_seconds() if self.start_time else 0
        }
    
    def get_logs(self) -> list:
        """Return the current logs"""
        return self.logs

# Global instance
flood_update_state = FloodUpdateState()

# Set up custom log capture for frontend display
try:
    from services.log_capture import FrontendLogCapture
    log_handler = FrontendLogCapture(flood_update_state)
    log_handler.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
    logger.addHandler(log_handler)
except ImportError:
    logger.warning("Could not import FrontendLogCapture")
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

class ImageData(BaseModel):
    data: str
    filename: str

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
    image_data: Optional[str] = None
    image_filename: Optional[str] = None
    images: Optional[List[ImageData]] = None  # New: Support multiple images

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
    image_data: Optional[str] = None
    image_filename: Optional[str] = None

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
        if not credentials:
            logger.error("No credentials provided in Authorization header")
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        token = credentials.credentials
        logger.info(f"Verifying admin token, token length: {len(token)}")
        
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        logger.info(f"Token verified successfully for user_id: {user_id}")
        
        if user_id is None:
            logger.error("No user_id found in token payload")
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user_id
    except HTTPException as he:
        raise he
    except jwt.ExpiredSignatureError:
        logger.error("Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.PyJWTError as e:
        logger.error(f"JWT verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except Exception as e:
        logger.error(f"Unexpected error in token verification: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

def verify_admin_token_direct(token: str, db: Session):
    """Helper function to verify admin token directly from token string"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            return None
        
        # Check if the user_id corresponds to an admin user
        admin_user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
        return admin_user
    except (jwt.PyJWTError, Exception):
        return None

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
            "updatedAt": report.updated_at.isoformat(),
            "imageData": report.image_data,
            "imageFilename": report.image_filename
        })
    
    return {"reports": formatted_reports}

@router.get("/reports/{report_id}/images")
async def get_report_images(
    report_id: int,
    db: Session = Depends(get_db)
):
    """Get all images for a specific report"""
    try:
        from models import ReportImage
        
        # Verify report exists
        report = db.query(Report).filter(Report.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Get all images for this report
        images = db.query(ReportImage).filter(ReportImage.report_id == report_id).all()
        
        formatted_images = [
            {
                "id": img.id,
                "filename": img.image_filename,
                "data": img.image_data,
                "createdAt": img.created_at.isoformat()
            }
            for img in images
        ]
        
        return {"images": formatted_images, "count": len(formatted_images)}
    except Exception as e:
        print(f"Error fetching report images: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch images: {str(e)}")

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
        
        # If report is approved, make it visible and create/approve forum post
        if update_data.status == "approved":
            report.is_visible = True  # Make report visible when approved
            report.verification_score = 1.0  # Approved reports are verified
            try:
                from models import Post
                # Find existing forum post that contains this report ID
                forum_post = db.query(Post).filter(
                    Post.content.contains(f"📋 Report ID: #{report_id}"),
                    Post.category == "reports"
                ).first()
                
                # Try legacy format if not found
                if not forum_post:
                    forum_post = db.query(Post).filter(
                        Post.content.contains(f"Report ID:** #{report_id}"),
                        Post.category == "reports"
                    ).first()
                
                if forum_post:
                    # Approve existing forum post
                    forum_post.is_approved = True
                    forum_post.updated_at = datetime.utcnow()
                    print(f"Auto-approved existing forum post {forum_post.id} for report {report_id}")
                else:
                    # Create new forum post for the approved report using original reporter info
                    severity_text = report.urgency.upper() if report.urgency in ["severe", "moderate", "low"] else "MODERATE"
                    
                    post_content = f"""{report.category.upper()} ALERT

Location: {report.location_address}

Description: {report.description}

Severity: {severity_text}

Please exercise caution when traveling through this area and consider alternative routes if possible.

Status: Verified by Admin"""
                    
                    # Try to find the original reporter in the User table
                    reporter_user = None
                    if report.reporter_email:
                        reporter_user = db.query(User).filter(User.email == report.reporter_email).first()
                        print(f"🔍 Looking for reporter with email: {report.reporter_email}")
                        print(f"👤 Found reporter: {reporter_user.name if reporter_user else 'Not found'}")
                    
                    if reporter_user:
                        # Use original reporter's information
                        author_id = reporter_user.id
                        author_name = reporter_user.name
                        print(f"✅ Using original reporter: {author_name} (ID: {author_id})")
                    else:
                        # Fallback: Use reporter name from report
                        author_id = 999999  # Special ID for anonymous/non-registered users
                        author_name = report.reporter_name if report.reporter_name else "Community Member"
                        print(f"⚠️ Using fallback author: {author_name} (ID: {author_id})")
                        print(f"📧 Report email was: {report.reporter_email}")
                        print(f"👤 Report name was: {report.reporter_name}")
                    
                    new_forum_post = Post(
                        title=f"{report.category.title()} Report - {report.location_address}",
                        content=post_content,
                        category="reports",
                        is_urgent=report.urgency == "severe",
                        is_approved=True,  # Auto-approve since report is approved
                        author_id=author_id,
                        author_name=author_name,
                        report_id=report.id  # Link to source report for images
                    )
                    
                    db.add(new_forum_post)
                    db.flush()  # Get the ID
                    print(f"Created and approved new forum post {new_forum_post.id} for report {report_id}")
                
            except Exception as e:
                print(f"Failed to create/approve forum post for report {report_id}: {e}")
    
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
                Post.content.contains(f"📋 Report ID: #{report.id}"),
                Post.category == "reports"
            ).first()
            
            # Try legacy format if not found
            if not forum_post:
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
    """Toggle report visibility in public forum"""
    print(f"🔍 Toggling visibility for report {report_id}: {visibility_data}")
    
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Update the report visibility
    is_visible = visibility_data.get("isVisible", not report.is_visible)
    report.is_visible = is_visible
    report.updated_at = datetime.utcnow()
    
    # Also update the corresponding forum post visibility
    try:
        forum_post = db.query(Post).filter(
            Post.content.contains(f"📋 Report ID: #{report.id}"),
            Post.category == "reports"
        ).first()
        
        # Try legacy format if not found
        if not forum_post:
            forum_post = db.query(Post).filter(
                Post.content.contains(f"Report ID:** #{report.id}"),
                Post.category == "reports"
            ).first()
        
        if forum_post:
            forum_post.is_approved = is_visible  # Show/hide in forum based on visibility
            forum_post.updated_at = datetime.utcnow()
            print(f"🔍 Updated forum post {forum_post.id} visibility to: {is_visible}")
        else:
            print(f"🔍 No forum post found for report {report_id}")
            
    except Exception as e:
        print(f"❌ Error updating forum post visibility: {e}")
    
    db.commit()
    
    return {
        "message": "Report visibility updated successfully",
        "isVisible": is_visible
    }

@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: int,
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Delete a report and its associated forum post"""
    print(f"🗑️ Admin deleting report {report_id}")
    
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    try:
        # Find and delete the associated forum post
        # Try multiple possible formats to ensure we find the post
        forum_post = None
        
        # Format 1: Current frontend format
        forum_post = db.query(Post).filter(
            Post.content.contains(f"📋 Report ID: #{report.id}"),
            Post.category == "reports"
        ).first()
        
        # Format 2: Legacy format (if any exist)
        if not forum_post:
            forum_post = db.query(Post).filter(
                Post.content.contains(f"Report ID:** #{report.id}"),
                Post.category == "reports"
            ).first()
        
        # Format 3: Alternative format (just in case)
        if not forum_post:
            forum_post = db.query(Post).filter(
                Post.content.contains(f"Report ID: #{report.id}"),
                Post.category == "reports"
            ).first()
        
        print(f"🔍 Searching for forum post with report ID {report.id}")
        
        if forum_post:
            print(f"🔍 Found forum post {forum_post.id} for report {report.id}")
            
            # Delete associated forum post data (likes, comments)
            likes_deleted = db.query(PostLike).filter(PostLike.post_id == forum_post.id).delete()
            comments_deleted = db.query(Comment).filter(Comment.post_id == forum_post.id).delete()
            
            print(f"🗑️ Deleted {likes_deleted} likes and {comments_deleted} comments")
            
            # Delete the forum post
            db.delete(forum_post)
            print(f"🗑️ Deleted associated forum post {forum_post.id}")
        else:
            print(f"⚠️ No forum post found for report {report.id}")
            # Let's also check what posts exist for debugging
            all_report_posts = db.query(Post).filter(Post.category == "reports").all()
            print(f"🔍 Found {len(all_report_posts)} total report posts")
            for post in all_report_posts[:3]:  # Show first 3 for debugging
                print(f"🔍 Post {post.id}: {post.content[:100]}...")
        
        # Delete the original report
        db.delete(report)
        
        # Update the user's report count if the report had a reporter_id
        if hasattr(report, 'reporter_id') and report.reporter_id and report.reporter_id != "anonymous":
            user = db.query(User).filter(User.id == report.reporter_id).first()
            if user and user.reports_submitted > 0:
                user.reports_submitted -= 1
                print(f"📉 Decremented user {user.name}'s report count to {user.reports_submitted}")
        
        db.commit()
        
        print(f"✅ Successfully deleted report {report_id}")
        return {"message": "Report and associated forum post deleted successfully"}
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error deleting report {report_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete report: {str(e)}")

@router.post("/reports/cleanup-orphaned-posts")
async def cleanup_orphaned_forum_posts(
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Clean up forum posts that reference non-existent reports"""
    try:
        # Find all forum posts in the reports category
        all_report_posts = db.query(Post).filter(Post.category == "reports").all()
        
        orphaned_posts = []
        cleaned_count = 0
        
        for post in all_report_posts:
            # Extract report ID from content using different possible formats
            report_id = None
            
            # Try current format: 📋 Report ID: #123
            import re
            match = re.search(r'📋 Report ID: #(\d+)', post.content)
            if not match:
                # Try legacy format: Report ID:** #123
                match = re.search(r'Report ID:\*\* #(\d+)', post.content)
            if not match:
                # Try alternative format: Report ID: #123
                match = re.search(r'Report ID: #(\d+)', post.content)
            
            if match:
                report_id = int(match.group(1))
                
                # Check if the report still exists
                report_exists = db.query(Report).filter(Report.id == report_id).first()
                
                if not report_exists:
                    # This is an orphaned post - delete it
                    print(f"🧹 Found orphaned post {post.id} referencing non-existent report {report_id}")
                    
                    # Delete associated data
                    db.query(PostLike).filter(PostLike.post_id == post.id).delete()
                    db.query(Comment).filter(Comment.post_id == post.id).delete()
                    
                    # Delete the post
                    db.delete(post)
                    orphaned_posts.append({"post_id": post.id, "report_id": report_id})
                    cleaned_count += 1
            else:
                print(f"⚠️ Could not extract report ID from post {post.id}")
        
        db.commit()
        
        return {
            "message": f"Successfully cleaned up {cleaned_count} orphaned forum posts",
            "cleaned_posts": orphaned_posts,
            "total_checked": len(all_report_posts)
        }
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup: {str(e)}")

@router.post("/users/recalculate-report-counts")
async def recalculate_user_report_counts(
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Recalculate all users' report counts based on actual reports in database"""
    try:
        print("🔄 Recalculating user report counts...")
        
        # Get all users
        all_users = db.query(User).all()
        updated_users = []
        
        for user in all_users:
            # Count actual reports for this user
            actual_count = db.query(Report).filter(Report.reporter_id == str(user.id)).count()
            old_count = user.reports_submitted
            
            if actual_count != old_count:
                user.reports_submitted = actual_count
                updated_users.append({
                    "user_id": user.id,
                    "name": user.name,
                    "old_count": old_count,
                    "new_count": actual_count
                })
                print(f"📊 Updated {user.name}: {old_count} → {actual_count} reports")
        
        db.commit()
        
        return {
            "message": f"Successfully recalculated report counts for {len(updated_users)} users",
            "updated_users": updated_users,
            "total_users_checked": len(all_users)
        }
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error recalculating report counts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to recalculate: {str(e)}")

@router.patch("/users/{target_user_id}/reset-reports")
async def reset_user_report_count(
    target_user_id: int,
    admin_user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Reset a specific user's report count to 0 (Admin only)"""
    try:
        user = db.query(User).filter(User.id == target_user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        old_count = user.reports_submitted
        user.reports_submitted = 0
        
        db.commit()
        
        print(f"🗑️ Admin reset {user.name}'s report count from {old_count} to 0")
        
        return {
            "message": f"Successfully reset {user.name}'s report count to 0",
            "user_name": user.name,
            "old_count": old_count,
            "new_count": 0
        }
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error resetting user report count: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset report count: {str(e)}")

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
    """Get all users with accurate online status"""
    
    users = db.query(User).order_by(User.joined_at.desc()).all()
    
    formatted_users = []
    for user in users:
        # Calculate if user is online (active within last 15 minutes)
        now = datetime.utcnow()
        last_activity = user.last_activity if user.last_activity else user.joined_at
        time_since_activity = (now - last_activity).total_seconds() / 60  # Convert to minutes
        
        # User is online if they were active within last 15 minutes
        is_online = time_since_activity < 15 and user.is_active
        
        formatted_users.append({
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "isActive": user.is_active,
            "isOnline": is_online,
            "reportCount": user.reports_submitted,
            "joinedAt": user.joined_at.isoformat(),
            "lastActivity": user.last_activity.isoformat() if user.last_activity else user.joined_at.isoformat()
        })
    
    return {"users": formatted_users}

@router.get("/users/search")
async def search_users_by_name(
    name: str,
    admin_user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Search users by name (Admin only)"""
    try:
        users = db.query(User).filter(User.name.ilike(f"%{name}%")).all()
        
        return {
            "users": [
                {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "reports_submitted": user.reports_submitted,
                    "community_points": user.community_points,
                    "routes_used": user.routes_used
                }
                for user in users
            ]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search users: {str(e)}")

@router.get("/stats")
async def get_admin_stats(
    admin_user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Get admin dashboard statistics"""
    try:
        # Count regular users
        user_count = db.query(User).count()
        
        # Count admin users
        admin_count = db.query(AdminUser).count()
        
        # Count reports
        total_reports = db.query(Report).count()
        pending_reports = db.query(Report).filter(Report.status == "pending").count()
        approved_reports = db.query(Report).filter(Report.status == "approved").count()
        
        # Count posts
        total_posts = db.query(Post).count()
        
        return {
            "users": user_count,
            "admins": admin_count,
            "total_reports": total_reports,
            "pending_reports": pending_reports,
            "approved_reports": approved_reports,
            "total_posts": total_posts
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get statistics: {str(e)}")

@router.post("/reports")
async def create_report(
    report_data: ReportCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Create a new report with admin detection and special handling"""
    
    # Try to detect if this is an admin user
    is_admin = False
    admin_user = None
    reporter_name = report_data.reporter_name
    reporter_email = report_data.reporter_email
    
    # Check for admin token in Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            # Try to verify as admin token
            from routes.admin import verify_admin_token_direct
            admin_id = verify_admin_token_direct(token)
            if admin_id:
                admin_user = db.query(AdminUser).filter(AdminUser.id == admin_id).first()
                if admin_user:
                    is_admin = True
                    reporter_name = f"👑 {admin_user.name} (Admin)"
                    reporter_email = admin_user.email
                    print(f"👑 Admin {admin_user.name} creating report: {report_data.title}")
        except:
            # If admin token verification fails, treat as regular user
            pass
    
    # Determine status based on user type and severity
    if is_admin:
        status = "approved"  # Auto-approve admin reports
        is_visible = True    # Make visible immediately  
        admin_notes = f"Auto-approved admin report created by {admin_user.name}"
    else:
        # Auto-approve low and medium severity reports for regular users
        if report_data.urgency in ["low", "medium"]:
            status = "approved"  # Auto-approve low/medium severity
            is_visible = True    # Make visible immediately
            admin_notes = f"Auto-approved {report_data.urgency} severity report"
            print(f"✅ Auto-approved {report_data.urgency} severity report: {report_data.title}")
        else:
            status = "pending"   # High/critical severity needs manual approval
            is_visible = False   # Hidden until approved
            admin_notes = None
            print(f"📋 High/critical severity report requires approval: {report_data.title}")
    
    new_report = Report(
        title=report_data.title,
        description=report_data.description,
        category=report_data.category,
        urgency=report_data.urgency,
        location_lat=report_data.location_lat,
        location_lng=report_data.location_lng,
        location_address=report_data.location_address,
        reporter_name=reporter_name,
        reporter_email=reporter_email,
        status=status,
        is_visible=is_visible,
        admin_notes=admin_notes,
        image_data=report_data.image_data,
        image_filename=report_data.image_filename
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    
    # Save multiple images if provided
    if report_data.images and len(report_data.images) > 0:
        try:
            from models import ReportImage
            
            for image in report_data.images[:5]:  # Limit to 5 images
                report_image = ReportImage(
                    report_id=new_report.id,
                    image_data=image.data,
                    image_filename=image.filename
                )
                db.add(report_image)
            
            db.commit()
            print(f"✅ Saved {len(report_data.images)} images for report {new_report.id}")
        except Exception as e:
            print(f"⚠️ Failed to save report images: {e}")
            # Continue without failing - images are optional
    
    # If report is auto-approved, create forum post immediately
    if status == "approved":
        try:
            from models import Post
            
            severity_text = report_data.urgency.upper() if report_data.urgency in ["severe", "moderate", "low"] else "MODERATE"
            
            post_content = f"""{report_data.category.upper()} ALERT

📍 Location: {report_data.location_address}

📋 Report ID: #{new_report.id}

📝 Description: {report_data.description}

⚠️ Severity: {severity_text}

Please exercise caution when traveling through this area and consider alternative routes if possible.

Status: ✅ Verified by Admin"""
            
            # Use original reporter's information for forum post authorship
            # Try to find the reporter in the User table
            reporter_user = None
            if report_data.reporter_email:
                reporter_user = db.query(User).filter(User.email == report_data.reporter_email).first()
                print(f"🔍 Auto-approval: Looking for reporter with email: {report_data.reporter_email}")
                print(f"👤 Auto-approval: Found reporter: {reporter_user.name if reporter_user else 'Not found'}")
            
            if reporter_user:
                # Use original reporter's information
                author_id = reporter_user.id
                author_name = reporter_user.name
                print(f"✅ Auto-approval: Using original reporter: {author_name} (ID: {author_id})")
            else:
                # Fallback: Use reporter name from report data
                author_id = 999999  # Special ID for anonymous/non-registered users
                author_name = report_data.reporter_name if report_data.reporter_name else "Community Member"
                print(f"⚠️ Auto-approval: Using fallback author: {author_name} (ID: {author_id})")
                print(f"📧 Auto-approval: Report email was: {report_data.reporter_email}")
                print(f"👤 Auto-approval: Report name was: {report_data.reporter_name}")
            
            new_forum_post = Post(
                title=f"{report_data.category.title()} Report - {report_data.location_address}",
                content=post_content,
                category="reports",
                is_urgent=report_data.urgency == "severe",
                is_approved=True,  # Auto-approve since report is approved
                author_id=author_id,
                author_name=author_name,
                report_id=new_report.id  # Link to source report for images
            )
            
            db.add(new_forum_post)
            db.commit()
            print(f"Created forum post {new_forum_post.id} for auto-approved report {new_report.id}")
            
        except Exception as e:
            print(f"Failed to create forum post for auto-approved report {new_report.id}: {e}")
    
    return {"message": "Report submitted successfully", "id": new_report.id}

# Enhanced admin-aware report creation endpoint
@router.post("/reports/admin-create")
async def create_admin_report(
    report_data: ReportCreate,
    user_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Create a new report with admin detection and auto-approval"""
    
    # Get admin user details
    admin_user = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if not admin_user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    
    print(f"👑 Admin {admin_user.name} creating report: {report_data.title}")
    
    new_report = Report(
        title=report_data.title,
        description=report_data.description,
        category=report_data.category,
        urgency=report_data.urgency,
        location_lat=report_data.location_lat,
        location_lng=report_data.location_lng,
        location_address=report_data.location_address,
        reporter_name=f"👑 {admin_user.name} (Admin)",  # Add admin badge
        reporter_email=admin_user.email,
        status="approved",  # Auto-approve admin reports
        is_visible=True,    # Make visible immediately
        admin_notes=f"Auto-approved admin report created by {admin_user.name}"
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    
    # Create forum post for admin report
    try:
        from models import Post
        
        severity_text = report_data.urgency.upper() if report_data.urgency in ["severe", "moderate", "low"] else "MODERATE"
        
        post_content = f"""{report_data.category.upper()} ALERT

📍 Location: {report_data.location_address}

📋 Report ID: #{new_report.id}

📝 Description: {report_data.description}

⚠️ Severity: {severity_text}

👑 Reported by: Admin

Please exercise caution when traveling through this area and consider alternative routes if possible.

Status: ✅ Verified by Admin"""
        
        new_forum_post = Post(
            title=f"{report_data.category.title()} Report - {report_data.location_address}",
            content=post_content,
            category="reports",
            is_urgent=report_data.urgency == "severe",
            is_approved=True,  # Auto-approve admin reports
            author_id=admin_user.id,
            author_name=admin_user.name,
            report_id=new_report.id  # Link to source report for images
        )
        
        db.add(new_forum_post)
        db.commit()
        print(f"Created forum post {new_forum_post.id} for admin report {new_report.id}")
        
    except Exception as e:
        print(f"Failed to create forum post for admin report {new_report.id}: {e}")
    
    print(f"✅ Auto-approved admin report {new_report.id} created")
    
    return {
        "message": "Admin report created and auto-approved successfully", 
        "id": new_report.id,
        "status": "approved",
        "is_admin_report": True
    }

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

@router.get("/dashboard")
async def get_admin_dashboard(
    admin_id: int = Depends(verify_admin_token),
    db: Session = Depends(get_db)
):
    """Get admin dashboard with system overview metrics"""
    
    try:
        # Count total road segments (from database or hardcoded from OSM data)
        total_roads = 10494  # From OpenStreetMap data collection
        
        # Count currently flooded roads
        flooded_roads = 49  # From current flood data
        
        # Count total users
        total_users = db.query(User).count()
        
        # Count active users (users who logged in today)
        from datetime import datetime, timedelta
        today = datetime.utcnow().date()
        active_users_today = db.query(User).filter(
            User.last_activity >= datetime.combine(today, datetime.min.time())
        ).count()
        
        # Count total reports
        total_reports = db.query(Report).count()
        
        # Count unverified reports
        unverified_reports = db.query(Report).filter(
            Report.status == "pending"
        ).count()
        
        # Count approved reports
        approved_reports = db.query(Report).filter(
            Report.status == "approved"
        ).count()
        
        # Report breakdown by category
        report_by_category = {}
        categories = ["flood", "road_closure", "accident", "emergency", "infrastructure", "other"]
        for category in categories:
            count = db.query(Report).filter(Report.category == category).count()
            if count > 0:
                report_by_category[category] = count
        
        # Average report verification score
        avg_verification = 0.0
        verified_reports = db.query(Report).filter(
            Report.verification_score > 0
        ).all()
        if verified_reports:
            avg_verification = sum([r.verification_score for r in verified_reports]) / len(verified_reports)
        
        # Recent reports (last 7 days)
        seven_days_ago = datetime.utcnow() - timedelta(days=7)
        recent_reports = db.query(Report).filter(
            Report.created_at >= seven_days_ago
        ).count()
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "system_overview": {
                "total_road_segments": total_roads,
                "currently_flooded_roads": flooded_roads,
                "flood_percentage": round((flooded_roads / total_roads * 100), 2),
                "total_users": total_users,
                "active_users_today": active_users_today,
                "system_uptime_percentage": 99.8  # Example uptime
            },
            "reports_summary": {
                "total_reports": total_reports,
                "unverified_reports": unverified_reports,
                "approved_reports": approved_reports,
                "recent_reports_7days": recent_reports,
                "average_verification_score": round(avg_verification, 2),
                "by_category": report_by_category
            },
            "user_statistics": {
                "total_registered": total_users,
                "active_today": active_users_today,
                "route_history_records": db.query(RouteHistory).count(),
                "favorite_routes": db.query(FavoriteRoute).count(),
                "search_queries": db.query(SearchHistory).count()
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard data: {str(e)}")

@router.post("/flood/update-now")
async def trigger_flood_update(
    admin_id: int = Depends(verify_admin_token),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Manually trigger flood data update"""
    
    if flood_update_state.is_updating:
        raise HTTPException(
            status_code=409, 
            detail="Flood update already in progress. Please wait for it to complete."
        )
    
    try:
        # Start the update process
        flood_update_state.start_update()
        
        # Add background task to run the actual update
        if background_tasks:
            background_tasks.add_task(run_flood_update_task)
        else:
            # Fallback: run async without background tasks
            asyncio.create_task(run_flood_update_task())
        
        return {
            "message": "Flood data update initiated",
            "status": flood_update_state.get_status()
        }
        
    except Exception as e:
        flood_update_state.fail_update(str(e))
        logger.error(f"Error initiating flood update: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate flood update: {str(e)}")

@router.get("/flood/update-status")
async def get_flood_update_status(
    admin_id: int = Depends(verify_admin_token)
):
    """Get current flood update status"""
    return flood_update_state.get_status()


@router.get("/flood/update-logs")
async def get_flood_update_logs(
    admin_id: int = Depends(verify_admin_token)
):
    """Get logs from the current/last flood data update"""
    return {"logs": flood_update_state.get_logs()}


async def run_flood_update_task():
    """Background task to run flood data update"""
    try:
        from services.flood_data_updater import update_flood_data
        
        logger.info("Starting background flood data update...")
        
        # Run the flood update with explicit error handling
        try:
            output_path = await update_flood_data()
            
            if output_path:
                # Simulate progress by reading the output
                roads_updated = 234  # Default estimate - could be calculated from actual data
                flood_update_state.complete_update(roads_updated)
                logger.info(f"✅ Flood update completed: {output_path}")
            else:
                flood_update_state.fail_update("No output generated from flood update")
                logger.error("Flood update failed - no output")
        except Exception as inner_e:
            error_msg = str(inner_e)
            logger.error(f"❌ Flood updater crashed: {error_msg}", exc_info=True)
            flood_update_state.fail_update(error_msg)
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"❌ Flood update task failed: {error_msg}", exc_info=True)
        flood_update_state.fail_update(error_msg)


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