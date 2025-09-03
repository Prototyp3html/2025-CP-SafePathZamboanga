# SafePathZC Backend - Dynamic Routes System

A FastAPI backend service for managing route history, favorites, and search data with PostgreSQL database integration.

## 🚀 Features

- **Route History Management**: Track completed, interrupted, and cancelled routes
- **Favorite Routes**: Save frequently used routes with risk assessment
- **Search History**: Store and manage route search queries
- **Analytics**: Route completion rates and usage statistics
- **RESTful API**: Full CRUD operations with pagination and filtering
- **Real-time Data**: FastAPI with hot reload for development

## 🛠️ Technology Stack

- **Backend**: FastAPI + SQLAlchemy ORM
- **Database**: PostgreSQL
- **Authentication**: Basic user management (expandable)
- **API Documentation**: Automatic OpenAPI/Swagger docs

## 📋 Prerequisites

- Python 3.8+
- PostgreSQL 12+
- Virtual environment (recommended)

## 🔧 Setup Instructions

### 1. Database Setup

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Run the setup script
\i database_setup.sql

# Or manually create:
CREATE DATABASE safepathzc;
CREATE USER safepathzc_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE safepathzc TO safepathzc_user;
```

### 2. Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
DATABASE_URL=postgresql://safepathzc_user:your_secure_password@localhost:5432/safepathzc
```

### 3. Install Dependencies

```bash
# Make sure you're in the backend directory
cd backend

# Install packages (virtual environment should already be configured)
pip install -r requirements.txt
```

### 4. Seed Database (Optional)

```bash
# Run the database seeder for sample data
python seed_database.py
```

### 5. Start the Server

```bash
# Start FastAPI development server
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## 📚 API Endpoints

### Route History

- `GET /api/routes/history` - Get route history with pagination
- `POST /api/routes/history` - Create new route entry
- `DELETE /api/routes/history/{id}` - Delete route entry

### Favorite Routes

- `GET /api/routes/favorites` - Get favorite routes
- `POST /api/routes/favorites` - Add new favorite
- `PUT /api/routes/favorites/{id}` - Update favorite
- `DELETE /api/routes/favorites/{id}` - Remove favorite

### Search History

- `GET /api/search/history` - Get search history
- `POST /api/search/history` - Add search entry
- `DELETE /api/search/history` - Clear all searches

### Analytics

- `GET /api/analytics/routes-summary` - Get route statistics

### Documentation

- `GET /docs` - Interactive API documentation (Swagger UI)
- `GET /redoc` - Alternative API documentation

## 🗄️ Database Schema

### route_history

```sql
- id (Primary Key)
- from_location, to_location
- from_lat, from_lng, to_lat, to_lng
- date, duration, distance
- status (completed/interrupted/cancelled)
- weather_condition, route_type
- user_id
```

### favorite_routes

```sql
- id (Primary Key)
- name, from_location, to_location
- from_lat, from_lng, to_lat, to_lng
- frequency, avg_duration, last_used
- risk_level (low/moderate/high)
- user_id
```

### search_history

```sql
- id (Primary Key)
- query, timestamp, results_count
- user_id
```

## 🔄 Integration with Frontend

The frontend React application connects to this API at `http://localhost:8000/api`.

Key integration points:

- Real-time route data loading
- CRUD operations for all route types
- Search functionality with history
- Analytics dashboard data

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL service status
sudo systemctl status postgresql

# Test database connection
psql -U safepathzc_user -d safepathzc -h localhost
```

### Port Already in Use

```bash
# Find process using port 8000
netstat -an | findstr :8000

# Kill process (Windows)
taskkill /F /PID <process_id>
```

### CORS Issues

The API is configured to allow requests from:

- `http://localhost:3000` (Create React App)
- `http://localhost:5173` (Vite)
- `http://127.0.0.1:5173`

## 📈 Performance Considerations

- Database indexes on frequently queried columns
- Pagination for large datasets
- Connection pooling for concurrent requests
- Async operations for better performance

## 🔒 Security Features

- Input validation with Pydantic models
- SQL injection prevention through SQLAlchemy ORM
- CORS configuration for allowed origins
- Environment variable configuration

## 🚀 Deployment Ready

- Environment-based configuration
- Database migration support with Alembic
- Production-ready error handling
- Structured logging support

## 📝 Sample Data

The seeder creates:

- 5 sample route history entries
- 4 favorite routes with different risk levels
- 5 recent search queries

Perfect for testing the dynamic MyRoutes interface!

---

**API Status**: 🟢 Running on http://localhost:8000
**Health Check**: 🟢 GET http://localhost:8000/
**Documentation**: 📖 http://localhost:8000/docs
