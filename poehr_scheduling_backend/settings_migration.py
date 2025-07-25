from .settings import *
import os

# Migration-specific settings with fallbacks
DEBUG = False
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost').split(',')

# Get project ID from environment
project_id = os.environ.get('GOOGLE_CLOUD_PROJECT')

# Simple database configuration for migrations
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'poehr_db'),
        'USER': os.environ.get('DB_USER', 'jsswp2004'),
        'PASSWORD': os.environ.get('DB_PASSWORD'),  # Must be set in env
        'HOST': f"/cloudsql/{project_id}:us-central1:poehr-db-instance" if project_id else os.environ.get('DB_HOST'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Minimal settings for migration
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

# Disable problematic apps during migration if needed
INSTALLED_APPS = [app for app in INSTALLED_APPS if app not in [
    # Comment out any apps that might cause issues during migration
]]

# Disable cache during migrations
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.dummy.DummyCache',
    }
}

# Email settings (minimal for migration)
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
