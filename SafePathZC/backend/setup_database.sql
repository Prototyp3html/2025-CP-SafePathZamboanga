-- PostgreSQL Database Setup for SafePathZC
-- Run this with the postgres superuser

-- Create database
CREATE DATABASE safepathzc;

-- Create user
CREATE USER safepathzc_user WITH PASSWORD 'safepath123';

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON DATABASE safepathzc TO safepathzc_user;

-- Connect to safepathzc database and grant schema privileges
\c safepathzc;

-- Grant privileges on the public schema
GRANT ALL ON SCHEMA public TO safepathzc_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO safepathzc_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO safepathzc_user;

-- Grant default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO safepathzc_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO safepathzc_user;

-- Display success message
\echo 'Database safepathzc created successfully!'
\echo 'User safepathzc_user created with password: safepath123'
\echo 'You can now run your FastAPI server!'
