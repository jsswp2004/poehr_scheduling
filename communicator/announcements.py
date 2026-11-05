"""Announcements: notices an organization shows on its patient and staff dashboards.

Managers (admin, system_admin, registrar) write them with a formatting toolbar; everyone else only reads
the ones that are showing for them right now. HTML is cleaned on the way in, so a pasted script or odd
markup never reaches a patient.
"""
import os

import nh3
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Announcement, AnnouncementAttachment

MANAGER_ROLES = ("admin", "system_admin", "registrar")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".doc", ".docx", ".txt"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 5

ALLOWED_TAGS = {"b", "strong", "i", "em", "u", "br", "p", "div", "span", "ul", "ol", "li", "a", "font", "h3", "h4"}
ALLOWED_ATTRIBUTES = {"a": {"href", "target"}, "span": {"style"}, "font": {"color"}}
# Only a text color may be set with style, and only as a plain color value.
_COLOR_STYLE_PROPS = {"color"}


def clean_html(html):
    """Keep simple formatting only; drop scripts, event handlers, images and any other markup."""
    cleaned = nh3.clean(
        html or "",
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        filter_style_properties=_COLOR_STYLE_PROPS,
        url_schemes={"http", "https", "mailto", "tel"},
        link_rel="noopener noreferrer",
        strip_comments=True,
    )
    return cleaned


def can_manage(user):
    return bool(user and user.is_authenticated and getattr(user, "role", "") in MANAGER_ROLES)


def audiences_for(user):
    """Which audience values a user is a member of."""
    return ("patients", "everyone") if getattr(user, "role", "") == "patient" else ("staff", "everyone")


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementAttachment
        fields = ["id", "name", "content_type", "size", "url"]

    def get_url(self, obj):
        return obj.file.url if obj.file else ""


class AnnouncementSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Announcement
        fields = [
            "id", "title", "body", "audience", "start_date", "end_date", "is_active",
            "status", "attachments", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "attachments", "created_at", "updated_at"]

    def get_status(self, obj):
        return obj.status()

    def validate_title(self, value):
        value = nh3.clean(value or "", tags=set()).strip()
        if not value:
            raise serializers.ValidationError("Give the announcement a title.")
        return value

    def validate_body(self, value):
        return clean_html(value)

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "The end date is before the start date."})
        return attrs


class AnnouncementViewSet(viewsets.ModelViewSet):
    serializer_class = AnnouncementSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def _organization(self):
        return getattr(self.request.user, "organization", None)

    def _require_manager(self):
        if not can_manage(self.request.user):
            self.permission_denied(self.request, message="Only an administrator can change announcements.")

    def get_queryset(self):
        org = self._organization()
        if org is None:
            return Announcement.objects.none()
        qs = Announcement.objects.filter(organization=org).prefetch_related("attachments")
        # ?view=portal, or anyone who is not a manager: only what is showing for this user right now.
        if self.request.query_params.get("view") == "portal" or not can_manage(self.request.user):
            today = timezone.localdate()
            qs = qs.filter(is_active=True, audience__in=audiences_for(self.request.user))
            qs = qs.exclude(start_date__gt=today).exclude(end_date__lt=today)
        return qs

    def create(self, request, *args, **kwargs):
        self._require_manager()
        if self._organization() is None:
            return Response({"detail": "Your account is not part of an organization."}, status=400)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(organization=self._organization(), created_by=self.request.user)

    def update(self, request, *args, **kwargs):
        self._require_manager()
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_manager()
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="attachments")
    def add_attachment(self, request, pk=None):
        self._require_manager()
        announcement = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "Choose a file to attach."}, status=400)
        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return Response(
                {"detail": "That file type is not allowed. Use an image, PDF, Word document or text file."},
                status=400,
            )
        if upload.size > MAX_FILE_BYTES:
            return Response({"detail": "That file is larger than 10 MB."}, status=400)
        if announcement.attachments.count() >= MAX_FILES:
            return Response({"detail": f"An announcement can have up to {MAX_FILES} files."}, status=400)
        att = AnnouncementAttachment.objects.create(
            announcement=announcement,
            file=upload,
            name=os.path.basename(upload.name)[:255],
            content_type=(upload.content_type or "")[:100],
            size=upload.size,
        )
        return Response(AttachmentSerializer(att).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"attachments/(?P<attachment_id>\d+)")
    def remove_attachment(self, request, pk=None, attachment_id=None):
        self._require_manager()
        announcement = self.get_object()
        att = announcement.attachments.filter(pk=attachment_id).first()
        if att is None:
            return Response(status=404)
        att.file.delete(save=False)
        att.delete()
        return Response(status=204)
