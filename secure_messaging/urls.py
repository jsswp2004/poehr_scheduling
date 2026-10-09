from django.urls import path

from . import api

urlpatterns = [
    path("people/", api.PeopleView.as_view(), name="secure-people"),
    path("threads/", api.ThreadListView.as_view(), name="secure-threads"),
    path("threads/<int:pk>/", api.ThreadDetailView.as_view(), name="secure-thread"),
    path("threads/<int:pk>/messages/", api.MessageListView.as_view(), name="secure-messages"),
    path("threads/<int:pk>/read/", api.ReadView.as_view(), name="secure-read"),
    path("threads/<int:pk>/members/", api.MemberListView.as_view(), name="secure-members"),
    path("threads/<int:pk>/members/<int:user_id>/", api.MemberDetailView.as_view(), name="secure-member"),
    path("messages/<int:pk>/retract/", api.RetractView.as_view(), name="secure-retract"),
    path("attachments/<int:pk>/", api.AttachmentView.as_view(), name="secure-attachment"),
    path("unread-count/", api.UnreadCountView.as_view(), name="secure-unread"),
    path("audit/", api.AuditListView.as_view(), name="secure-audit"),
    path("audit/threads/<int:pk>/", api.AuditTranscriptView.as_view(), name="secure-audit-transcript"),
]
