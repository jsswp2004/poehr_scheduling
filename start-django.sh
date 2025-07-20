#!/bin/bash
set -e

echo "🔄 Starting Django initialization..."

# Wait a bit for the database to be ready (since we don't have nc in the container)
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run migrations
echo "📊 Running database migrations..."
python manage.py makemigrations --noinput || echo "No new migrations to make"
python manage.py migrate --noinput || echo "Migration failed, continuing anyway"

# Create superuser if it doesn't exist
echo "👤 Creating superuser if needed..."
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from django.db import transaction

try:
    with transaction.atomic():
        # Create or get organization
        org, created = Organization.objects.get_or_create(
            name='POWER IT',
            defaults={
                'subscription_tier': 'enterprise',
                'is_active': True
            }
        )
        
        # Create superuser if it doesn't exist
        if not CustomUser.objects.filter(username='jsswp2004').exists():
            user = CustomUser.objects.create_user(
                username='jsswp2004',
                email='jsswp2004@powerit.com',
                password='krat25Miko!',
                first_name='JSS',
                last_name='System Admin',
                role='system_admin',
                organization=org,
                organization_type='group',
                registered=True,
                is_staff=True,
                is_superuser=True,
                is_active=True
            )
            print('✅ Created superuser: jsswp2004')
        else:
            print('👤 Superuser jsswp2004 already exists')
except Exception as e:
    print(f'⚠️  Error creating superuser: {e}')
"

# Collect static files
echo "📁 Collecting static files..."
python manage.py collectstatic --noinput --clear || echo "Static file collection failed, continuing anyway"

# Start Django
echo "🚀 Starting Django server..."
python manage.py runserver 0.0.0.0:8000 --insecure
