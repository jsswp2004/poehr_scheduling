from rest_framework import serializers
from .models import Contact, MessageLog


class ContactSerializer(serializers.ModelSerializer):
    opted_out = serializers.SerializerMethodField()
    last_messaged = serializers.SerializerMethodField()

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
            "last_messaged",
        ]
        read_only_fields = [
            "id",
            "uploaded_by",
            "created_at",
            "opted_out",
            "last_messaged",
        ]

    def _last_sent_by_recipient(self):
        """Newest accepted send per recipient (phone in +1 form, or email), loaded once per request."""
        cache = self.context.get("_last_sent")
        if cache is None:
            from django.db.models import Max

            request = self.context.get("request")
            user = getattr(request, "user", None)
            cache = {}
            if user is not None and user.is_authenticated:
                rows = (
                    MessageLog.objects.filter(
                        user=user,
                        message_type__in=["sms", "email"],
                        status="sent",
                    )
                    .values("recipient")
                    .annotate(last=Max("created_at"))
                )
                cache = {r["recipient"].lower(): r["last"] for r in rows}
            self.context["_last_sent"] = cache
        return cache

    def get_last_messaged(self, obj):
        """When this contact was last sent something (text or email), or None."""
        from .utils import format_phone_to_international

        sent = self._last_sent_by_recipient()
        found = []
        if obj.phone:
            key = (format_phone_to_international(obj.phone) or "").lower()
            if key in sent:
                found.append(sent[key])
        if obj.email and obj.email.lower() in sent:
            found.append(sent[obj.email.lower()])
        return max(found).isoformat() if found else None

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
    sent_by = serializers.SerializerMethodField()

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
            "sent_by",
        ]
        read_only_fields = [
            "id",
            "user",
            "organization",
            "created_at",
            "organization_name",
            "sent_by",
        ]

    def get_sent_by(self, obj):
        """Display name of the sender; empty for inbound replies and system logs."""
        user = getattr(obj, "user", None)
        if not user:
            return ""
        return (user.get_full_name() or user.get_username() or "").strip()

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
