from rest_framework import serializers
from .models import Contact, MessageLog


class ContactSerializer(serializers.ModelSerializer):
    opted_out = serializers.SerializerMethodField()

    class Meta:
        model = Contact
        fields = [
            "id",
            "name",
            "phone",
            "email",
            "uploaded_by",
            "created_at",
            "opted_out",
        ]
        read_only_fields = ["id", "uploaded_by", "created_at", "opted_out"]

    def _opted_out_phones(self):
        """Phones of registered users who replied STOP, loaded once per request."""
        cache = self.context.setdefault("_opted_out_phones", None)
        if cache is None:
            from users.models import CustomUser
            from .utils import format_phone_to_international

            cache = {
                format_phone_to_international(p)
                for p in CustomUser.objects.filter(sms_opt_out=True)
                .exclude(phone_number__isnull=True)
                .exclude(phone_number="")
                .values_list("phone_number", flat=True)
            }
            self.context["_opted_out_phones"] = cache
        return cache

    def get_opted_out(self, obj):
        if obj.sms_opt_out:
            return True
        if not obj.phone:
            return False
        from .utils import format_phone_to_international

        return format_phone_to_international(obj.phone) in self._opted_out_phones()


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
