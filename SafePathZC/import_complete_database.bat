@echo off
echo 🗃️ SAFEPATH DATABASE COMPLETE IMPORT
echo =====================================
echo.

REM Set variables
set DB_NAME=safepathzc
set DB_USER=safepathzc_user
set DB_HOST=localhost
set DB_PORT=5432

echo 📥 Importing complete database from backup...
echo Database: %DB_NAME%
echo User: %DB_USER%
echo.

REM Find the most recent backup file
echo 🔍 Looking for backup files...
if not exist "database_backups\*.dump" (
    echo ❌ No backup files found in database_backups\
    echo Please copy the .dump file to database_backups\ folder
    echo.
    pause
    exit /b 1
)

REM List available backup files
echo Available backup files:
dir "database_backups\*.dump" /b
echo.

REM Use the most recent file (you can modify this to specify exact file)
for /f "delims=" %%i in ('dir "database_backups\*.dump" /b /o-d') do (
    set BACKUP_FILE=%%i
    goto :found
)

:found
echo 📁 Using backup file: %BACKUP_FILE%
echo.

REM Warning about overwriting existing data
echo ⚠️  WARNING: This will REPLACE your current database!
echo All existing data will be lost.
echo.
set /p CONFIRM="Type 'YES' to confirm: "
if not "%CONFIRM%"=="YES" (
    echo Operation cancelled.
    pause
    exit /b 0
)

echo.
echo 🔄 Dropping existing database...
"C:\Program Files\PostgreSQL\17\bin\dropdb.exe" ^
    --host=%DB_HOST% ^
    --port=%DB_PORT% ^
    --username=%DB_USER% ^
    --if-exists ^
    %DB_NAME%

echo 🆕 Creating new database...
"C:\Program Files\PostgreSQL\17\bin\createdb.exe" ^
    --host=%DB_HOST% ^
    --port=%DB_PORT% ^
    --username=%DB_USER% ^
    --owner=%DB_USER% ^
    %DB_NAME%

echo 📥 Restoring data from backup...
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" ^
    --host=%DB_HOST% ^
    --port=%DB_PORT% ^
    --username=%DB_USER% ^
    --dbname=%DB_NAME% ^
    --verbose ^
    --clean ^
    --if-exists ^
    "database_backups\%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ DATABASE IMPORT SUCCESSFUL!
    echo 🎉 Your database now has all the spatial data and tables
    echo.
    echo 📊 Verifying import...
    "C:\Program Files\PostgreSQL\17\bin\psql.exe" ^
        --host=%DB_HOST% ^
        --port=%DB_PORT% ^
        --username=%DB_USER% ^
        --dbname=%DB_NAME% ^
        --command="SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='public';"
) else (
    echo.
    echo ❌ DATABASE IMPORT FAILED!
    echo Check the error messages above.
)

echo.
pause