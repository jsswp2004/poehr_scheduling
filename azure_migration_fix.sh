#!/bin/bash

# Azure Container App Migration Fix
# Run this directly in the Azure container to apply missing migrations

echo "🚀 Azure Migration Fix - Starting..."
echo "=================================="

# Set Django settings
export DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_azure

# Check if we're in the right directory
if [ ! -f "manage.py" ]; then
    echo "❌ manage.py not found. Make sure you're in the Django project root."
    exit 1
fi

echo "📋 Current directory: $(pwd)"
echo "📋 Django settings: $DJANGO_SETTINGS_MODULE"

# Test database connection
echo ""
echo "🔍 Testing database connection..."
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure')
django.setup()
from django.db import connection
try:
    with connection.cursor() as cursor:
        cursor.execute('SELECT version();')
        result = cursor.fetchone()
        print(f'✅ Database connected: {result[0][:50]}...')
except Exception as e:
    print(f'❌ Database connection failed: {e}')
    exit(1)
"

# Check migration status
echo ""
echo "🔍 Checking migration status..."
python manage.py showmigrations communicator

# Run our custom migration fix
echo ""
echo "🔧 Running migration fix script..."
python azure_migration_fix.py

# Verify the fix worked
echo ""
echo "🧪 Testing contact creation..."
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure')
django.setup()
from communicator.models import Contact
from users.models import CustomUser

try:
    # Find a user to test with
    user = CustomUser.objects.first()
    if not user:
        print('❌ No users found for testing')
        exit(1)
    
    # Try to create a test contact
    contact = Contact.objects.create(
        name='Test Contact',
        phone='555-0000',
        email='test@example.com',
        uploaded_by=user
    )
    print(f'✅ Test contact created successfully: {contact.id}')
    
    # Clean up test contact
    contact.delete()
    print('✅ Test contact cleaned up')
    
except Exception as e:
    print(f'❌ Contact creation test failed: {e}')
    exit(1)
"

echo ""
echo "✅ Migration fix completed!"
echo "🔄 You may need to restart the container app for changes to take effect."
