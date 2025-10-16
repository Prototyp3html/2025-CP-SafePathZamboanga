"""
Complete Database Export Script (Python version)
Creates a full backup of your SafePath database including all spatial data
"""
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

def export_database():
    print("🗃️ SAFEPATH DATABASE COMPLETE EXPORT")
    print("=" * 50)
    
    # Database configuration
    db_config = {
        'host': 'localhost',
        'port': '5432', 
        'database': 'safepathzc',
        'username': 'safepathzc_user'
    }
    
    # Create backup filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"safepathzc_complete_backup_{timestamp}.dump"
    
    # Create backup directory
    backup_dir = Path("database_backups")
    backup_dir.mkdir(exist_ok=True)
    backup_path = backup_dir / backup_filename
    
    print(f"📤 Exporting complete database...")
    print(f"Database: {db_config['database']}")
    print(f"User: {db_config['username']}")
    print(f"Output: {backup_path}")
    print()
    
    # Find pg_dump executable
    pg_dump_paths = [
        "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe", 
        "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
        "C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\pg_dump.exe",
        "pg_dump"  # If in PATH
    ]
    
    pg_dump_exe = None
    for path in pg_dump_paths:
        if os.path.exists(path) or path == "pg_dump":
            pg_dump_exe = path
            break
    
    if not pg_dump_exe:
        print("❌ pg_dump not found!")
        print("Please check your PostgreSQL installation")
        return False
    
    # Build pg_dump command
    cmd = [
        pg_dump_exe,
        f"--host={db_config['host']}",
        f"--port={db_config['port']}", 
        f"--username={db_config['username']}",
        "--format=custom",
        "--compress=9",
        "--verbose",
        "--no-password",  # Will prompt for password
        f"--file={backup_path}",
        db_config['database']
    ]
    
    print("🔧 Running pg_dump command...")
    print(f"Command: {' '.join(cmd[:7])} [database]")
    print()
    
    try:
        # Run pg_dump
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        
        print("✅ DATABASE EXPORT SUCCESSFUL!")
        print(f"📁 File saved: {backup_path}")
        
        # Show file size
        file_size = backup_path.stat().st_size
        size_mb = file_size / (1024 * 1024)
        print(f"📊 Backup size: {size_mb:.2f} MB")
        
        print()
        print("📤 SEND THIS FILE TO YOUR CLASSMATE:")
        print(f"   {backup_path}")
        print()
        print("💡 Instructions for your classmate:")
        print("   1. Copy the .dump file to their SafePath folder")
        print("   2. Run: python import_complete_database.py")
        print("   3. Or use: import_complete_database.bat")
        
        return True
        
    except subprocess.CalledProcessError as e:
        print("❌ DATABASE EXPORT FAILED!")
        print(f"Error: {e}")
        if e.stderr:
            print(f"Details: {e.stderr}")
        return False
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    print("Starting database export...")
    print("You may be prompted for the database password: safepath123")
    print()
    
    success = export_database()
    
    if success:
        print("\n🎉 Export completed successfully!")
        print("Your classmate can now import this database to get all your data")
    else:
        print("\n💡 If you got a password prompt, the password is: safepath123")
        print("Try running the .bat file instead for easier password handling")
    
    input("\nPress Enter to exit...")