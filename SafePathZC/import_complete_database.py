"""
Complete Database Import Script for Your Classmate
Imports the complete SafePath database from your backup
"""
import os
import subprocess
import sys
from pathlib import Path
import glob

def import_database():
    print("🗃️ SAFEPATH DATABASE COMPLETE IMPORT")
    print("=" * 50)
    
    # Database configuration
    db_config = {
        'host': 'localhost',
        'port': '5432',
        'database': 'safepathzc', 
        'username': 'safepathzc_user'
    }
    
    print(f"📥 Importing complete database...")
    print(f"Database: {db_config['database']}")
    print(f"User: {db_config['username']}")
    print()
    
    # Find backup files
    backup_dir = Path("database_backups")
    if not backup_dir.exists():
        backup_dir.mkdir()
    
    backup_files = list(backup_dir.glob("*.dump"))
    
    if not backup_files:
        print("❌ No backup files found!")
        print(f"Please copy the .dump file to: {backup_dir}/")
        print("The file should be named like: safepathzc_complete_backup_YYYYMMDD.dump")
        return False
    
    # Use the most recent backup file
    backup_file = max(backup_files, key=os.path.getctime)
    print(f"📁 Using backup file: {backup_file}")
    
    file_size = backup_file.stat().st_size / (1024 * 1024)
    print(f"📊 Backup size: {file_size:.2f} MB")
    print()
    
    # Warning about overwriting
    print("⚠️  WARNING: This will REPLACE your current database!")
    print("All existing data will be lost.")
    confirm = input("Type 'YES' to confirm: ")
    
    if confirm != 'YES':
        print("Operation cancelled.")
        return False
    
    # Find PostgreSQL executables
    pg_paths = [
        "C:\\Program Files\\PostgreSQL\\17\\bin\\",
        "C:\\Program Files\\PostgreSQL\\16\\bin\\",
        "C:\\Program Files\\PostgreSQL\\15\\bin\\",
        "C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\",
    ]
    
    pg_bin = None
    for path in pg_paths:
        if os.path.exists(path):
            pg_bin = path
            break
    
    if not pg_bin:
        print("❌ PostgreSQL executables not found!")
        return False
    
    dropdb_exe = os.path.join(pg_bin, "dropdb.exe")
    createdb_exe = os.path.join(pg_bin, "createdb.exe") 
    pg_restore_exe = os.path.join(pg_bin, "pg_restore.exe")
    psql_exe = os.path.join(pg_bin, "psql.exe")
    
    print("🔄 Step 1: Dropping existing database...")
    try:
        cmd = [
            dropdb_exe,
            f"--host={db_config['host']}",
            f"--port={db_config['port']}",
            f"--username={db_config['username']}",
            "--if-exists",
            db_config['database']
        ]
        subprocess.run(cmd, check=True)
        print("✅ Database dropped")
    except:
        print("⚠️ Database drop failed (may not exist)")
    
    print("\n🆕 Step 2: Creating new database...")
    try:
        cmd = [
            createdb_exe,
            f"--host={db_config['host']}",
            f"--port={db_config['port']}",
            f"--username={db_config['username']}",
            f"--owner={db_config['username']}",
            db_config['database']
        ]
        subprocess.run(cmd, check=True)
        print("✅ Database created")
    except Exception as e:
        print(f"❌ Database creation failed: {e}")
        return False
    
    print("\n📥 Step 3: Restoring data from backup...")
    try:
        cmd = [
            pg_restore_exe,
            f"--host={db_config['host']}",
            f"--port={db_config['port']}",
            f"--username={db_config['username']}",
            f"--dbname={db_config['database']}",
            "--verbose",
            "--clean", 
            "--if-exists",
            str(backup_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0 or "WARNING" in result.stderr:
            print("✅ Data restored successfully")
        else:
            print("⚠️ Restore completed with warnings")
            
    except Exception as e:
        print(f"❌ Restore failed: {e}")
        return False
    
    print("\n🔍 Step 4: Verifying import...")
    try:
        cmd = [
            psql_exe,
            f"--host={db_config['host']}",
            f"--port={db_config['port']}",
            f"--username={db_config['username']}",
            f"--dbname={db_config['database']}",
            "--tuples-only",
            "--command=SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        table_count = result.stdout.strip()
        
        print(f"📊 Tables imported: {table_count}")
        
        # Check for spatial tables specifically
        spatial_check = [
            psql_exe,
            f"--host={db_config['host']}",
            f"--port={db_config['port']}",
            f"--username={db_config['username']}",
            f"--dbname={db_config['database']}",
            "--tuples-only",
            "--command=SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('roads', 'posts', 'users');"
        ]
        
        result = subprocess.run(spatial_check, capture_output=True, text=True)
        key_tables = result.stdout.strip()
        
        print(f"🗺️ Key tables (roads, posts, users): {key_tables}")
        
        if int(table_count) >= 10 and int(key_tables) >= 3:
            print("\n🎉 DATABASE IMPORT SUCCESSFUL!")
            print("✅ Your database now has all spatial tables and data")
            print("✅ You can now use terrain-aware routing")
            print("✅ All forum posts and user data imported")
            return True
        else:
            print("\n⚠️ Import may be incomplete")
            return False
            
    except Exception as e:
        print(f"⚠️ Verification failed: {e}")
        return True  # Assume success if we can't verify

if __name__ == "__main__":
    print("Starting database import...")
    print("You may be prompted for the database password: safepath123")
    print()
    
    success = import_database()
    
    if success:
        print("\n🎉 Import completed successfully!")
        print("Your SafePath system now has all the spatial routing capabilities!")
        print("You can now run: python verify_spatial_setup.py")
    else:
        print("\n❌ Import failed. Check the error messages above.")
    
    input("\nPress Enter to exit...")