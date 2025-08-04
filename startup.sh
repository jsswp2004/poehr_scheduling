#!/bin/bash

# Startup script for POEHR Scheduling Cloud Run deployment
echo "🚀 Starting POEHR Scheduling application..."

# Check if we're in Cloud Run (has K_SERVICE environment variable)
if [ -n "$K_SERVICE" ]; then
    echo "📡 Running in Cloud Run environment"
    
    # Try to collect static files at runtime if not done during build
    echo "📁 Collecting static files..."
    python manage.py collectstatic --noinput --settings=poehr_scheduling_backend.settings_production || {
        echo "⚠️  Static files collection failed, but continuing..."
    }
    
    # Run database migrations
    echo "🗄️  Running database migrations..."
    python manage.py migrate --settings=poehr_scheduling_backend.settings_production || {
        echo "⚠️  Database migrations failed, but continuing..."
    }
    
    # Run comprehensive database fix
    echo "🔧 [CLOUDRUN] BEGIN comprehensive_db_fix.py..."
    python comprehensive_db_fix.py || {
        echo "⚠️  Comprehensive database fix failed, but continuing..."
    }
    echo "🔧 [CLOUDRUN] END comprehensive_db_fix.py."
    
    # Create appointments table
    echo "🔧 [CLOUDRUN] BEGIN create_appointments_table.py..."
    python create_appointments_table.py || {
        echo "⚠️  Appointments table creation failed, but continuing..."
    }
    echo "🔧 [CLOUDRUN] END create_appointments_table.py."
    
    # Debug API issue
    echo "🔍 [CLOUDRUN] BEGIN debug_api_issue.py..."
    python debug_api_issue.py || {
        echo "⚠️  API debug failed, but continuing..."
    }
    echo "🔍 [CLOUDRUN] END debug_api_issue.py."
    
    # Fix ClinicEvent table if needed
    echo "🔧 Checking ClinicEvent table..."
    python fix_clinicevent_table.py || {
        echo "⚠️  ClinicEvent table check/fix failed, but continuing..."
    }
    
    # Fix appointment form 500 errors
    echo "🩺 Fixing appointment form endpoints..."
    python fix_appointment_500_errors.py || {
        echo "⚠️  Appointment form fix failed, but continuing..."
    }
    
    # Fix holidays table
    echo "🎄 Fixing holidays table..."
    python fix_holidays_table.py || {
        echo "⚠️  Holidays table fix failed, but continuing..."
    }
    
    # Fix environment setting table
    echo "⚙️  Fixing environment setting table..."
    python fix_environmentsetting_table.py || {
        echo "⚠️  Environment setting table fix failed, but continuing..."
    }
    
    # Fix auto email table
    echo "📧 Fixing auto email table..."
    python fix_autoemail_table.py || {
        echo "⚠️  Auto email table fix failed, but continuing..."
    }
    
    # Fix availability table
    echo "📅 Fixing availability table..."
    python fix_availability_table.py || {
        echo "⚠️  Availability table fix failed, but continuing..."
    }
    
    # Test available dates endpoint
    echo "🧪 Testing available dates endpoint..."
    python test_available_dates.py || {
        echo "⚠️  Available dates test failed, but continuing..."
    }
    
    # Fix environment page API errors
    echo "🌍 Fixing environment page endpoints..."
    python fix_environment_page_errors.py || {
        echo "⚠️  Environment page fix failed, but continuing..."
    }
    
    # Fix EnvironmentSetting table structure
    echo "🔧 Fixing EnvironmentSetting table structure..."
    python fix_environment_setting_table.py || {
        echo "⚠️  EnvironmentSetting table fix failed, but continuing..."
    }
    
    # Create cache table (if using database cache)
    echo "🔄 Creating cache table..."
    python manage.py createcachetable --settings=poehr_scheduling_backend.settings_production || {
        echo "ℹ️  Cache table creation skipped (might already exist)"
    }
    
    # Fix availability table if missing
    echo "📋 Checking availability table..."
    python fix_availability_table.py || {
        echo "⚠️  Availability table check/fix failed, trying direct creation..."
        python create_availability_table_direct.py || {
            echo "⚠️  Direct table creation failed, but continuing..."
        }
    }
    
else
    echo "🏠 Running in local development environment"
fi

# Start the application with Uvicorn ASGI server for WebSocket support
echo "🌟 Starting Uvicorn ASGI server..."
echo "📊 Environment variables:"
echo "  PORT: ${PORT}"
echo "  DJANGO_SETTINGS_MODULE: ${DJANGO_SETTINGS_MODULE}"
echo "  K_SERVICE: ${K_SERVICE}"

echo "🚀 Starting Uvicorn..."
exec uvicorn \
    --host 0.0.0.0 \
    --port ${PORT:-8080} \
    --log-level info \
    --access-log \
    poehr_scheduling_backend.asgi:application
