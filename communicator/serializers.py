from rest_framework import serializers
from .models import Contact, MessageLog


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ['id', 'name', 'phone', 'email', 'uploaded_by', 'created_at']
        read_only_fields = ['id', 'uploaded_by', 'created_at']


class MessageLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageLog
        fields = [
            "id",
            "user",
            "recipient",
            "subject",
            "body",
            "message_type",
            "status",
            "provider_id",
            "created_at",
        ]
        read_only_fields = ["id", "user", "created_at"]
