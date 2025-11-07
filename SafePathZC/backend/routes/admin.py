from fastapi import APIRouter, HTTPException, Depends, Security, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
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
                    Post.content.contains(f"📋 Report ID: #{report_id}"),
                    Post.category == "reports",
                    Post.is_approved == False
                ).first()
                
                # Try legacy format if not found
                if not forum_post:
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
        
        # Update the user's report count if the report had a user_id
        if report.user_id:
            user = db.query(User).filter(User.id == report.user_id).first()
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
            actual_count = db.query(Report).filter(Report.user_id == user.id).count()
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
    
    # Determine status based on user type
    if is_admin:
        status = "approved"  # Auto-approve admin reports
        is_visible = True    # Make visible immediately  
        admin_notes = f"Auto-approved admin report created by {admin_user.name}"
    else:
        status = "pending"   # Regular users need approval
        is_visible = False   # Hidden until approved
        admin_notes = None
        print(f"📋 User creating report (pending approval): {report_data.title}")
    
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
        admin_notes=admin_notes
    )
    
    db.add(new_report)
    db.commit()
    db.refresh(new_report)
    
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