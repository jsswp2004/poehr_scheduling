#!/bin/bash

# Azure Container Apps startup script for POEHR Scheduling
echo "🚀 Starting POEHR Scheduling application on Azure..."

# Create startup status file immediately
echo "Script started at: $(date)" > /code/static/frontend/startup-status.txt
echo "Working directory: $(pwd)" >> /code/static/frontend/startup-status.txt
echo "User: $(whoami)" >> /code/static/frontend/startup-status.txt

# Check if we're in Azure Container Apps (has CONTAINER_APP_NAME environment variable)
if [ -n "$CONTAINER_APP_NAME" ]; then
    echo "☁️  Running in Azure Container Apps environment"
    
    # Try to collect static files at runtime if not done during build
    echo "📁 Collecting static files..."
    python manage.py collectstatic --noinput --settings=$DJANGO_SETTINGS_MODULE || {
        echo "⚠️  Static files collection failed, but continuing..."
    }
    
    # Run database migrations (critical - must complete)
    echo "🗄️  Running database migrations..."
    python manage.py migrate --settings=$DJANGO_SETTINGS_MODULE || {
        echo "⚠️  Database migrations failed, but continuing..."
    }
    
    # Create admin user if it doesn't exist (for login functionality)
    echo "👤 Creating admin user if needed..."
    python -c "
import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', '$DJANGO_SETTINGS_MODULE')
django.setup()

try:
    from users.models import CustomUser, Organization
    from django.contrib.auth.hashers import make_password
    
    # Check if admin user exists
    if not CustomUser.objects.filter(username='jsswp2004').exists():
        print('Creating admin user...')
        
        # Get or create organization
        org, created = Organization.objects.get_or_create(
            name='POWER Health Systems',
            defaults={
                'organization_type': 'clinic',
                'address': 'Admin Office',
                'phone_number': '+1234567890',
                'subscription_tier': 'enterprise'
            }
        )
        
        # Create admin user
        admin_user = CustomUser.objects.create(
            username='jsswp2004',
            email='jsswp2004@powerhealth.com',
            password=make_password('krat25Miko!'),
            is_staff=True,
            is_active=True,
            is_superuser=True,
            first_name='System',
            last_name='Administrator',
            role='system_admin',
            organization=org,
            phone_number='+1234567890'
        )
        print(f'✅ Admin user created: {admin_user.username}')
    else:
        print('✅ Admin user already exists')
        
except Exception as e:
    print(f'⚠️  Admin user creation failed: {e}')
" || {
        echo "⚠️  Admin user creation failed, but continuing..."
    }
    
    # Only run essential fixes for startup, defer others to background
    echo "🔧 Running essential database fixes..."
    
    # Background all non-critical fixes to avoid startup timeout
    {
        echo "🔧 [BACKGROUND] Running comprehensive database fix..."
        python comprehensive_db_fix.py
        
        echo "🔧 [BACKGROUND] Creating appointments table..."
        python create_appointments_table.py
        
        echo "🔍 [BACKGROUND] Running API debug..."
        python debug_api_issue.py
        
        echo "🔧 [BACKGROUND] Checking ClinicEvent table..."
        python fix_clinicevent_table.py
        
        echo "🩺 [BACKGROUND] Fixing appointment form endpoints..."
        python fix_appointment_500_errors.py
        
        echo "🎄 [BACKGROUND] Fixing holidays table..."
        python fix_holidays_table.py
        
        echo "⚙️  [BACKGROUND] Fixing environment setting table..."
        python fix_environmentsetting_table.py
        
        echo "📧 [BACKGROUND] Fixing auto email table..."
        python fix_autoemail_table.py
        
        echo "📅 [BACKGROUND] Fixing availability table..."
        python fix_availability_table.py
        
        echo "🧪 [BACKGROUND] Testing available dates endpoint..."
        python test_available_dates.py
        
        echo "🌍 [BACKGROUND] Fixing environment page endpoints..."
        python fix_environment_page_errors.py
        
        echo "🔧 [BACKGROUND] Fixing EnvironmentSetting table structure..."
        python fix_environment_setting_table.py
        
        echo "🔄 [BACKGROUND] Creating cache table..."
        python manage.py createcachetable --settings=poehr_scheduling_backend.settings_azure
        
        echo "📋 [BACKGROUND] Checking availability table..."
        python fix_availability_table.py || python create_availability_table_direct.py
        
        echo "✅ [BACKGROUND] All background fixes completed"
    } &
    
    echo "⚡ Background fixes started, proceeding with server startup..."
    
else
    echo "🏠 Running in local development environment"
fi

# Start the application with Uvicorn ASGI server for WebSocket support
echo "🌟 Starting Uvicorn ASGI server..."
echo "📊 Environment variables:"
echo "  PORT: ${PORT}"
echo "  DJANGO_SETTINGS_MODULE: ${DJANGO_SETTINGS_MODULE}"
echo "  CONTAINER_APP_NAME: ${CONTAINER_APP_NAME}"
echo "  AZURE_KEYVAULT_NAME: ${AZURE_KEYVAULT_NAME}"

# Test Azure Key Vault connectivity
echo "🔐 Testing Azure Key Vault connectivity..."
python -c "
try:
    from poehr_scheduling_backend.utils.azure_secrets import test_azure_secrets
    if test_azure_secrets():
        print('✅ Azure Key Vault connection successful')
    else:
        print('⚠️  Azure Key Vault connection failed, using environment variables')
except Exception as e:
    print(f'⚠️  Azure Key Vault test failed: {e}')
    print('   Will use environment variables as fallback')
"

# Test if we can import the ASGI application
echo "🧪 Testing ASGI application import..."
python -c "
try:
    from poehr_scheduling_backend.asgi import application
    print('✅ ASGI application imported successfully')
    
    # Test if it's a ProtocolTypeRouter
    from channels.routing import ProtocolTypeRouter
    if isinstance(application, ProtocolTypeRouter):
        print('✅ ProtocolTypeRouter detected - WebSocket support enabled')
        protocols = list(application.application_mapping.keys())
        print(f'   Supported protocols: {protocols}')
    else:
        print('⚠️  Basic ASGI application - WebSocket support may be limited')
        print(f'   Type: {type(application)}')
        
except ImportError as e:
    print(f'❌ Import error: {e}')
    print('🔍 Running dependency verification...')
    exec(open('verify_azure_deps.py').read())
    exit(1)
except Exception as e:
    print(f'❌ ASGI import failed: {e}')
    import traceback
    traceback.print_exc()
    exit(1)
" || {
    echo "❌ ASGI application import failed, exiting..."
    exit 1
}

echo "🚀 Starting Uvicorn..."

# Create a simple health status file
echo "Django startup attempted at: $(date)" > /code/static/frontend/django-status.txt
echo "Environment: $DJANGO_SETTINGS_MODULE" >> /code/static/frontend/django-status.txt
echo "Python version: $(python --version)" >> /code/static/frontend/django-status.txt

exec uvicorn \
    --host 0.0.0.0 \
    --port ${PORT:-8080} \
    --log-level info \
    --access-log \
    poehr_scheduling_backend.asgi:application
