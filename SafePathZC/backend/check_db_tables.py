#!/usr/bin/env python3
"""Check what tables exist in localhost database"""

import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / "safepath.db"

if not db_path.exists():
    print(f"❌ Database not found at: {db_path}")
    exit(1)

try:
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    print("\n" + "="*60)
    print("LOCALHOST DATABASE TABLES")
    print("="*60 + "\n")
    
    # List all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    
    print(f"Total tables: {len(tables)}\n")
    
    for table in tables:
        table_name = table[0]
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        print(f"  📊 {table_name}: {count:,} records")
    
    # Show flood_hotspots sample
    print("\n" + "="*60)
    print("FLOOD HOTSPOTS SAMPLE DATA")
    print("="*60 + "\n")
    
    cursor.execute("SELECT * FROM flood_hotspots LIMIT 1")
    columns = [description[0] for description in cursor.description]
    print(f"Columns: {', '.join(columns)}\n")
    
    cursor.execute("SELECT * FROM flood_hotspots LIMIT 3")
    for row in cursor.fetchall():
        print(f"  {row}\n")
    
    conn.close()
    
    print("="*60)
    print("✅ DATABASE CHECK COMPLETE")
    print("="*60 + "\n")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
