#!/usr/bin/env python3
"""
Migration: Add image and report_id support to posts table
Allows forum posts to display images from reports
"""

from sqlalchemy import text

def migrate():
    """Add new columns to posts table"""
    # Import here to avoid circular dependencies
    from models import engine
    
    try:
        # Use raw connection for DDL operations
        with engine.begin() as conn:
            # Check and add report_id column
            try:
                conn.execute(text("SELECT report_id FROM posts LIMIT 1"))
                print("✓ report_id column already exists")
            except Exception:
                print("Adding report_id column to posts table...")
                conn.execute(text("ALTER TABLE posts ADD COLUMN report_id INTEGER REFERENCES reports(id) ON DELETE SET NULL"))
                print("✓ Added report_id column")
            
            # Note: We don't need the images column anymore since images come from ReportImage table
            # The report_id foreign key is sufficient for linking posts to report images
        
        print("✅ Migration completed successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    migrate()
