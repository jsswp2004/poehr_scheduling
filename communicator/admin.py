from django.contrib import admin
from .models import CommunicatorAssistantMessage, Contact, MessageLog


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "email", "uploaded_by", "created_at")


@admin.register(MessageLog)
class MessageLogAdmin(admin.ModelAdmin):
    list_display = (
        "recipient",
        "message_type",
        "status",
        "created_at",
    )


@admin.register(CommunicatorAssistantMessage)
class CommunicatorAssistantMessageAdmin(admin.ModelAdmin):
    """Read-only support/audit log of Communicator assistant conversations."""

    list_display = ("created_at", "user", "user_role", "organization", "short_question", "error")
    list_filter = ("organization", "user_role")
    search_fields = ("question", "answer", "user__username")
    date_hierarchy = "created_at"

    def short_question(self, obj):
        return obj.question[:80]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
