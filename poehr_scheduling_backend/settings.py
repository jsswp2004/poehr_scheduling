"""
Django settings for poehr_scheduling_backend project.
"""

import os
import dj_database_url
from pathlib import Path
from dotenv import load_dotenv

# ✅ Load environment variables early
load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "fallback-secret-key-if-missing")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "192.168.0.36",
    "192.168.1.153",
    "poehr-scheduling-750584621883.us-central1.run.app",
    "poehr-frontend-750584621883.us-central1.run.app",
    "poehr-scheduling-mjf5efdj3a-uc.a.run.app",
    "poehr-frontend-mjf5efdj3a-uc.a.run.app",
    "poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io",  # Azure Container Apps
    "*.bluedune-dee8c412.centralus.azurecontainerapps.io",  # Azure Container Apps wildcard
]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",  # Add channels
    "django_rest_passwordreset",  # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    # Note: storages conditionally added in production settings if available
    # Local apps
    "users",
    "appointments",
    "communicator",
    "poehr_scheduling_backend.core",
    "django_cron",
    "anymail",
]

# Conditionally add storages if available (for Azure blob storage)
try:
    import storages

    INSTALLED_APPS.append("storages")
except ImportError:
    pass  # storages not available, skip

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    # Records the current request's organization so tenant-scoped models'
    # default managers can filter by it automatically. Must come after
    # AuthenticationMiddleware (needs request.user resolved).
    "poehr_scheduling_backend.tenancy.TenantScopeMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "poehr_scheduling_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "poehr_scheduling_backend.wsgi.application"

# Django ASGI application
ASGI_APPLICATION = "poehr_scheduling_backend.asgi.application"

# Database
# Database configuration - supports both local and Docker
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME", "poehr_db"),
        "USER": os.environ.get("DB_USER", "jsswp2004"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "krat25Miko!"),
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

# Use DATABASE_URL if provided (Docker environment)
if "DATABASE_URL" in os.environ:
    import dj_database_url

    DATABASES["default"] = dj_database_url.parse(os.environ["DATABASE_URL"])

# Channel Layer Configuration (Redis)
redis_host = os.environ.get("REDIS_HOST", "127.0.0.1")
redis_port = int(os.environ.get("REDIS_PORT", "6379"))

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(redis_host, redis_port)],
        },
    },
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "America/New_York"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "static/"

# Media files
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# Primary key field type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Custom user model
AUTH_USER_MODEL = "users.CustomUser"

# Authentication backends with account status checking
AUTHENTICATION_BACKENDS = [
    # Temporarily disabled custom backend for testing
    # "users.auth_backends.AccountStatusBackend",  # Custom backend that checks account status
    "django.contrib.auth.backends.ModelBackend",  # Default backend as fallback
]

# DRF & JWT settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # TenantAwareJWTAuthentication wraps the stock JWTAuthentication to
        # also record the authenticated user's organization for
        # TenantScopedManager (see poehr_scheduling_backend/tenancy.py) --
        # it behaves identically otherwise.
        "poehr_scheduling_backend.tenancy.TenantAwareJWTAuthentication",
    ),
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
}

from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS settings
CORS_ALLOW_ALL_ORIGINS = True

# django-cors-headers' default allowed request headers (accept,
# accept-encoding, authorization, content-type, dnt, origin, user-agent,
# x-csrftoken, x-requested-with) don't include cache-control/pragma --
# ProfilePage's user-search request sends both to force a fresh lookup,
# which the browser must preflight (OPTIONS) before the real GET. Without
# these listed here, that preflight fails CORS entirely and the browser
# blocks the request before it ever reaches the API (seen as "Request
# header field cache-control is not allowed by Access-Control-Allow-Headers
# in preflight response").
from corsheaders.defaults import default_headers as _cors_default_headers

CORS_ALLOW_HEADERS = list(_cors_default_headers) + ["cache-control", "pragma"]

# Email settings
#
# Previously plain SMTP against mail.privateemail.com:465. That can never
# work from Render: Render blocks outbound traffic to SMTP ports (25/465/587)
# on ALL web services, free or paid -- it's a platform-level firewall rule
# to cut down spam abuse, not something fixable with credentials, TLS mode,
# or timeouts (see
# https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports).
# Every send_mail() call was hanging (later timing out) at the TCP connect
# step, before ever reaching SMTP auth.
#
# Fix: send over a plain HTTPS API instead of raw SMTP, via Resend +
# django-anymail. send_mail()/EmailMultiAlternatives calls elsewhere in the
# codebase (appointments/views.py, users/views.py) are unchanged -- anymail
# is a drop-in Django EMAIL_BACKEND, so only settings change here.
EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
ANYMAIL = {
    "RESEND_API_KEY": os.getenv("RESEND_API_KEY"),
}
# Old SMTP settings, kept only for local/dev reference -- unused now that
# EMAIL_BACKEND is anymail's Resend backend. Flip EMAIL_BACKEND back to the
# smtp backend below if testing locally against a real mailbox that isn't
# behind a cloud-host SMTP block.
# EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
# EMAIL_HOST = "mail.privateemail.com"
# EMAIL_PORT = 465
# EMAIL_USE_SSL = True
# EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
# EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
# EMAIL_TIMEOUT = 10
#
# DEFAULT_FROM_EMAIL must be on a domain verified in the Resend dashboard
# (Domains -> Add Domain -> add the DNS records Resend gives you for
# powerhealthcareit.com). Until that domain is verified, Resend will only
# deliver mail sent From onboarding@resend.dev.
DEFAULT_FROM_EMAIL = "info@powerhealthcareit.com"  # Updated from EMAIL_HOST_USER
ADMIN_EMAIL = "jsswp2004@outlook.com"  # 👈 where the notification goes

# ✅ Twilio settings
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# ✅ Stripe settings
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

# Stripe Price IDs for subscription tiers
STRIPE_BASIC_PRICE_ID = os.getenv("STRIPE_BASIC_PRICE_ID", "price_test_basic")
STRIPE_PREMIUM_PRICE_ID = os.getenv("STRIPE_PREMIUM_PRICE_ID", "price_test_premium")
STRIPE_ENTERPRISE_PRICE_ID = os.getenv(
    "STRIPE_ENTERPRISE_PRICE_ID", "price_test_enterprise"
)

# Shared secret an external daily scheduler (GitHub Actions) must send
# in the X-Scheduled-Job-Secret header to hit /api/run-scheduled-jobs/.
# No default -- an empty value means the endpoint always returns 403.
SCHEDULED_JOBS_SECRET = os.getenv("SCHEDULED_JOBS_SECRET", "")

# Metered overage prices for automatic email/SMS reminders (see
# users/messaging_stripe.py). Empty until setup_messaging_meters has been
# run and the resulting price IDs are set as env vars -- attach_messaging_billing
# and report_messaging_usage raise a clear error if these are missing rather
# than silently doing nothing.
STRIPE_EMAIL_OVERAGE_PRICE_ID = os.getenv("STRIPE_EMAIL_OVERAGE_PRICE_ID", "")
STRIPE_SMS_OVERAGE_PRICE_ID = os.getenv("STRIPE_SMS_OVERAGE_PRICE_ID", "")

# Django Cron Settings
CRON_CLASSES = [
    "appointments.cron.BlastPatientReminderCronJob",
]
