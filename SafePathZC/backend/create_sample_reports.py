"""
Create sample report posts for the map to display
"""
from models import SessionLocal, Post, User
from datetime import datetime, timedelta
import random

db = SessionLocal()

# Get Maria Santos user
maria = db.query(User).filter(User.email == 'maria.santos@email.com').first()
if not maria:
    print("Error: Demo user not found")
    db.close()
    exit(1)

# Sample report data with real Zamboanga City locations
sample_reports = [
    {
        "title": "Severe Flooding on Valderosa Street",
        "content": """**Issue Type:** Flooding
**Severity:** Severe
**Location:** Valderosa Street, Zamboanga City

Heavy rainfall has caused severe flooding on Valderosa Street near the city center. Water level is approximately 2 feet deep, making the road impassable for regular vehicles. Residents are advised to avoid the area and seek alternative routes.""",
        "category": "reports",
        "tags": '["flooding", "severe", "road-closed"]',
        "is_urgent": True,
    },
    {
        "title": "Road Damage on Mayor Jaldon Street",
        "content": """**Issue Type:** Road Damage
**Severity:** Moderate
**Location:** Mayor Jaldon Street, Zamboanga City

Large potholes have developed on Mayor Jaldon Street near the intersection with Tomas Claudio Street. The damage covers approximately 50 meters and poses a hazard to motorists, especially during nighttime.""",
        "category": "reports",
        "tags": '["road-damage", "moderate", "maintenance-needed"]',
        "is_urgent": False,
    },
    {
        "title": "Fallen Tree Blocking Road in Pasonanca",
        "content": """**Issue Type:** Road Blockage
**Severity:** High
**Location:** Pasonanca Road, Zamboanga City

A large tree has fallen across Pasonanca Road near the Pasonanca Park entrance due to strong winds. The road is completely blocked and emergency services have been notified. Traffic is being diverted.""",
        "category": "reports",
        "tags": '["road-blockage", "high", "emergency"]',
        "is_urgent": True,
    },
    {
        "title": "Poor Drainage System on Canelar Street",
        "content": """**Issue Type:** Infrastructure
**Severity:** Moderate
**Location:** Canelar Street, Zamboanga City

The drainage system on Canelar Street is clogged, causing water to accumulate during rain. This creates mosquito breeding areas and poses health risks to nearby residents. Urgent maintenance is required.""",
        "category": "reports",
        "tags": '["infrastructure", "drainage", "health-hazard"]',
        "is_urgent": False,
    },
    {
        "title": "Landslide Risk at Veterans Avenue",
        "content": """**Issue Type:** Weather Hazard
**Severity:** High
**Location:** Veterans Avenue, Zamboanga City

Recent heavy rains have caused soil erosion along Veterans Avenue hillside. Cracks have appeared on the road shoulder, indicating potential landslide risk. Authorities should inspect and secure the area immediately.""",
        "category": "reports",
        "tags": '["landslide", "weather-hazard", "high-risk"]',
        "is_urgent": True,
    },
    {
        "title": "Flooding Near RT Lim Boulevard",
        "content": """**Issue Type:** Flooding
**Severity:** Moderate
**Location:** RT Lim Boulevard, Zamboanga City

Moderate flooding reported near RT Lim Boulevard coastal area during high tide. Water reaches approximately 1 foot deep. Pedestrians and small vehicles should exercise caution when passing through the area.""",
        "category": "reports",
        "tags": '["flooding", "moderate", "coastal"]',
        "is_urgent": False,
    },
    {
        "title": "Road Damage at Camino Nuevo",
        "content": """**Issue Type:** Road Damage
**Severity:** Low
**Location:** Camino Nuevo, Zamboanga City

Minor road damage observed on Camino Nuevo near the residential areas. Several small potholes need repair to prevent further deterioration. Not currently hazardous but should be addressed soon.""",
        "category": "reports",
        "tags": '["road-damage", "low", "maintenance"]',
        "is_urgent": False,
    },
    {
        "title": "Flash Flood Warning - Tetuan Area",
        "content": """**Issue Type:** Weather Hazard
**Severity:** Severe
**Location:** Tetuan, Zamboanga City

Flash flood warning issued for Tetuan area due to continuous heavy rainfall upstream. Low-lying areas may experience rapid flooding within the next 2-3 hours. Residents are advised to move to higher ground and avoid traveling unless necessary.""",
        "category": "reports",
        "tags": '["flash-flood", "severe", "weather-warning"]',
        "is_urgent": True,
    },
]

print("Creating sample report posts...")
created_count = 0

for i, report_data in enumerate(sample_reports):
    # Create posts with staggered dates over the past week
    days_ago = i % 7
    created_at = datetime.utcnow() - timedelta(days=days_ago, hours=random.randint(0, 23))
    
    new_post = Post(
        title=report_data["title"],
        content=report_data["content"],
        author_id=maria.id,
        author_name=maria.name,
        category=report_data["category"],
        tags=report_data["tags"],
        is_urgent=report_data["is_urgent"],
        is_approved=True,  # Auto-approve for demo
        likes_count=random.randint(5, 50),
        replies_count=random.randint(0, 15),
        created_at=created_at,
        updated_at=created_at,
    )
    
    db.add(new_post)
    created_count += 1

db.commit()

# Update Maria's reports_submitted counter to match
maria.reports_submitted = created_count
db.commit()

print(f"✅ Created {created_count} sample report posts")
print(f"✅ Updated Maria Santos' report counter to {created_count}")
print("\nThese reports should now appear on the map!")

db.close()
