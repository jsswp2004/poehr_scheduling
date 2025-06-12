from django.contrib import admin
from .models import Contact, MessageLog


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
