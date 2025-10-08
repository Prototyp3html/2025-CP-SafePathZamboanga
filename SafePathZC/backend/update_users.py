"""
Update existing user records with default values for new fields
"""
import os
import sys
from datetime import datetime
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Add the current directory to Python path to import models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

load_dotenv()

# Import models
from models import User, SessionLocal

def update_existing_users():
    """Update existing users with default values for new fields"""
    db = SessionLocal()
    try:
        # Get all users that have null values for the new fields
        users = db.query(User).filter(
            (User.joined_at == None) | 
            (User.last_activity == None) |
            (User.community_points == None) |
            (User.routes_used == None) |
            (User.reports_submitted == None)
        ).all()
        
        if not users:
            print("✓ No users need updating")
            return
            
        print(f"📝 Updating {len(users)} user records...")
        
        for user in users:
            # Set default values for null fields
            if user.joined_at is None:
                user.joined_at = datetime.utcnow()
            if user.last_activity is None:
                user.last_activity = datetime.utcnow()
            if user.community_points is None:
                user.community_points = 340  # Default from the static profile
            if user.routes_used is None:
                user.routes_used = 127  # Default from the static profile
            if user.reports_submitted is None:
                user.reports_submitted = 8  # Default from the static profile
                
            print(f"  ✓ Updated user: {user.email}")
        
        db.commit()
        print("✅ All user records updated successfully!")
        
    except Exception as e:
        print(f"❌ Error updating users: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_existing_users()