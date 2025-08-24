from rest_framework import serializers
from .models import Contact, MessageLog


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ["id", "name", "phone", "email", "uploaded_by", "created_at"]
        read_only_fields = ["id", "uploaded_by", "created_at"]


class MessageLogSerializer(serializers.ModelSerializer):
    organization_name = serializers.SerializerMethodField()

    class Meta:
        model = MessageLog
        fields = [
            "id",
            "user",
            "organization",
            "recipient",
            "subject",
            "body",
            "message_type",
            "status",
            "provider_id",
            "created_at",
            "organization_name",
        ]
        read_only_fields = [
            "id",
            "user",
            "organization",
            "created_at",
            "organization_name",
        ]

    def get_organization_name(self, obj):
        """Return the organization name of the user who sent the message"""
        if getattr(obj, "organization", None):
            return obj.organization.name
        if obj.user and obj.user.organization:
            return obj.user.organization.name
        elif obj.user is None:
            return "System"  # For system-generated messages
        else:
            return "No Organization"  # For users without organization
