"""
Initialize demo users for testing
"""
from models import SessionLocal
from routes.user_auth import init_demo_user
from routes.admin import init_admin_user

def main():
    db = SessionLocal()
    try:
        print("Initializing demo users...")
        init_demo_user(db)
        init_admin_user(db)
        print("\n✅ All demo users created successfully!")
        print("\nAvailable accounts:")
        print("  User: maria.santos@email.com / demo123")
        print("  Admin: admin@safepath.com / admin123")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    main()
