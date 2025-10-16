from models import SessionLocal, Post

db = SessionLocal()

# Get all posts
all_posts = db.query(Post).all()
print(f'Total posts in database: {len(all_posts)}')

if all_posts:
    print('\nPosts:')
    for post in all_posts:
        print(f'  ID: {post.id}')
        print(f'  Title: {post.title}')
        print(f'  Category: {post.category}')
        print(f'  Author: {post.author_name} (ID: {post.author_id})')
        print(f'  Approved: {post.is_approved}')
        print(f'  Urgent: {post.is_urgent}')
        print('  ---')

# Get report posts specifically
report_posts = db.query(Post).filter(Post.category == 'reports').all()
print(f'\nReport posts (category="reports"): {len(report_posts)}')

# Get approved report posts
approved_report_posts = db.query(Post).filter(
    Post.category == 'reports',
    Post.is_approved == True
).all()
print(f'Approved report posts: {len(approved_report_posts)}')

db.close()
