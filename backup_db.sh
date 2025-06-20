#!/bin/bash
# Database backup script
# Creates a SQL dump of your database

echo "🔄 Creating database backup..."

# Create backups directory if it doesn't exist
mkdir -p ./backups

# Generate timestamp for backup filename
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="./backups/poehr_db_backup_${TIMESTAMP}.sql"

# Create the backup
docker-compose exec -T db pg_dump -U jsswp2004 -d poehr_db > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
    echo "✅ Database backup created: ${BACKUP_FILE}"
    echo "📁 Backup size: $(du -h "${BACKUP_FILE}" | cut -f1)"
    
    # Keep only the 5 most recent backups
    ls -t ./backups/poehr_db_backup_*.sql | tail -n +6 | xargs -r rm
    echo "🧹 Cleaned up old backups (keeping 5 most recent)"
else
    echo "❌ Backup failed!"
    exit 1
fi
