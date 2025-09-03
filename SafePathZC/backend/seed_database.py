"""
Database seeder script to populate SafePathZC with sample data
Run this after setting up your PostgreSQL database
"""

import os
import sys
from datetime import datetime, timedelta
import asyncio
import asyncpg
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://safepathzc_user:your_secure_password@localhost:5432/safepathzc")

# Sample data
SAMPLE_ROUTE_HISTORY = [
    {
        "from_location": "WMSU Main Campus",
        "to_location": "Ayala Mall Zamboanga",
        "from_lat": 6.9214,
        "from_lng": 122.0790,
        "to_lat": 6.9214,
        "to_lng": 122.0790,
        "date": datetime.now() - timedelta(days=1),
        "duration": "25 mins",
        "distance": "8.5 km",
        "status": "completed",
        "weather_condition": "Light Rain",
        "route_type": "safe"
    },
    {
        "from_location": "Tetuan Junction",
        "to_location": "Veterans Avenue",
        "from_lat": 6.9214,
        "from_lng": 122.0790,
        "to_lat": 6.9314,
        "to_lng": 122.0890,
        "date": datetime.now() - timedelta(days=2),
        "duration": "18 mins",
        "distance": "6.2 km",
        "status": "completed",
        "weather_condition": "Heavy Rain",
        "route_type": "manageable"
    },
    {
        "from_location": "Canelar Road",
        "to_location": "Downtown Zamboanga",
        "from_lat": 6.9114,
        "from_lng": 122.0690,
        "to_lat": 6.9414,
        "to_lng": 122.0990,
        "date": datetime.now() - timedelta(days=3),
        "duration": "32 mins",
        "distance": "12.1 km",
        "status": "interrupted",
        "weather_condition": "Moderate Rain",
        "route_type": "prone"
    },
    {
        "from_location": "Plaza Pershing",
        "to_location": "Pasonanca Park",
        "from_lat": 6.9214,
        "from_lng": 122.0790,
        "to_lat": 6.9514,
        "to_lng": 122.1090,
        "date": datetime.now() - timedelta(days=4),
        "duration": "28 mins",
        "distance": "9.8 km",
        "status": "completed",
        "weather_condition": "Clear",
        "route_type": "safe"
    },
    {
        "from_location": "Zamboanga City Hall",
        "to_location": "Western Mindanao State University",
        "from_lat": 6.9014,
        "from_lng": 122.0590,
        "to_lat": 6.9614,
        "to_lng": 122.1190,
        "date": datetime.now() - timedelta(days=5),
        "duration": "22 mins",
        "distance": "7.3 km",
        "status": "completed",
        "weather_condition": "Partly Cloudy",
        "route_type": "safe"
    }
]

SAMPLE_FAVORITE_ROUTES = [
    {
        "name": "Daily Commute",
        "from_location": "Barangay Tetuan",
        "to_location": "WMSU Campus",
        "from_lat": 6.9214,
        "from_lng": 122.0790,
        "to_lat": 6.9614,
        "to_lng": 122.1190,
        "frequency": "Daily",
        "avg_duration": "22 mins",
        "last_used": datetime.now() - timedelta(days=1),
        "risk_level": "low"
    },
    {
        "name": "Shopping Trip",
        "from_location": "Downtown",
        "to_location": "Ayala Mall",
        "from_lat": 6.9114,
        "from_lng": 122.0690,
        "to_lat": 6.9214,
        "to_lng": 122.0790,
        "frequency": "Weekly",
        "avg_duration": "15 mins",
        "last_used": datetime.now() - timedelta(days=2),
        "risk_level": "moderate"
    },
    {
        "name": "Airport Route",
        "from_location": "City Center",
        "to_location": "Zamboanga Airport",
        "from_lat": 6.9214,
        "from_lng": 122.0790,
        "to_lat": 6.9814,
        "to_lng": 122.1390,
        "frequency": "Monthly",
        "avg_duration": "45 mins",
        "last_used": datetime.now() - timedelta(days=10),
        "risk_level": "high"
    },
    {
        "name": "Weekend Park Visit",
        "from_location": "Tetuan",
        "to_location": "Pasonanca Park",
        "from_lat": 6.9214,
        "from_lng": 122.0790,
        "to_lat": 6.9514,
        "to_lng": 122.1090,
        "frequency": "Weekly",
        "avg_duration": "28 mins",
        "last_used": datetime.now() - timedelta(days=3),
        "risk_level": "low"
    }
]

SAMPLE_SEARCH_HISTORY = [
    {
        "query": "Canelar Road to Veterans Avenue",
        "timestamp": datetime.now() - timedelta(hours=2),
        "results_count": 3
    },
    {
        "query": "WMSU to Ayala Mall safe route",
        "timestamp": datetime.now() - timedelta(hours=5),
        "results_count": 2
    },
    {
        "query": "Tetuan Junction alternatives",
        "timestamp": datetime.now() - timedelta(days=1),
        "results_count": 4
    },
    {
        "query": "Flood-safe routes downtown",
        "timestamp": datetime.now() - timedelta(days=2),
        "results_count": 6
    },
    {
        "query": "Fastest route to airport",
        "timestamp": datetime.now() - timedelta(days=3),
        "results_count": 2
    }
]

async def seed_database():
    """Seed the database with sample data"""
    print("🌱 Starting database seeding...")
    
    try:
        # Connect to database
        conn = await asyncpg.connect(DATABASE_URL)
        print("✅ Connected to database")
        
        # Clear existing data
        print("🗑️  Clearing existing data...")
        await conn.execute("DELETE FROM search_history")
        await conn.execute("DELETE FROM favorite_routes")
        await conn.execute("DELETE FROM route_history")
        
        # Insert route history
        print("📍 Inserting route history...")
        for route in SAMPLE_ROUTE_HISTORY:
            await conn.execute("""
                INSERT INTO route_history (
                    from_location, to_location, from_lat, from_lng, to_lat, to_lng,
                    date, duration, distance, status, weather_condition, route_type, user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            """, 
            route["from_location"], route["to_location"], 
            route["from_lat"], route["from_lng"], route["to_lat"], route["to_lng"],
            route["date"], route["duration"], route["distance"], 
            route["status"], route["weather_condition"], route["route_type"], "default_user")
        
        # Insert favorite routes
        print("⭐ Inserting favorite routes...")
        for route in SAMPLE_FAVORITE_ROUTES:
            await conn.execute("""
                INSERT INTO favorite_routes (
                    name, from_location, to_location, from_lat, from_lng, to_lat, to_lng,
                    frequency, avg_duration, last_used, risk_level, user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            """,
            route["name"], route["from_location"], route["to_location"],
            route["from_lat"], route["from_lng"], route["to_lat"], route["to_lng"],
            route["frequency"], route["avg_duration"], route["last_used"], 
            route["risk_level"], "default_user")
        
        # Insert search history
        print("🔍 Inserting search history...")
        for search in SAMPLE_SEARCH_HISTORY:
            await conn.execute("""
                INSERT INTO search_history (query, timestamp, results_count, user_id)
                VALUES ($1, $2, $3, $4)
            """,
            search["query"], search["timestamp"], search["results_count"], "default_user")
        
        await conn.close()
        print("✅ Database seeding completed successfully!")
        print(f"   • {len(SAMPLE_ROUTE_HISTORY)} route history entries")
        print(f"   • {len(SAMPLE_FAVORITE_ROUTES)} favorite routes")
        print(f"   • {len(SAMPLE_SEARCH_HISTORY)} search history entries")
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(seed_database())
