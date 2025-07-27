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
    
    # Create cache table (if using database cache)
    echo "🔄 Creating cache table..."
    python manage.py createcachetable --settings=poehr_scheduling_backend.settings_production || {
        echo "ℹ️  Cache table creation skipped (might already exist)"
    }
    
else
    echo "🏠 Running in local development environment"
fi

# Start the application
echo "🌟 Starting gunicorn server..."
exec gunicorn \
    --bind :${PORT:-8080} \
    --workers 1 \
    --threads 8 \
    --timeout 0 \
    --preload \
    --access-logfile - \
    --error-logfile - \
    --log-level info \
    poehr_scheduling_backend.wsgi:application
