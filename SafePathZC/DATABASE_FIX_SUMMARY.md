# Database Fix and User Setup - Solved!

## Problem

The error "Failed to connect to server" occurred because:

1. **Database schema was outdated** - The `users` table was missing the `emergency_contact` column (and possibly other columns)
2. **Demo users weren't initialized** - No users existed in the database for testing

## What Was Fixed

### 1. Database Schema Update

Added missing column to the `users` table:

- `emergency_contact` (VARCHAR)

All other required columns already existed:

- `location`
- `community_points`
- `routes_used`
- `reports_submitted`
- `joined_at`
- `last_activity`

### 2. Demo Users Created

Two demo accounts are now available:

**Regular User Account:**

- Email: `maria.santos@email.com`
- Password: `demo123`
- Role: user
- Features: Can use routing, submit reports, access profile

**Admin Account:**

- Email: `admin@safepath.com`
- Password: `admin123`
- Role: admin
- Features: Full admin access including user management and report moderation

## How to Use

### Option 1: Sign Up (Recommended)

1. Click "Sign up" on the login modal
2. Enter your own email and password
3. Fill in required information
4. Create your account

### Option 2: Use Demo Accounts

1. Enter one of the demo credentials above
2. Click "Sign In"
3. Start using the application

## Files Created/Modified

### New Files:

- `backend/fix_database_schema.py` - Script to update database schema
- `backend/init_users.py` - Script to initialize demo users
- `backend/check_user.py` - Utility to verify users exist
- `backend/check_admin.py` - Utility to verify admin users exist

### Scripts Can Be Reused:

If you ever need to reset or reinitialize users, you can run:

```powershell
cd c:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend
python init_users.py
```

## Why It Works on Your Groupmate's Laptop

Your groupmate likely:

1. Already ran the database migrations or manual schema updates
2. Already created the demo users
3. Has an up-to-date database schema

When sharing the project, you need to ensure:

1. Database schema is synced (use `fix_database_schema.py`)
2. Demo users are created (use `init_users.py`)
3. All environment variables are set correctly

## Next Steps

### For Your System:

1. **Refresh your browser** (F5 or Ctrl+R) to clear any cached errors
2. **Try logging in** with one of the demo accounts
3. **Or sign up** with your own account

### For Team Collaboration:

1. Share the `fix_database_schema.py` script with your team
2. Share the `init_users.py` script for easy setup
3. Document these setup steps in your project README
4. Consider using database migrations (like Alembic) for future schema changes

## Verification Commands

To check if everything is working:

```powershell
# Check database connection
cd c:\xampp\htdocs\2025-CP-SafePathZamboanga\SafePathZC\backend
python -c "from models import SessionLocal; db = SessionLocal(); print('DB OK'); db.close()"

# Check users exist
python check_user.py

# Check backend is running
Invoke-WebRequest -Uri "http://localhost:8001/" -UseBasicParsing

# Check frontend is running
Test-NetConnection -ComputerName localhost -Port 5173
```

## Troubleshooting

If you still see "Failed to connect to server":

1. Make sure the backend is running (`python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload`)
2. Check PostgreSQL is running
3. Clear browser cache (Ctrl+Shift+Delete)
4. Check browser console (F12) for specific error messages
5. Verify `.env` file exists in `frontend/` directory with `VITE_BACKEND_URL=http://localhost:8001`

## Success!

Your database is now properly configured and you have demo accounts ready to use! 🎉
