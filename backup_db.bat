@echo off
REM Windows batch version of backup script

echo Creating database backup...

REM Create backups directory if it doesn't exist
if not exist "backups" mkdir backups

REM Generate timestamp for backup filename
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%"
set "MM=%dt:~4,2%"
set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%"
set "MIN=%dt:~10,2%"
set "SS=%dt:~12,2%"
set "TIMESTAMP=%YYYY%%MM%%DD%_%HH%%MIN%%SS%"

set "BACKUP_FILE=backups\poehr_db_backup_%TIMESTAMP%.sql"

REM Create the backup
docker-compose exec -T db pg_dump -U jsswp2004 -d poehr_db > "%BACKUP_FILE%"

if %ERRORLEVEL% equ 0 (
    echo ✅ Database backup created: %BACKUP_FILE%
    echo 📁 You can now commit this backup to Git or copy it to other PCs
) else (
    echo ❌ Backup failed!
    exit /b 1
)
