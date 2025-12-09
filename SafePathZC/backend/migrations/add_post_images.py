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
        # Check if report_id column exists using information_schema
        # This doesn't abort the transaction on failure
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='posts' AND column_name='report_id'
            """))
            column_exists = result.fetchone() is not None
        
        if column_exists:
            print("✓ report_id column already exists")
        else:
            print("Adding report_id column to posts table...")
            # Use a fresh transaction to add the column
            with engine.begin() as conn:
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
