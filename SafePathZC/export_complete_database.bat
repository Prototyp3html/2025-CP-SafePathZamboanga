@echo off
echo 🗃️ SAFEPATH DATABASE COMPLETE EXPORT
echo =====================================
echo.

REM Set variables
set DB_NAME=safepathzc
set DB_USER=safepathzc_user
set DB_HOST=localhost
set DB_PORT=5432
set BACKUP_FILE=safepathzc_complete_backup_%DATE:~-4,4%%DATE:~-10,2%%DATE:~-7,2%.dump

echo 📤 Exporting complete database...
echo Database: %DB_NAME%
echo User: %DB_USER%
echo Output: %BACKUP_FILE%
echo.

REM Create backup directory if it doesn't exist
if not exist "database_backups" mkdir database_backups

REM Export complete database with all data and structure
echo Running pg_dump...
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" ^
    --host=%DB_HOST% ^
    --port=%DB_PORT% ^
    --username=%DB_USER% ^
    --format=custom ^
    --compress=9 ^
    --verbose ^
    --file="database_backups\%BACKUP_FILE%" ^
    %DB_NAME%

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ DATABASE EXPORT SUCCESSFUL!
    echo 📁 File saved: database_backups\%BACKUP_FILE%
    echo.
    echo 📊 Backup Information:
    dir "database_backups\%BACKUP_FILE%"
    echo.
    echo 📤 Send this file to your classmate:
    echo    database_backups\%BACKUP_FILE%
    echo.
    echo 💡 Your classmate should run: import_complete_database.bat
) else (
    echo.
    echo ❌ DATABASE EXPORT FAILED!
    echo Check your PostgreSQL installation and credentials.
)

echo.
pause