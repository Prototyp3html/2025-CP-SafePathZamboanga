"""
Add report_images table for storing multiple images per report

This migration creates a one-to-many relationship where each report can have
multiple images stored in a separate table.
"""

def migrate_up():
    """Add report_images table if it doesn't exist"""
    from database.config import get_db_connection
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Check if table already exists
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = 'report_images'
        """)
        
        if cursor.fetchone():
            print("✅ report_images table already exists")
            cursor.close()
            connection.close()
            return True
        
        # Create report_images table
        cursor.execute("""
            CREATE TABLE report_images (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                image_data TEXT NOT NULL,
                image_filename VARCHAR NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
            )
        """)
        
        # Create index on report_id for faster queries
        cursor.execute("""
            CREATE INDEX idx_report_images_report_id ON report_images(report_id)
        """)
        
        connection.commit()
        print("✅ Created report_images table successfully")
        
        cursor.close()
        connection.close()
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


def migrate_down():
    """Drop report_images table if it exists"""
    from database.config import get_db_connection
    
    try:
        connection = get_db_connection()
        cursor = connection.cursor()
        
        # Drop the table
        cursor.execute("DROP TABLE IF EXISTS report_images CASCADE")
        connection.commit()
        
        print("✅ Dropped report_images table")
        cursor.close()
        connection.close()
        return True
        
    except Exception as e:
        print(f"❌ Rollback failed: {e}")
        return False


if __name__ == "__main__":
    migrate_up()
