from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .announcements import AnnouncementViewSet
from .assistant import (
    AssistantActionCancelView,
    AssistantActionConfirmView,
    AssistantMessageView,
)
from .views import (
    ContactViewSet,
    BulkUploadView,
    SendBulkMessageView,
    MessageLogViewSet,
    SMSWebhookView,
)

router = DefaultRouter()
router.register(r"contacts", ContactViewSet, basename="contact")
router.register(r"announcements", AnnouncementViewSet, basename="announcement")
router.register(r"logs", MessageLogViewSet, basename="messagelog")

urlpatterns = [
    path("upload/", BulkUploadView.as_view(), name="contacts-upload"),
    path("send/", SendBulkMessageView.as_view(), name="bulk-send"),
    path("sms-webhook/", SMSWebhookView.as_view(), name="sms-webhook"),
    path("assistant/message/", AssistantMessageView.as_view(), name="communicator-assistant-message"),
    path(
        "assistant/actions/<uuid:pk>/confirm/",
        AssistantActionConfirmView.as_view(),
        name="communicator-assistant-action-confirm",
    ),
    path(
        "assistant/actions/<uuid:pk>/cancel/",
        AssistantActionCancelView.as_view(),
        name="communicator-assistant-action-cancel",
    ),
]
urlpatterns += router.urls
