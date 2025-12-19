#!/usr/bin/env python3
import sqlite3

conn = sqlite3.connect('safepath.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

print('Tables in safepath.db:')
for table in tables:
    print(f'  - {table[0]}')

# Check flood tables specifically
print('\nFlood-related tables:')
for table_name in ['flood_hotspots', 'flood_event_logs', 'flood_statistics']:
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    if columns:
        print(f'\n  {table_name}:')
        for col in columns:
            print(f'    - {col[1]} ({col[2]})')
    else:
        print(f'  {table_name}: NOT FOUND')

conn.close()
