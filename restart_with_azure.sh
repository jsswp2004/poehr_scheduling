#!/bin/bash

echo "🔄 Stopping current containers..."
docker-compose down

echo "🔧 Starting containers with Azure database configuration..."

# Create temporary docker-compose override for Azure
cat > docker-compose.azure.yml << EOF
services:
  web:
    environment:
      - DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_azure_temp
      - DB_HOST=poehr-scheduling-postgres.postgres.database.azure.com
      - DB_USER=poehr_admin
      - DB_PASSWORD=krat25Miko!
      - DB_NAME=poehr_db
      - DB_PORT=5432
    command: python manage.py runserver 0.0.0.0:8000
  
  websocket:
    environment:
      - DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_azure_temp
      - DB_HOST=poehr-scheduling-postgres.postgres.database.azure.com
      - DB_USER=poehr_admin
      - DB_PASSWORD=krat25Miko!
      - DB_NAME=poehr_db
      - DB_PORT=5432
EOF

echo "🚀 Starting with Azure configuration..."
docker-compose -f docker-compose.yml -f docker-compose.azure.yml up -d web frontend

echo "⏳ Waiting for containers to start..."
sleep 10

echo "✅ Containers restarted with Azure database configuration!"
echo ""
echo "🌐 Your application should now be available at:"
echo "   http://localhost:3000"
echo ""
echo "🔑 Admin login credentials:"
echo "   Username: jsswp2004"
echo "   Password: krat25Miko!"
echo ""
echo "📋 To check logs:"
echo "   docker logs poehr_scheduling-web-1 -f"
