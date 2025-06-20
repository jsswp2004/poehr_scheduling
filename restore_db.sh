#!/bin/bash
# Database restore script
# Restores database from a backup file

if [ -z "$1" ]; then
    echo "❌ Usage: ./restore_db.sh <backup_file>"
    echo "📁 Available backups:"
    ls -la ./backups/poehr_db_backup_*.sql 2>/dev/null || echo "   No backups found"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "🔄 Restoring database from: $BACKUP_FILE"
echo "⚠️  This will REPLACE all existing data!"
read -p "Continue? (y/N): " confirm

if [[ $confirm =~ ^[Yy]$ ]]; then
    # Drop and recreate the database
    echo "🗑️  Dropping existing database..."
    docker-compose exec -T db psql -U jsswp2004 -d postgres -c "DROP DATABASE IF EXISTS poehr_db;"
    docker-compose exec -T db psql -U jsswp2004 -d postgres -c "CREATE DATABASE poehr_db;"
    
    # Restore the backup
    echo "📥 Restoring data..."
    docker-compose exec -T db psql -U jsswp2004 -d poehr_db < "$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Database restored successfully!"
        echo "🔄 Restarting Django services..."
        docker-compose restart web websocket
    else
        echo "❌ Restore failed!"
        exit 1
    fi
else
    echo "❌ Restore cancelled"
fi
