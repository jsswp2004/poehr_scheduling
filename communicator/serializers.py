from rest_framework import serializers
from .models import Contact, MessageLog


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ['id', 'name', 'phone', 'email', 'uploaded_by', 'created_at']
        read_only_fields = ['id', 'uploaded_by', 'created_at']


class MessageLogSerializer(serializers.ModelSerializer):
    organization_name = serializers.SerializerMethodField()
    
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
            "organization_name",
        ]
        read_only_fields = ["id", "user", "created_at", "organization_name"]
    
    def get_organization_name(self, obj):
        """
        Get organization name for the message.
        For system messages: Look up patient by recipient email
        For user messages: Use user's organization
        """
        # If message has a user, get their organization
        if obj.user and obj.user.organization:
            return obj.user.organization.name
        
        # For system messages, try to find patient by recipient email
        if not obj.user:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            try:
                # Look for patient with this email
                patient = User.objects.get(email=obj.recipient, role='patient')
                if patient.organization:
                    return patient.organization.name
            except User.DoesNotExist:
                pass
            except User.MultipleObjectsReturned:
                # If multiple patients with same email, get the first one's organization
                patient = User.objects.filter(email=obj.recipient, role='patient').first()
                if patient and patient.organization:
                    return patient.organization.name
        
        # Fallback for cases where organization cannot be determined
        return "Unknown"
