"""
Community Forum API Routes
Handles posts, comments, and likes for the community forum
"""

from fastapi import APIRouter, Depends, HTTPException, status, Security, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import json
import jwt
import os

from models import SessionLocal, Post, Comment, PostLike, User, AdminUser

router = APIRouter(prefix="/api/forum", tags=["forum"])

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")  # Should match user_auth.py
ALGORITHM = "HS256"
security = HTTPBearer()

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Authentication dependency  
from fastapi import Request

def get_token_from_request(request: Request) -> Optional[str]:
    """Extract token from request headers"""
    auth_header = request.headers.get('authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    return auth_header.split(' ')[1]

def verify_token_optional(request: Request):
    """Verify token but don't raise error if not provided"""
    token = get_token_from_request(request)
    if not token:
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            return None
        return int(user_id)
    except jwt.PyJWTError:
        return None

def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    try:
        print(f"Verifying token: {credentials.credentials[:20]}...")
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            print("No user_id in token payload")
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        print(f"Token verified for user_id: {user_id}")
        return int(user_id)
    except jwt.PyJWTError as e:
        print(f"JWT Error: {e}")
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

def get_current_user(user_id: int = Depends(verify_token), db: Session = Depends(get_db)):
    """Get current user - checks both User and AdminUser tables"""
    # First check AdminUser table
    admin = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if admin:
        print(f"🔍 Found admin user: {admin.name} (ID: {admin.id}) with role: {admin.role}")
        # Return admin as a user-like object
        class AdminAsUser:
            def __init__(self, admin):
                self.id = admin.id
                self.name = admin.name
                self.email = admin.email
                self.role = admin.role
                # Add missing attributes that might be accessed by forum code
                self.reports_submitted = 0  # Admins don't track report counts
                self.joined_at = admin.created_at if hasattr(admin, 'created_at') else None
                self.is_active = admin.is_active if hasattr(admin, 'is_active') else True
        return AdminAsUser(admin)
    
    # Then check regular User table
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        print(f"🔍 Found regular user: {user.name} (ID: {user.id}) with role: {getattr(user, 'role', 'user')}")
        return user
    
    print(f"🔍 No user found with ID: {user_id}")
    raise HTTPException(status_code=404, detail="User not found")

def get_current_user_optional(request: Request, db: Session = Depends(get_db)):
    """Get current user but return None if not authenticated - checks both tables"""
    user_id = verify_token_optional(request)
    if user_id is None:
        return None
    
    # First check AdminUser table
    admin = db.query(AdminUser).filter(AdminUser.id == user_id).first()
    if admin:
        print(f"🔍 Found optional admin user: {admin.name} (ID: {admin.id}) with role: {admin.role}")
        # Return admin as a user-like object
        class AdminAsUser:
            def __init__(self, admin):
                self.id = admin.id
                self.name = admin.name
                self.email = admin.email
                self.role = admin.role
                # Add missing attributes that might be accessed by forum code
                self.reports_submitted = 0  # Admins don't track report counts
                self.joined_at = admin.created_at if hasattr(admin, 'created_at') else None
                self.is_active = admin.is_active if hasattr(admin, 'is_active') else True
        return AdminAsUser(admin)
    
    # Then check regular User table
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        print(f"🔍 Found optional regular user: {user.name} (ID: {user.id}) with role: {getattr(user, 'role', 'user')}")
    return user

# Pydantic models
class PostCreate(BaseModel):
    title: str
    content: str
    category: str
    tags: List[str] = []
    is_urgent: bool = False

class PostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    is_urgent: Optional[bool] = None

class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    author_id: int
    author_name: str
    author_profile_picture: Optional[str] = None  # Base64 profile picture
    category: str
    tags: List[str]
    likes_count: int
    replies_count: int
    is_urgent: bool
    is_approved: bool
    created_at: datetime
    updated_at: datetime
    is_liked: bool = False
    timestamp: str

class CommentCreate(BaseModel):
    content: str

class CommentResponse(BaseModel):
    id: int
    post_id: int
    author_id: int
    author_name: str
    author_profile_picture: Optional[str] = None  # Base64 profile picture
    content: str
    created_at: datetime
    updated_at: datetime
    timestamp: str

class PostsListResponse(BaseModel):
    posts: List[PostResponse]
    total: int
    page: int
    limit: int

# Helper functions
def format_timestamp(dt: datetime) -> str:
    """Format datetime to human readable timestamp"""
    now = datetime.utcnow()
    diff = now - dt
    
    if diff.days > 0:
        return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
    elif diff.seconds >= 3600:
        hours = diff.seconds // 3600
        return f"{hours} hour{'s' if hours > 1 else ''} ago"
    elif diff.seconds >= 60:
        minutes = diff.seconds // 60
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    else:
        return "Just now"

def format_post_response(post: Post, user_id: int, db: Session) -> PostResponse:
    """Format post for API response"""
    # Check if user liked this post (only if user is authenticated)
    is_liked = False
    if user_id > 0:
        is_liked = db.query(PostLike).filter(
            PostLike.post_id == post.id,
            PostLike.user_id == user_id
        ).first() is not None
    
    # Get author's profile picture
    author_profile_picture = None
    author = db.query(User).filter(User.id == post.author_id).first()
    if author and hasattr(author, 'profile_picture') and author.profile_picture:
        author_profile_picture = author.profile_picture
    
    # Parse tags
    tags = json.loads(post.tags) if post.tags else []
    
    return PostResponse(
        id=post.id,
        title=post.title,
        content=post.content,
        author_id=post.author_id,
        author_name=post.author_name,
        author_profile_picture=author_profile_picture,
        category=post.category,
        tags=tags,
        likes_count=post.likes_count,
        replies_count=post.replies_count,
        is_urgent=post.is_urgent,
        is_approved=post.is_approved,
        created_at=post.created_at,
        updated_at=post.updated_at,
        is_liked=is_liked,
        timestamp=format_timestamp(post.created_at)
    )

def format_comment_response(comment: Comment, db: Session) -> CommentResponse:
    """Format comment for API response"""
    # Get author's profile picture
    author_profile_picture = None
    author = db.query(User).filter(User.id == comment.author_id).first()
    if author and hasattr(author, 'profile_picture') and author.profile_picture:
        author_profile_picture = author.profile_picture
    
    return CommentResponse(
        id=comment.id,
        post_id=comment.post_id,
        author_id=comment.author_id,
        author_name=comment.author_name,
        author_profile_picture=author_profile_picture,
        content=comment.content,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        timestamp=format_timestamp(comment.created_at)
    )

# API Endpoints

@router.get("/posts", response_model=PostsListResponse)
def get_posts(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "recent",
    show_pending: bool = False,  # For admin to see pending posts
    db: Session = Depends(get_db)
):
    """Get paginated list of forum posts"""
    # Get current user optionally
    current_user = get_current_user_optional(request, db)
    
    query = db.query(Post)
    
    # Filter by approval status (only admins can see pending posts)
    if current_user and current_user.role == "admin" and show_pending:
        # Admin can see pending posts
        query = query.filter(Post.is_approved == False)
    else:
        # Regular users only see approved posts
        query = query.filter(Post.is_approved == True)
    
    # Filter by category
    if category and category != "all":
        category_map = {
            "route-alerts": "alerts",
            "road-reports": "reports",
            "suggestions": "suggestions",
            "general-discussion": "general"
        }
        mapped_category = category_map.get(category, category)
        query = query.filter(Post.category == mapped_category)
    
    # Search filter
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            (Post.title.ilike(search_term)) |
            (Post.content.ilike(search_term)) |
            (Post.tags.ilike(search_term))
        )
    
    # Sorting
    if sort_by == "recent":
        query = query.order_by(desc(Post.created_at))
    elif sort_by == "popular":
        query = query.order_by(desc(Post.likes_count))
    elif sort_by == "discussed":
        query = query.order_by(desc(Post.replies_count))
    
    # Get total count
    total = query.count()
    
    # Paginate
    posts = query.offset(skip).limit(limit).all()
    
    # Format response (use user_id=0 if not authenticated)
    user_id = current_user.id if current_user else 0
    formatted_posts = [format_post_response(post, user_id, db) for post in posts]
    
    return PostsListResponse(
        posts=formatted_posts,
        total=total,
        page=(skip // limit) + 1,
        limit=limit
    )

@router.get("/posts/{post_id}", response_model=PostResponse)
def get_post(post_id: int, request: Request, db: Session = Depends(get_db)):
    """Get a specific post by ID"""
    # Get current user optionally
    current_user = get_current_user_optional(request, db)
    
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Use user_id=0 if not authenticated
    user_id = current_user.id if current_user else 0
    return format_post_response(post, user_id, db)

@router.post("/posts", response_model=PostResponse)
def create_post(post_data: PostCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new forum post"""
    
    # Determine if post needs approval
    # Only urgent alerts need admin approval, reports are auto-approved
    needs_approval = post_data.category in ["alerts"] and post_data.is_urgent
    
    # Admins can auto-approve their own posts
    is_auto_approved = current_user.role == "admin" or not needs_approval
    
    # Create new post
    new_post = Post(
        title=post_data.title,
        content=post_data.content,
        author_id=current_user.id,
        author_name=current_user.name,
        category=post_data.category,
        tags=json.dumps(post_data.tags) if post_data.tags else "[]",
        is_urgent=post_data.is_urgent,
        is_approved=is_auto_approved
    )
    
    # Enhanced admin vs user handling for reports
    if post_data.category == "reports":
        if current_user.role == 'admin':
            # Admin reports: Auto-approve and add admin badge
            new_post.is_approved = True  # Force approval for admin reports
            new_post.author_name = f"👑 {current_user.name} (Admin)"  # Add admin badge
            print(f"👑 Admin {current_user.name} created auto-approved report: {post_data.title}")
        else:
            # Regular user reports: Normal flow + increment counter
            if hasattr(current_user, 'reports_submitted'):
                current_user.reports_submitted = (current_user.reports_submitted or 0) + 1
                print(f"📈 User {current_user.name} report count: {current_user.reports_submitted}")
            print(f"📋 User {current_user.name} created report (pending approval): {post_data.title}")
    else:
        # Non-report posts
        print(f"� {current_user.role.title()} {current_user.name} created post: {post_data.title}")
    
    db.add(new_post)
    
    db.commit()
    db.refresh(new_post)
    
    return format_post_response(new_post, current_user.id, db)

@router.put("/posts/{post_id}", response_model=PostResponse)
def update_post(post_id: int, post_data: PostUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing post"""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if user is the author
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")
    
    # Update fields
    if post_data.title is not None:
        post.title = post_data.title
    if post_data.content is not None:
        post.content = post_data.content
    if post_data.category is not None:
        post.category = post_data.category
    if post_data.tags is not None:
        post.tags = json.dumps(post_data.tags)
    if post_data.is_urgent is not None:
        post.is_urgent = post_data.is_urgent
    
    post.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(post)
    
    return format_post_response(post, current_user.id, db)

@router.delete("/posts/{post_id}")
def delete_post(post_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a post"""
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if user is the author
    if post.author_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    
    # Delete associated likes and comments
    db.query(PostLike).filter(PostLike.post_id == post_id).delete()
    db.query(Comment).filter(Comment.post_id == post_id).delete()
    
    db.delete(post)
    db.commit()
    
    return {"message": "Post deleted successfully"}

@router.post("/posts/{post_id}/like")
def toggle_like(post_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Toggle like status for a post"""
    print(f"Like request: post_id={post_id}, user_id={current_user.id}, user_email={current_user.email}")
    
    # Check if post exists
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Check if already liked
    existing_like = db.query(PostLike).filter(
        PostLike.post_id == post_id,
        PostLike.user_id == current_user.id
    ).first()
    
    if existing_like:
        # Unlike
        db.delete(existing_like)
        post.likes_count = max(0, post.likes_count - 1)
        liked = False
        print(f"Unliked post {post_id}, new count: {post.likes_count}")
    else:
        # Like
        new_like = PostLike(post_id=post_id, user_id=current_user.id)
        db.add(new_like)
        post.likes_count += 1
        liked = True
        print(f"Liked post {post_id}, new count: {post.likes_count}")
    
    db.commit()
    
    return {"liked": liked, "likes_count": post.likes_count}

@router.get("/posts/{post_id}/comments", response_model=List[CommentResponse])
def get_comments(post_id: int, db: Session = Depends(get_db)):
    """Get comments for a specific post"""
    # Check if post exists
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    comments = db.query(Comment).filter(Comment.post_id == post_id).order_by(Comment.created_at).all()
    
    return [format_comment_response(comment, db) for comment in comments]

@router.post("/posts/{post_id}/comments", response_model=CommentResponse)
def create_comment(post_id: int, comment_data: CommentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new comment on a post"""
    # Check if post exists
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Create new comment
    new_comment = Comment(
        post_id=post_id,
        author_id=current_user.id,
        author_name=current_user.name,
        content=comment_data.content
    )
    
    db.add(new_comment)
    
    # Update post replies count
    post.replies_count += 1
    
    db.commit()
    db.refresh(new_comment)
    
    return format_comment_response(new_comment, db)

@router.get("/stats")
def get_forum_stats(db: Session = Depends(get_db)):
    """Get forum statistics"""
    total_posts = db.query(Post).filter(Post.is_approved == True).count()
    total_comments = db.query(Comment).count()
    total_users = db.query(User).count()
    
    # Posts today
    today = datetime.utcnow().date()
    posts_today = db.query(Post).filter(
        func.date(Post.created_at) == today,
        Post.is_approved == True
    ).count()
    
    return {
        "total_members": total_users,
        "posts_today": posts_today,
        "active_now": min(total_users, max(1, total_users // 3)),  # Realistic estimate: ~1/3 of users could be active
        "total_posts": total_posts
    }

# Admin-only endpoints
@router.get("/admin/pending-posts", response_model=PostsListResponse)
def get_pending_posts(
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get pending posts for admin approval"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = db.query(Post).filter(Post.is_approved == False)
    query = query.order_by(desc(Post.created_at))
    
    total = query.count()
    posts = query.offset(skip).limit(limit).all()
    
    formatted_posts = [format_post_response(post, current_user.id, db) for post in posts]
    
    return PostsListResponse(
        posts=formatted_posts,
        total=total,
        page=(skip // limit) + 1,
        limit=limit
    )

@router.patch("/admin/posts/{post_id}/approve")
def approve_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Approve a pending post"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    post.is_approved = True
    post.updated_at = datetime.utcnow()
    
    db.commit()
    
    return {"message": "Post approved successfully"}

@router.patch("/admin/posts/{post_id}/reject")
def reject_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reject a pending post (delete it)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Delete associated likes and comments
    db.query(PostLike).filter(PostLike.post_id == post_id).delete()
    db.query(Comment).filter(Comment.post_id == post_id).delete()
    
    db.delete(post)
    db.commit()
    
    return {"message": "Post rejected and deleted successfully"}

@router.delete("/admin/posts/{post_id}")
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete any post (admin only)"""
    print(f"🔍 Delete attempt by user: {current_user.name} (ID: {current_user.id})")
    print(f"🔍 User role: {current_user.role}")
    print(f"🔍 Is admin? {current_user.role == 'admin'}")
    
    if current_user.role != "admin":
        print(f"❌ Access denied - role '{current_user.role}' is not 'admin'")
        raise HTTPException(status_code=403, detail="Admin access required")
    
    print(f"✅ Admin access confirmed for user: {current_user.name}")
    
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    # Delete associated likes and comments first
    db.query(PostLike).filter(PostLike.post_id == post_id).delete()
    db.query(Comment).filter(Comment.post_id == post_id).delete()
    
    # Store post title for response
    post_title = post.title
    
    # Delete the post
    db.delete(post)
    db.commit()
    
    return {"message": f"Post '{post_title}' deleted successfully"}