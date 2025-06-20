@echo off
REM Windows batch version of restore script

if "%1"=="" (
    echo ❌ Usage: restore_db.bat ^<backup_file^>
    echo 📁 Available backups:
    dir /b backups\poehr_db_backup_*.sql 2>nul || echo    No backups found
    exit /b 1
)

set "BACKUP_FILE=%1"

if not exist "%BACKUP_FILE%" (
    echo ❌ Backup file not found: %BACKUP_FILE%
    exit /b 1
)

echo 🔄 Restoring database from: %BACKUP_FILE%
echo ⚠️  This will REPLACE all existing data!
set /p confirm=Continue? (y/N): 

if /i "%confirm%"=="y" (
    echo 🗑️  Dropping existing database...
    docker-compose exec -T db psql -U jsswp2004 -d postgres -c "DROP DATABASE IF EXISTS poehr_db;"
    docker-compose exec -T db psql -U jsswp2004 -d postgres -c "CREATE DATABASE poehr_db;"
    
    echo 📥 Restoring data...
    docker-compose exec -T db psql -U jsswp2004 -d poehr_db < "%BACKUP_FILE%"
    
    if %ERRORLEVEL% equ 0 (
        echo ✅ Database restored successfully!
        echo 🔄 Restarting Django services...
        docker-compose restart web websocket
    ) else (
        echo ❌ Restore failed!
        exit /b 1
    )
) else (
    echo ❌ Restore cancelled
)
