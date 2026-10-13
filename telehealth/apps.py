from django.apps import AppConfig


class TelehealthConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "telehealth"

    def ready(self):
        from . import notes  # noqa: F401  (connects the session_ended handler)
