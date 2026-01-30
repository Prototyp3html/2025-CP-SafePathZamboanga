from sqlalchemy import create_engine, text, inspect

db_url = 'postgresql://postgres:bNVbDtEspudBVqQRBntwHYvWyOEySCet@shortline.proxy.rlwy.net:41142/railway'
engine = create_engine(db_url)

inspector = inspect(engine)
columns = inspector.get_columns('flood_hotspots')

print('Columns in flood_hotspots table:')
for col in columns:
    print(f'  - {col["name"]}')

print('\n' + '='*80)
print('Top 10 Flood-Prone Roads:')
print('='*80)

with engine.connect() as conn:
    result = conn.execute(text('''
        SELECT 
            road_id,
            total_flooded_hours,
            frequency_per_year
        FROM flood_hotspots
        WHERE total_flooded_hours > 0
        ORDER BY total_flooded_hours DESC
        LIMIT 10
    ''')).fetchall()
    
    for row in result:
        print(f'{row[0]:20} | Hours: {row[1]:6.1f} | Freq: {row[2]:7.2f}/yr')
    
    print('\n' + '='*80)
    print('Summary Statistics:')
    stats = conn.execute(text('''
        SELECT 
            COUNT(*) as total_roads,
            COUNT(DISTINCT total_flooded_hours) as unique_hours,
            COUNT(DISTINCT frequency_per_year) as unique_freqs,
            MIN(total_flooded_hours) as min_hours,
            MAX(total_flooded_hours) as max_hours,
            MIN(frequency_per_year) as min_freq,
            MAX(frequency_per_year) as max_freq
        FROM flood_hotspots
        WHERE total_flooded_hours > 0
    ''')).fetchone()
    
    print(f'Total roads with flood data: {stats[0]}')
    print(f'Unique hour values: {stats[1]}')
    print(f'Unique frequency values: {stats[2]}')
    print(f'Hours range: {stats[3]:.1f} - {stats[4]:.1f}')
    print(f'Frequency range: {stats[5]:.2f} - {stats[6]:.2f} per year')
