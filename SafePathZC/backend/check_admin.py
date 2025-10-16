from models import SessionLocal, AdminUser

db = SessionLocal()

# Check for admin user in admin_users table
admin = db.query(AdminUser).filter(AdminUser.email == 'admin@safepath.com').first()
print('Admin exists in admin_users table:', admin is not None)
if admin:
    print('  Name:', admin.name)
    print('  Email:', admin.email)
    print('  Active:', admin.is_active)
    print('  Role:', admin.role)

# Count all admin users
total_admins = db.query(AdminUser).count()
print(f'\nTotal admins in database: {total_admins}')

db.close()
