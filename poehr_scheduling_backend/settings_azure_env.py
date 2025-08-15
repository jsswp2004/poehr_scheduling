# Azure production settings (environment variable based)
import os
from .settings import *

# Security
DEBUG = False
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "fallback-key-change-in-production")
ALLOWED_HOSTS = [
    "poehr-scheduling.azurecontainerapps.io",
    "poehr-scheduling.kindforest-7b8bffcf.centralus.azurecontainerapps.io",
    "poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io",
    "localhost",
    "127.0.0.1",
    "*",  # Allow all hosts for now to avoid this issue
]

# Database
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "poehr_db"),
        "USER": os.environ.get("DB_USER", "jsswp2004"),  # Back to original user
        "PASSWORD": os.environ.get("DB_PASSWORD", "krat25Miko!"),
        "HOST": os.environ.get(
            "DB_HOST", "poehr-scheduling-postgres.postgres.database.azure.com"
        ),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "OPTIONS": {
            "sslmode": "require",
        },
    }
}

# Use local memory cache instead of Redis for now
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "unique-snowflake",
    }
}

# Disable channels (websockets) for now since it also requires Redis
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

# Templates for serving React frontend
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": ["/code/static/frontend"],  # React build output location
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Static files
STATIC_ROOT = "/code/staticfiles"
STATIC_URL = "/static/"

# Static files directories - where Django looks for static files before collecting
STATICFILES_DIRS = [
    "/code/static/frontend/static",  # React build output static files (JS, CSS, etc.)
    "/code/static/frontend",  # React build root (includes index.html and other assets)
]

# Media defaults (overridden when Azure Blob Storage is configured)
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# Azure Blob Storage for media (django-storages)
USE_AZURE_MEDIA = os.environ.get("USE_AZURE_MEDIA", "true").lower() == "true"
AZURE_ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_ACCOUNT_KEY = os.environ.get("AZURE_STORAGE_ACCOUNT_KEY")
AZURE_CONTAINER = os.environ.get("AZURE_STORAGE_CONTAINER", "media")
AZURE_CUSTOM_DOMAIN = os.environ.get(
    "AZURE_STORAGE_CUSTOM_DOMAIN"
)  # optional CDN/custom domain

if (
    USE_AZURE_MEDIA
    and AZURE_ACCOUNT_NAME
    and (AZURE_ACCOUNT_KEY or os.environ.get("AZURE_STORAGE_CONNECTION_STRING"))
):
    INSTALLED_APPS = list(INSTALLED_APPS)
    if "storages" not in INSTALLED_APPS:
        INSTALLED_APPS.append("storages")

    DEFAULT_FILE_STORAGE = "storages.backends.azure_storage.AzureStorage"
    AZURE_CONNECTION_STRING = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
    AZURE_URL_EXPIRATION_SECS = 3600  # signed URL expiry if needed

    # MEDIA_URL points to blob endpoint
    if AZURE_CUSTOM_DOMAIN:
        MEDIA_URL = f"https://{AZURE_CUSTOM_DOMAIN}/"
    else:
        MEDIA_URL = (
            f"https://{AZURE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_CONTAINER}/"
        )

# Email (using Azure Communication Services or SendGrid)
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.sendgrid.net")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", 587))
EMAIL_USE_TLS = True
EMAIL_USE_SSL = False  # Explicitly disable SSL since we're using TLS
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "apikey")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@poehr.com")

# Security headers
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# HTTPS settings (Azure Container Apps provides HTTPS termination)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_TLS = True

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "chat": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "scheduler": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}

# Stripe configuration
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Stripe Price IDs for subscription tiers
STRIPE_BASIC_PRICE_ID = os.environ.get("STRIPE_BASIC_PRICE_ID", "price_test_basic")
STRIPE_PREMIUM_PRICE_ID = os.environ.get(
    "STRIPE_PREMIUM_PRICE_ID", "price_test_premium"
)
STRIPE_ENTERPRISE_PRICE_ID = os.environ.get(
    "STRIPE_ENTERPRISE_PRICE_ID", "price_test_enterprise"
)
