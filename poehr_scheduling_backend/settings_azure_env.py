# Azure production settings (environment variable based)
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
        'USER': os.environ.get('DB_USER', 'poehr_admin'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'PoehrSecure123!'),
        'HOST': os.environ.get('DB_HOST', 'poehr-scheduling-postgres.postgres.database.azure.com'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        'OPTIONS': {
            'sslmode': 'require',
        },
    }
}

# Redis Cache
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': f"redis://:{os.environ.get('REDIS_PASSWORD', 'mg6F87C0wlGpo1oZEgLMYdIUdRyh3pjmkAzCaIRfxgA=')}@{os.environ.get('REDIS_HOST', 'poehr-scheduling-redis.redis.cache.windows.net')}:6380",
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'CONNECTION_POOL_KWARGS': {
                'ssl_cert_reqs': None,
            }
        }
    }
}

# Channels
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [f"redis://:{os.environ.get('REDIS_PASSWORD', 'mg6F87C0wlGpo1oZEgLMYdIUdRyh3pjmkAzCaIRfxgA=')}@{os.environ.get('REDIS_HOST', 'poehr-scheduling-redis.redis.cache.windows.net')}:6380"],
            'ssl_cert_reqs': None,
        },
    },
}

# Templates for serving React frontend
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': ['/code/static/frontend'],  # React build output location
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

# Static files
STATIC_ROOT = '/code/staticfiles'
STATIC_URL = '/static/'

# Static files directories - where Django looks for static files before collecting
STATICFILES_DIRS = [
    '/code/static/frontend/static',  # React build output static files (JS, CSS, etc.)
]

# Email (using Azure Communication Services or SendGrid)
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.sendgrid.net')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', 'apikey')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@poehr.com')

# Security headers
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# HTTPS settings (Azure Container Apps provides HTTPS termination)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_TLS = True

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
        'chat': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'scheduler': {
            'handlers': ['console'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}
