"""
Ultra-minimal Django settings for database migrations only
"""

import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost').split(',')

# Application definition - only essential Django apps for migrations
INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'appointments',
    'users',
    'chat',
    'notifications',
    'enrollment',
]

# Database - using Cloud SQL via Unix socket
project_id = os.environ.get('GOOGLE_CLOUD_PROJECT')
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

# Minimal middleware
MIDDLEWARE = []

ROOT_URLCONF = 'poehr_scheduling_backend.urls'

# No templates needed for migrations
TEMPLATES = []

# Time zone
TIME_ZONE = 'UTC'
USE_TZ = True

# Static files (not needed for migrations)
STATIC_URL = '/static/'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Disable logging to reduce noise
LOGGING = {
    'version': 1,
    'disable_existing_loggers': True,
    'handlers': {
        'null': {
            'class': 'logging.NullHandler',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['null'],
        },
    }
}
