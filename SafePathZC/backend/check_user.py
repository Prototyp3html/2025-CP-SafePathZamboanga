from models import SessionLocal, User

db = SessionLocal()

# Check for admin user
admin = db.query(User).filter(User.email == 'admin@safepath.com').first()
print('Admin exists:', admin is not None)
if admin:
    print('  Name:', admin.name)
    print('  Email:', admin.email)
    print('  Active:', admin.is_active)
    print('  Role:', admin.role)

# Check for demo user
demo = db.query(User).filter(User.email == 'maria.santos@email.com').first()
print('\nDemo user exists:', demo is not None)
if demo:
    print('  Name:', demo.name)
    print('  Email:', demo.email)
    print('  Active:', demo.is_active)
    print('  Role:', demo.role)

# Count all users
total_users = db.query(User).count()
print(f'\nTotal users in database: {total_users}')

db.close()
