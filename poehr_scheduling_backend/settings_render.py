"""
Django settings for deploying the POEHR Scheduling backend to Render.com
as a low-cost / free public SHOWCASE (not the real production stack).

Differences from the base settings.py:
  - Reads SECRET_KEY, ALLOWED_HOSTS, CORS origins from environment variables
    instead of hardcoded/Azure-specific values.
  - DATABASE_URL comes from a Render Postgres instance.
  - Static files served by WhiteNoise (no separate CDN/nginx needed).
  - Uses an in-memory channel layer instead of Redis (fine for one free
    instance; chat won't persist across a restart, which is acceptable
    for a showcase).
  - DEMO_MODE disables the cron reminder job. Stripe/Twilio simply have no
    keys set on Render, so those buttons fail safely instead of charging
    a card or sending a real text.

Activate with:
    DJANGO_SETTINGS_MODULE=poehr_scheduling_backend.settings_render
"""
import os
import dj_database_url

from .settings import *  # noqa: F401,F403  (start from the shared base settings)

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]  # must be set in Render dashboard
DEBUG = os.environ.get("DJANGO_DEBUG", "False") == "True"

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get("DJANGO_ALLOWED_HOSTS", ".onrender.com").split(",")
    if h.strip()
]

# ---------------------------------------------------------------------------
# Database — Render injects DATABASE_URL automatically when a Render
# Postgres instance is attached (see render.yaml).
# ---------------------------------------------------------------------------
if os.environ.get("DATABASE_URL"):
    DATABASES["default"] = dj_database_url.parse(
        os.environ["DATABASE_URL"], conn_max_age=600, ssl_require=True
    )

# ---------------------------------------------------------------------------
# Static files via WhiteNoise (Render has no bundled static file host)
# ---------------------------------------------------------------------------
STATIC_ROOT = BASE_DIR / "staticfiles"

MIDDLEWARE = [m for m in MIDDLEWARE if "whitenoise" not in m]
_sec_index = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")
MIDDLEWARE.insert(_sec_index + 1, "whitenoise.middleware.WhiteNoiseMiddleware")

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ---------------------------------------------------------------------------
# CORS / CSRF — only the real frontend origins, not "allow all"
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("DJANGO_CORS_ORIGINS", "").split(",")
    if o.strip()
]
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# ---------------------------------------------------------------------------
# Channels — in-memory layer, no Redis add-on required for a single
# free-tier instance.
# ---------------------------------------------------------------------------
CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"},
}

# ---------------------------------------------------------------------------
# Demo mode
# ---------------------------------------------------------------------------
DEMO_MODE = os.environ.get("DEMO_MODE", "True") == "True"
CRON_CLASSES = [] if DEMO_MODE else CRON_CLASSES

# ---------------------------------------------------------------------------
# HTTPS niceties (Render terminates TLS at the edge and forwards this header)
# ---------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
