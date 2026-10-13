from django.urls import path

from . import views

app_name = "telehealth"

urlpatterns = [
    # Staff (authenticated)
    path("schedule/", views.schedule, name="schedule"),
    path("sessions/", views.create_session, name="create-session"),
    path("sessions/<uuid:session_id>/", views.session_detail, name="session-detail"),
    path("sessions/<uuid:session_id>/join-link/", views.send_join_link, name="send-join-link"),
    path("sessions/<uuid:session_id>/admit/", views.admit, name="admit"),
    path("sessions/<uuid:session_id>/provider-token/", views.provider_token, name="provider-token"),
    path("sessions/<uuid:session_id>/presence/", views.provider_presence, name="provider-presence"),
    path("sessions/<uuid:session_id>/end/", views.end_session, name="end-session"),
    path("sessions/<uuid:session_id>/visit-record/", views.visit_record, name="visit-record"),
    path("assistant/chat/", views.assistant_chat, name="assistant-chat"),
    # Patient (tokenized, no login)
    path("ping/", views.ping, name="ping"),
    path("join/redeem/", views.join_redeem, name="join-redeem"),
    path("join/consent/", views.join_consent, name="join-consent"),
    path("join/status/", views.join_status, name="join-status"),
    path("join/media/", views.join_media, name="join-media"),
    path("join/presence/", views.join_presence, name="join-presence"),
]
