#!/usr/bin/env python3
from sqlalchemy import create_engine, inspect

# Check local database schema
engine = create_engine('sqlite:///./safepath.db')
inspector = inspect(engine)

print('LOCAL flood_hotspots columns:')
for col in inspector.get_columns('flood_hotspots'):
    print(f"  - {col['name']}: {col['type']}")

print('\nLOCAL flood_event_logs columns:')
for col in inspector.get_columns('flood_event_logs'):
    print(f"  - {col['name']}: {col['type']}")
