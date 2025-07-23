from .settings import *
import os
from google.cloud import secretmanager

# Production settings
DEBUG = False
ALLOWED_HOSTS = ['*']  # Configure with your actual domain later

# Secret Manager client
try:
    client = secretmanager.SecretManagerServiceClient()
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT')
    
    def get_secret(secret_name):
        try:
            name = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
            response = client.access_secret_version(request={"name": name})
            return response.payload.data.decode("UTF-8")
        except Exception as e:
            print(f"Could not retrieve secret {secret_name}: {e}")
            return os.environ.get(secret_name, '')
            
except Exception as e:
    print(f"Could not initialize Secret Manager client: {e}")
    def get_secret(secret_name):
        return os.environ.get(secret_name, '')

# Database configuration for Cloud SQL
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'poehr_db',
        'USER': 'jsswp2004',
        'PASSWORD': get_secret('DATABASE_PASSWORD'),
        'HOST': f'/cloudsql/{project_id}:us-central1:poehr-db-instance',
        'PORT': '5432',
    }
}

# Redis configuration for Memorystore
REDIS_HOST = get_secret('REDIS_HOST') or os.environ.get('REDIS_HOST', 'localhost')

# Security settings
SECRET_KEY = get_secret('DJANGO_SECRET_KEY') or os.environ.get('DJANGO_SECRET_KEY')
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

# Static files configuration
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Media files configuration
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Email configuration
EMAIL_HOST_USER = get_secret('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = get_secret('EMAIL_HOST_PASSWORD')

# Twilio configuration
TWILIO_ACCOUNT_SID = get_secret('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = get_secret('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = get_secret('TWILIO_PHONE_NUMBER')

# Stripe configuration
STRIPE_SECRET_KEY = get_secret('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = get_secret('STRIPE_PUBLISHABLE_KEY')
STRIPE_WEBHOOK_SECRET = get_secret('STRIPE_WEBHOOK_SECRET')

# Stripe Price IDs
STRIPE_BASIC_PRICE_ID = get_secret('STRIPE_BASIC_PRICE_ID')
STRIPE_PREMIUM_PRICE_ID = get_secret('STRIPE_PREMIUM_PRICE_ID')
STRIPE_ENTERPRISE_PRICE_ID = get_secret('STRIPE_ENTERPRISE_PRICE_ID')

# Logging configuration
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

# Channel layers for WebSocket (using Redis)
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [(REDIS_HOST, 6379)],
        },
    },
}
