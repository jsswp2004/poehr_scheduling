from .settings import *
import os

# Migration-specific settings with fallbacks
DEBUG = False
ALLOWED_HOSTS = ['*']

# Get project ID from environment
project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'poehr-364520')

# Simple database configuration for migrations
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'poehr_db',
        'USER': 'jsswp2004',
        'PASSWORD': 'krat25Miko!',  # Use the password directly for migrations
        'HOST': f'/cloudsql/{project_id}:us-central1:poehr-db-instance',
        'PORT': '5432',
    }
}

# Minimal settings for migration
SECRET_KEY = 'migration-temporary-key-12345'

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
