# Temporary Azure production settings without Redis (for debugging)
import os
from .settings import *

# Security
DEBUG = False
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'fallback-key-change-in-production')
ALLOWED_HOSTS = [
    'poehr-scheduling.azurecontainerapps.io',
    'poehr-scheduling.kindforest-7b8bffcf.centralus.azurecontainerapps.io',
    'poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io',
    'localhost',
    '127.0.0.1',
    '*',  # Allow all hosts for now to avoid this issue
]

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'poehr_db'),
        'USER': os.environ.get('DB_USER', 'poehr_admin'),  # Simple username works
        'PASSWORD': os.environ.get('DB_PASSWORD', 'krat25Miko!'),
        'HOST': os.environ.get('DB_HOST', 'poehr-scheduling-postgres.postgres.database.azure.com'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {
            'sslmode': 'require',
        },
    }
}

# Use local memory cache instead of Redis for now
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
    }
}

# Disable channels (websockets) for now since it also requires Redis
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    }
}

# Email configuration
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@powerhealth.com')

# Static files
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Media files
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# CORS settings
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# CSRF settings
CSRF_TRUSTED_ORIGINS = [
    'https://poehr-scheduling.azurecontainerapps.io',
    'https://poehr-scheduling.kindforest-7b8bffcf.centralus.azurecontainerapps.io',
    'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
]
