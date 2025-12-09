#!/usr/bin/env python3
"""
Migration: Add image and report_id support to posts table
Allows forum posts to display images from reports
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from models import SessionLocal, engine

def migrate():
    """Add new columns to posts table"""
    db = SessionLocal()
    
    try:
        # Check if columns already exist
        with engine.connect() as conn:
            # Try to check if report_id exists
            try:
                result = conn.execute(text("SELECT report_id FROM posts LIMIT 1"))
                print("✓ report_id column already exists")
            except:
                print("Adding report_id column to posts table...")
                conn.execute(text("ALTER TABLE posts ADD COLUMN report_id INTEGER"))
                conn.commit()
                print("✓ Added report_id column")
            
            # Try to check if images exists
            try:
                result = conn.execute(text("SELECT images FROM posts LIMIT 1"))
                print("✓ images column already exists")
            except:
                print("Adding images column to posts table...")
                conn.execute(text("ALTER TABLE posts ADD COLUMN images TEXT"))
                conn.commit()
                print("✓ Added images column")
        
        print("\n✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False
    finally:
        db.close()

if __name__ == "__main__":
    migrate()
