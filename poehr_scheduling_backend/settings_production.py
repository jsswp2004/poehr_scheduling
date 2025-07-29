from .settings import *
import os
from .utils.secrets import get_secret

# Production settings
DEBUG = False

# Get the current Cloud Run service URL from environment
SERVICE_URL = os.environ.get('K_SERVICE_NAME', '')
CLOUD_RUN_REGION = os.environ.get('K_CONFIGURATION', '').split('-')[-1] if os.environ.get('K_CONFIGURATION') else 'us-central1'

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    'poehr-scheduling-mjf5efdj3a-uc.a.run.app',  # Current specific Cloud Run URL
    'poehr-scheduling-750584621883.us-central1.run.app',  # Alternative URL format
    '*.us-central1.run.app',  # Wildcard for us-central1 run.app domains
    '.run.app',  # Wildcard for all run.app domains
]

# Add any environment-specified hosts
env_hosts = os.environ.get('DJANGO_ALLOWED_HOSTS', '')
if env_hosts:
    ALLOWED_HOSTS.extend(env_hosts.split(','))

# Templates for serving React frontend
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'static', 'frontend')],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Get project ID from environment or use default
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'poehr-364520')

# Security settings - SECRET_KEY with proper fallback
SECRET_KEY = get_secret('DJANGO_SECRET_KEY', default=os.environ.get('DJANGO_SECRET_KEY', 'temporary-fallback-key-for-build-only'))
if SECRET_KEY == 'temporary-fallback-key-for-build-only' and not os.environ.get('K_SERVICE'):
    # We're in local development
    SECRET_KEY = 'dev-secret-key-change-in-production'
elif SECRET_KEY == 'temporary-fallback-key-for-build-only':
    # We're in production but couldn't get secret - this is critical
    import sys
    print("CRITICAL ERROR: Could not retrieve DJANGO_SECRET_KEY from Secret Manager")
    sys.exit(1)

# Database configuration for Cloud SQL
# Temporarily use hardcoded password for testing
db_password = "krat25Miko!" if os.environ.get('K_SERVICE') else get_secret('DATABASE_PASSWORD', default='')
print(f"DEBUG: Using password for database connection (length: {len(db_password)})")

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'poehr_db'),
        'USER': os.environ.get('DB_USER', 'jsswp2004'),
        'PASSWORD': db_password,
        'HOST': f"/cloudsql/{PROJECT_ID}:us-central1:poehr-db-instance" if os.environ.get('K_SERVICE') else os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

# Redis configuration for Memorystore
REDIS_HOST = get_secret('REDIS_HOST', default=os.environ.get('REDIS_HOST', 'localhost'))

# Security settings (SECRET_KEY already defined above)
# Only enforce HTTPS in actual Cloud Run environment
if os.environ.get('K_SERVICE'):
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

# CSRF settings for Cloud Run
CSRF_TRUSTED_ORIGINS = [
    'https://*.run.app',
    'https://poehr-scheduling-750584621883.us-central1.run.app',
]

# Static files configuration
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Include the frontend build directory in static files
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'static', 'frontend', 'static'),  # React build static files
]

# Make sure Django can find the React build files
if os.path.exists(os.path.join(BASE_DIR, 'static')):
    STATICFILES_DIRS.append(os.path.join(BASE_DIR, 'static'))

# Media files configuration
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Email configuration
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False  # Explicitly disable SSL since we're using TLS
EMAIL_HOST_USER = get_secret('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = get_secret('EMAIL_HOST_PASSWORD', default='')
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

# Twilio configuration
TWILIO_ACCOUNT_SID = get_secret('TWILIO_ACCOUNT_SID', default='')
TWILIO_AUTH_TOKEN = get_secret('TWILIO_AUTH_TOKEN', default='')
TWILIO_PHONE_NUMBER = get_secret('TWILIO_PHONE_NUMBER', default='')

# Stripe configuration
STRIPE_SECRET_KEY = get_secret('STRIPE_SECRET_KEY', default='')
STRIPE_PUBLISHABLE_KEY = get_secret('STRIPE_PUBLISHABLE_KEY', default='')
STRIPE_WEBHOOK_SECRET = get_secret('STRIPE_WEBHOOK_SECRET', default='')

# Stripe Price IDs
STRIPE_BASIC_PRICE_ID = get_secret('STRIPE_BASIC_PRICE_ID', default='')
STRIPE_PREMIUM_PRICE_ID = get_secret('STRIPE_PREMIUM_PRICE_ID', default='')
STRIPE_ENTERPRISE_PRICE_ID = get_secret('STRIPE_ENTERPRISE_PRICE_ID', default='')

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': os.environ.get('DJANGO_LOG_LEVEL', 'INFO'),
            'propagate': False,
        },
        'poehr_scheduling_backend': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Channel layers for WebSocket (using Redis)
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [(REDIS_HOST, 6379)],
        },
    },
}

# Celery Configuration (if you're using it)
CELERY_BROKER_URL = f'redis://{REDIS_HOST}:6379/0'
CELERY_RESULT_BACKEND = f'redis://{REDIS_HOST}:6379/0'

# CORS settings (if needed for API access)
if 'corsheaders' in INSTALLED_APPS:
    CORS_ALLOWED_ORIGINS = [
        "https://poehr-scheduling-750584621883.us-central1.run.app",
    ] + [f"https://{host}" for host in ALLOWED_HOSTS if host not in ['localhost', '127.0.0.1']]

# Add a startup message to help with debugging
import logging
logger = logging.getLogger(__name__)
logger.info(f"Settings loaded. Running in {'Cloud Run' if os.environ.get('K_SERVICE') else 'Local'} environment")

# For connecting to Cloud SQL instance directly (uncomment to use)
# gcloud sql connect poehr-db-instance --user=jsswp2004 --database=poehr_db