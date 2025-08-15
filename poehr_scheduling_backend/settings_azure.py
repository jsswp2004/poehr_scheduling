from .settings import *
import os

# TEMPORARY: Comment out Azure Key Vault to fix 500 error
# from .utils.azure_secrets import get_azure_secret


# Temporary function to bypass Key Vault
def get_azure_secret(secret_name, default=None):
    """Temporary bypass for Azure Key Vault - uses environment variables instead"""
    env_var = secret_name.upper().replace("-", "_")
    return os.environ.get(env_var, default)


# Azure production settings
DEBUG = False

# Get the current Azure Container App URL from environment
SERVICE_URL = os.environ.get("CONTAINER_APP_NAME", "")
AZURE_REGION = os.environ.get("AZURE_LOCATION", "eastus")

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "*.azurecontainerapps.io",  # Azure Container Apps domains
    ".azurecontainerapps.io",  # Wildcard for all Azure Container Apps
    "powerhealthcareit.com",    # Production domain
    "*.powerhealthcareit.com",  # Subdomains (www, api, etc.)
]

# Add any environment-specified hosts
env_hosts = os.environ.get("DJANGO_ALLOWED_HOSTS", "")
if env_hosts:
    ALLOWED_HOSTS.extend(env_hosts.split(","))

# Templates for serving React frontend
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [os.path.join(BASE_DIR, "static", "frontend")],
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

# Azure configuration
AZURE_SUBSCRIPTION_ID = os.environ.get("AZURE_SUBSCRIPTION_ID")
AZURE_RESOURCE_GROUP = os.environ.get("AZURE_RESOURCE_GROUP")
AZURE_KEYVAULT_NAME = os.environ.get("AZURE_KEYVAULT_NAME")

# Security settings - SECRET_KEY from Azure Key Vault
SECRET_KEY = get_azure_secret(
    "django-secret-key",
    default=os.environ.get(
        "DJANGO_SECRET_KEY", "temporary-fallback-key-for-build-only"
    ),
)
if SECRET_KEY == "temporary-fallback-key-for-build-only" and os.environ.get(
    "CONTAINER_APP_NAME"
):
    # We're in production but couldn't get secret - this is critical
    import sys

    print("CRITICAL ERROR: Could not retrieve DJANGO_SECRET_KEY from Azure Key Vault")
    sys.exit(1)

# Database configuration for Azure Database for PostgreSQL
db_password = get_azure_secret(
    "database-password", default=os.environ.get("DB_PASSWORD", "")
)
print(f"DEBUG: Using password for database connection (length: {len(db_password)})")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "poehr_db"),
        "USER": os.environ.get("DB_USER", "poehr_admin"),
        "PASSWORD": db_password,
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "OPTIONS": {
            "sslmode": "require",  # Azure Database for PostgreSQL requires SSL
        },
    }
}

# Redis configuration for Azure Cache for Redis
REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))
REDIS_PASSWORD = get_azure_secret(
    "redis-connection-string", default=os.environ.get("REDIS_PASSWORD", "")
)

# Security settings
# Only enforce HTTPS in actual Azure Container Apps environment
if os.environ.get("CONTAINER_APP_NAME"):
    SECURE_SSL_REDIRECT = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = "DENY"

# CSRF settings for Azure Container Apps and custom domain
CSRF_TRUSTED_ORIGINS = [
    "https://*.azurecontainerapps.io",
    "https://powerhealthcareit.com",
    "https://www.powerhealthcareit.com",
]

# Static files configuration
STATIC_URL = "/static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

# Include the frontend build directory in static files
STATICFILES_DIRS = (
    [
        os.path.join(BASE_DIR, "static", "frontend"),
    ]
    if os.path.exists(os.path.join(BASE_DIR, "static", "frontend"))
    else []
)

# Media files configuration
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# Azure Blob Storage for media (recommended)
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
    try:
        import storages  # Test if storages is available

        INSTALLED_APPS = list(INSTALLED_APPS)
        if "storages" not in INSTALLED_APPS:
            INSTALLED_APPS.append("storages")

        DEFAULT_FILE_STORAGE = "storages.backends.azure_storage.AzureStorage"
        AZURE_ACCOUNT_NAME = AZURE_ACCOUNT_NAME
        AZURE_ACCOUNT_KEY = AZURE_ACCOUNT_KEY
        AZURE_CONTAINER = AZURE_CONTAINER
        AZURE_CONNECTION_STRING = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
        AZURE_URL_EXPIRATION_SECS = 3600  # signed URL expiry if needed

        # MEDIA_URL points to blob endpoint
        if AZURE_CUSTOM_DOMAIN:
            MEDIA_URL = f"https://{AZURE_CUSTOM_DOMAIN}/"
        else:
            MEDIA_URL = (
                f"https://{AZURE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_CONTAINER}/"
            )
    except ImportError:
        print("WARNING: django-storages not available, using local media storage")
        # Keep default local media storage settings

# Email configuration with Azure Key Vault
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = get_azure_secret(
    "email-host-password", default=os.environ.get("EMAIL_HOST_PASSWORD", "")
)

# Twilio configuration
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = get_azure_secret(
    "twilio-auth-token", default=os.environ.get("TWILIO_AUTH_TOKEN", "")
)
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")

# Stripe configuration
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_SECRET_KEY = get_azure_secret(
    "stripe-secret-key", default=os.environ.get("STRIPE_SECRET_KEY", "")
)
STRIPE_WEBHOOK_SECRET = get_azure_secret(
    "stripe-webhook-secret", default=os.environ.get("STRIPE_WEBHOOK_SECRET", "")
)

# Stripe Price IDs for subscription tiers
STRIPE_BASIC_PRICE_ID = os.environ.get("STRIPE_BASIC_PRICE_ID", "price_test_basic")
STRIPE_PREMIUM_PRICE_ID = os.environ.get("STRIPE_PREMIUM_PRICE_ID", "price_test_premium")
STRIPE_ENTERPRISE_PRICE_ID = os.environ.get("STRIPE_ENTERPRISE_PRICE_ID", "price_test_enterprise")

# Logging configuration
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {process:d} {thread:d} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "poehr_scheduling_backend": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

# Channel layers for WebSocket - Force in-memory for Azure reliability
# Azure Container Apps may not have Redis configured, so use in-memory by default
print("🔧 Configuring WebSocket channel layers for Azure...")

# Force in-memory channel layer for immediate WebSocket functionality
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}
print("✅ Using in-memory channel layer for WebSocket (single-server, but reliable)")

# Optional: Try Redis as backup if explicitly configured
REDIS_AVAILABLE = False
if REDIS_HOST and REDIS_HOST != "localhost" and REDIS_PASSWORD:
    try:
        import redis

        r = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            ssl=True,
            socket_connect_timeout=3,
        )
        r.ping()

        # Redis works, but keep in-memory as primary for stability
        print(
            f"📡 Redis available at {REDIS_HOST}:{REDIS_PORT} but using in-memory for stability"
        )
        REDIS_AVAILABLE = True

    except Exception as e:
        print(f"📡 Redis test failed ({e}) - continuing with in-memory channel layer")

print(f"📋 Final channel layer: {CHANNEL_LAYERS['default']['BACKEND']}")

# ASGI Application
ASGI_APPLICATION = "poehr_scheduling_backend.asgi.application"

# Celery Configuration (if you're using it)
CELERY_BROKER_URL = f"rediss://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"
CELERY_RESULT_BACKEND = f"rediss://:{REDIS_PASSWORD}@{REDIS_HOST}:{REDIS_PORT}/0"

# CORS settings (if needed for API access)
if "corsheaders" in INSTALLED_APPS:
    CORS_ALLOWED_ORIGINS = [
        f"https://{SERVICE_URL}.azurecontainerapps.io",
        "https://powerhealthcareit.com",
        "https://www.powerhealthcareit.com",
    ] + [
        f"https://{host}"
        for host in ALLOWED_HOSTS
        if host not in ["localhost", "127.0.0.1"] and not host.startswith("*")
    ]

# Add a startup message to help with debugging
import logging

logger = logging.getLogger(__name__)
logger.info(
    f"Settings loaded. Running in {'Azure Container Apps' if os.environ.get('CONTAINER_APP_NAME') else 'Local'} environment"
)

# Azure-specific configuration
if AZURE_KEYVAULT_NAME:
    logger.info(f"Using Azure Key Vault: {AZURE_KEYVAULT_NAME}")
else:
    logger.warning(
        "Azure Key Vault not configured - using environment variables for secrets"
    )

# Custom domain configuration for powerhealthcareit.com
SITE_URL = os.environ.get("SITE_URL", "https://powerhealthcareit.com")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://powerhealthcareit.com")

# Email settings for custom domain
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@powerhealthcareit.com")
SERVER_EMAIL = os.environ.get("SERVER_EMAIL", "admin@powerhealthcareit.com")

logger.info(f"Domain configuration: Site URL = {SITE_URL}, Frontend URL = {FRONTEND_URL}")
