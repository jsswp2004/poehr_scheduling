"""Local test settings: in-memory SQLite so tests run without PostgreSQL.
Usage: python manage.py test communicator --settings=poehr_scheduling_backend.settings_test
"""
from .settings import *  # noqa

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
