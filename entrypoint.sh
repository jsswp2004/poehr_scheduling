#!/bin/bash

# Wait for database to be ready
echo "Waiting for database..."
while ! nc -z db 5432; do
  sleep 0.1
done
echo "Database started"

# Run migrations
echo "Running database migrations..."
python manage.py migrate --fake-initial --noinput

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

# Start the application
echo "Starting Daphne server..."
exec "$@"
