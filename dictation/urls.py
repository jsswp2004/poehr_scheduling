from django.urls import path

from . import views

app_name = "dictation"

urlpatterns = [
    path("config/", views.config, name="config"),
    path("stream-url/", views.stream_url, name="stream-url"),
    path("session-end/", views.session_end, name="session-end"),
    path("cleanup/", views.cleanup_text, name="cleanup"),
]
