from django.apps import AppConfig


class CommunicatorConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "communicator"

    def ready(self):
        from . import signals  # noqa: F401
