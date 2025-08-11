#!/bin/bash

# Startup script for POEHR Scheduling deployment
echo "🚀 Starting POEHR Scheduling application..."

# Set default Django settings if not specified
export DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-"poehr_scheduling_backend.settings_production"}
echo "📋 Using Django settings: $DJANGO_SETTINGS_MODULE"

# Check if we're in Cloud Run (has K_SERVICE environment variable)
if [ -n "$K_SERVICE" ]; then
    echo "📡 Running in Cloud Run environment"
    
    # Try to collect static files at runtime if not done during build
    echo "📁 Collecting static files..."
    python manage.py collectstatic --noinput || {
        echo "⚠️  Static files collection failed, but continuing..."
    }
    
    # Run database migrations (critical - must complete)
    echo "🗄️  Running database migrations..."
    python manage.py migrate || {
        echo "⚠️  Database migrations failed, but continuing..."
    }
    
    # Only run essential fixes for startup, defer others to background
    echo "🔧 Running essential database fixes..."
    
    # Background all non-critical fixes to avoid startup timeout
    {
        echo "🔧 [BACKGROUND] Running comprehensive database fix..."
        python comprehensive_db_fix.py
        
        echo "🔧 [BACKGROUND] Creating appointments table..."
        python create_appointments_table.py
        
        echo "� [BACKGROUND] Running API debug..."
        python debug_api_issue.py
        
        echo "� [BACKGROUND] Checking ClinicEvent table..."
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
        python manage.py createcachetable
        
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
echo "  K_SERVICE: ${K_SERVICE}"

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
    exec(open('verify_websocket_deps.py').read())
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
exec uvicorn \
    --host 0.0.0.0 \
    --port ${PORT:-8080} \
    --log-level info \
    --access-log \
    poehr_scheduling_backend.asgi:application
