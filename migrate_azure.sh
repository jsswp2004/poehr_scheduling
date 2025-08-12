#!/bin/bash
# migrate_azure.sh - Run Django migrations on Azure Container App

echo "🔧 Starting Azure database migration..."

# Set the Django settings module for Azure
export DJANGO_SETTINGS_MODULE="poehr_scheduling_backend.settings_azure"

# Run migrations
echo "📋 Applying all pending migrations..."
python manage.py migrate

# Show migration status
echo ""
echo "📋 Current migration status:"
python manage.py showmigrations

echo "✅ Migration script completed!"
