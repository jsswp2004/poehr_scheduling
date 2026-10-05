"""Serializers for lab reports (see appointments/lab_results.py for the rules)."""

from rest_framework import serializers

from . import lab_results
from .models import LabReport, LabReportEvent, LabResultItem


def _person_name(user):
    if user is None:
        return None
    return f"{user.first_name} {user.last_name}".strip() or user.username


class LabResultItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResultItem
        fields = [
            "id",
            "sort_order",
            "test_name",
            "loinc_code",
            "value",
            "value_numeric",
            "units",
            "reference_range",
            "ref_low",
            "ref_high",
            "abnormal_flag",
            "comment",
        ]
        read_only_fields = fields


class LabReportEventSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = LabReportEvent
        fields = ["id", "event_type", "user", "user_name", "source", "detail", "created_at"]

    def get_user_name(self, obj):
        if not obj.user_id:
            return "Interface" if obj.source == "interface" else ""
        return _person_name(obj.user)


class LabReportSerializer(serializers.ModelSerializer):
    """What the API returns for a report, result lines and history included."""

    patient_name = serializers.SerializerMethodField()
    order_name = serializers.SerializerMethodField()
    placer_order_number = serializers.SerializerMethodField()
    entered_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    items = LabResultItemSerializer(many=True, read_only=True)
    events = LabReportEventSerializer(many=True, read_only=True)
    has_abnormal = serializers.SerializerMethodField()
    has_critical = serializers.SerializerMethodField()
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = LabReport
        fields = [
            "id",
            "organization",
            "patient",
            "patient_name",
            "order",
            "order_name",
            "placer_order_number",
            "title",
            "source",
            "status",
            "status_display",
            "performing_lab",
            "accession_number",
            "collected_at",
            "resulted_at",
            "comment",
            "items",
            "has_abnormal",
            "has_critical",
            "entered_by",
            "entered_by_name",
            "review_status",
            "reviewed_by",
            "reviewed_by_name",
            "reviewed_at",
            "review_comment",
            "error_reason",
            "has_file",
            "file_name",
            "file_content_type",
            "file_size",
            "created_at",
            "updated_at",
            "events",
        ]
        read_only_fields = fields

    def get_patient_name(self, obj):
        return _person_name(obj.patient)

    def get_order_name(self, obj):
        return obj.order.orderable_name if obj.order_id else ""

    def get_placer_order_number(self, obj):
        return obj.order.placer_order_number if obj.order_id else ""

    def get_entered_by_name(self, obj):
        return _person_name(obj.entered_by)

    def get_reviewed_by_name(self, obj):
        return _person_name(obj.reviewed_by)

    def get_has_abnormal(self, obj):
        return lab_results.report_flags(obj)[0]

    def get_has_critical(self, obj):
        return lab_results.report_flags(obj)[1]

    def get_has_file(self, obj):
        return bool(obj.file_name)


class LabItemInputSerializer(serializers.Serializer):
    """One result line as sent by the entry form. Business rules live in lab_results.prepare_item."""

    test_name = serializers.CharField(max_length=255)
    value = serializers.CharField(max_length=255)
    loinc_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    units = serializers.CharField(max_length=50, required=False, allow_blank=True)
    reference_range = serializers.CharField(max_length=100, required=False, allow_blank=True)
    abnormal_flag = serializers.CharField(max_length=20, required=False, allow_blank=True)
    comment = serializers.CharField(required=False, allow_blank=True)


class LabReportInputSerializer(serializers.Serializer):
    patient = serializers.IntegerField(required=False)
    order = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(max_length=255, required=False)
    status = serializers.ChoiceField(choices=["preliminary", "final", "corrected"], required=False)
    performing_lab = serializers.CharField(max_length=120, required=False, allow_blank=True)
    accession_number = serializers.CharField(max_length=64, required=False, allow_blank=True)
    collected_at = serializers.DateTimeField(required=False, allow_null=True)
    resulted_at = serializers.DateTimeField(required=False, allow_null=True)
    comment = serializers.CharField(required=False, allow_blank=True)
    items = LabItemInputSerializer(many=True, required=False)
