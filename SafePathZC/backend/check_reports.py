from models import SessionLocal, Report

db = SessionLocal()

# Get all reports
all_reports = db.query(Report).all()
print(f'Total reports in database: {len(all_reports)}')

if all_reports:
    print('\nReports:')
    for report in all_reports:
        print(f'  ID: {report.id}')
        print(f'  Title: {report.title}')
        print(f'  Category: {report.category}')
        print(f'  Reporter: {report.reporter_name} ({report.reporter_email})')
        print(f'  Status: {report.status}')
        print(f'  Is Visible: {report.is_visible}')
        print(f'  Location: {report.location_address}')
        print(f'  Created: {report.created_at}')
        print('  ---')

# Get visible reports only
visible_reports = db.query(Report).filter(Report.is_visible == True).all()
print(f'\nVisible reports (should appear on map): {len(visible_reports)}')

db.close()
