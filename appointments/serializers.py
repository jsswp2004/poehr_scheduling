from rest_framework import serializers
from .models import (
    Appointment,
    Availability,
    EnvironmentSetting,
    Holiday,
    ClinicEvent,
    AutoEmail,
    ClinicalNote,
    Dictionary,
    DictionaryItem,
    NoteTemplate,
    NoteFieldDefinition,
)
import logging

logger = logging.getLogger(__name__)


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    provider_name = serializers.SerializerMethodField()  # Add this line!

    class Meta:
        model = Appointment
        fields = "__all__"  # This will include all model fields plus both name fields
        extra_kwargs = {
            "provider": {"required": True},
        }

    def to_internal_value(self, data):
        result = super().to_internal_value(data)
        return result

    def validate(self, data):
        # Validate recurrence and recurrence_end_date
        recurrence = data.get("recurrence", "none")
        recurrence_end_date = data.get("recurrence_end_date", None)
        appointment_datetime = data.get("appointment_datetime", None)

        # If not in data, try to get from initial_data (raw input)
        if recurrence_end_date is None and hasattr(self, "initial_data"):
            recurrence_end_date = self.initial_data.get("recurrence_end_date", None)
            if recurrence_end_date == "":
                recurrence_end_date = None
            data["recurrence_end_date"] = recurrence_end_date

        if recurrence and recurrence != "none":
            if not recurrence_end_date:
                raise serializers.ValidationError(
                    {
                        "recurrence_end_date": "Recurrence end date is required for recurring appointments."
                    }
                )
            if not appointment_datetime:
                raise serializers.ValidationError(
                    {"appointment_datetime": "Appointment datetime is required."}
                )
            # If recurrence_end_date is a string, parse it
            if isinstance(recurrence_end_date, str):
                try:
                    recurrence_end_date = serializers.DateField().to_internal_value(
                        recurrence_end_date
                    )
                    data["recurrence_end_date"] = recurrence_end_date
                except Exception:
                    raise serializers.ValidationError(
                        {
                            "recurrence_end_date": "Invalid date format for recurrence end date."
                        }
                    )
            if recurrence_end_date < appointment_datetime.date():
                raise serializers.ValidationError(
                    {
                        "recurrence_end_date": "Recurrence end date must be after the appointment start date."
                    }
                )
        return data

    def update(self, instance, validated_data):
        """Override update to handle Patient ID to CustomUser ID conversion"""
        # The conversion is now handled in to_internal_value, so just call parent
        return super().update(instance, validated_data)

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_provider_name(self, obj):
        if obj.provider:
            return f"Dr. {obj.provider.first_name} {obj.provider.last_name}"
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Ensure ISO string includes timezone
        data["appointment_datetime"] = instance.appointment_datetime.isoformat()
        return data


class AvailabilitySerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Availability
        fields = [
            "id",
            "doctor",
            "start_time",
            "end_time",
            "is_blocked",
            "recurrence",
            "doctor_name",
            "recurrence_end_date",
            "block_type",
        ]

    def get_doctor_name(self, obj):
        return f"{obj.doctor.first_name} {obj.doctor.last_name}"


class EnvironmentSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnvironmentSetting
        fields = ["id", "blocked_days", "updated_at"]


class HolidaySerializer(serializers.ModelSerializer):
    organization_name = serializers.SerializerMethodField()

    class Meta:
        model = Holiday
        fields = [
            "id",
            "name",
            "date",
            "is_recognized",
            "suppressed",
            "organization_name",
        ]

    def get_organization_name(self, obj):
        """Return organization name or 'Global' for system-wide holidays"""
        if obj.organization:
            return obj.organization.name
        return "Global"


class ClinicEventSerializer(serializers.ModelSerializer):
    organization_name = serializers.SerializerMethodField()

    class Meta:
        model = ClinicEvent
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "organization",
            "organization_name",
        ]

    def get_organization_name(self, obj):
        """Return organization name"""
        if obj.organization:
            return obj.organization.name
        return "No Organization"


class AutoEmailSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutoEmail
        fields = "__all__"


class DictionaryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = DictionaryItem
        fields = ["id", "value", "label", "sort_order"]


class NoteFieldDefinitionSerializer(serializers.ModelSerializer):
    # Only relevant for field_type in ('radio', 'dropdown', 'multiselect')
    # -- the ordered list of selectable options from this field's linked
    # Dictionary.
    options = serializers.SerializerMethodField()
    # The *key* (not the numeric id) of the field this one depends on, so
    # the frontend can evaluate visibility against structured_data purely
    # by key without a second lookup. None when always visible.
    depends_on_key = serializers.SerializerMethodField()

    class Meta:
        model = NoteFieldDefinition
        fields = [
            "id",
            "section_label",
            "key",
            "label",
            "field_type",
            "required",
            "sort_order",
            "help_text",
            "options",
            "depends_on_key",
            "depends_on_value",
        ]

    def get_options(self, obj):
        if not obj.dictionary_id:
            return []
        return DictionaryItemSerializer(
            obj.dictionary.items.all().order_by("sort_order", "label"), many=True
        ).data

    def get_depends_on_key(self, obj):
        return obj.depends_on.key if obj.depends_on_id else None


class NoteTemplateSerializer(serializers.ModelSerializer):
    """
    Read-only definition of a structured note type, used by the frontend to
    render a generic form. `fields` are pre-ordered by sort_order and each
    dropdown/radio field carries its dictionary options inline so the
    frontend never needs a second round trip per field.
    """

    fields = NoteFieldDefinitionSerializer(many=True, read_only=True)

    class Meta:
        model = NoteTemplate
        fields = ["id", "code", "name", "version", "is_active", "fields"]


class ClinicalNoteSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    author_name = serializers.SerializerMethodField()
    author_role = serializers.SerializerMethodField()
    note_type_display = serializers.CharField(
        source="get_note_type_display", read_only=True
    )
    documentation_type_display = serializers.CharField(
        source="get_documentation_type_display", read_only=True
    )
    # Full template definition (fields + dictionary options), included so
    # Note History can render a structured note without a second fetch.
    # None for legacy SOAP notes (template is null).
    template_detail = NoteTemplateSerializer(source="template", read_only=True)

    class Meta:
        model = ClinicalNote
        fields = [
            "id",
            "organization",
            "appointment",
            "patient",
            "patient_name",
            "author",
            "author_name",
            "author_role",
            "author_role_at_signing",
            "note_type",
            "note_type_display",
            "documentation_type",
            "documentation_type_display",
            "status",
            "subjective",
            "objective",
            "assessment",
            "plan",
            "template",
            "template_detail",
            "template_version",
            "structured_data",
            "amends",
            "created_at",
            "updated_at",
            "signed_at",
        ]
        read_only_fields = [
            "organization",
            "patient",
            "author",
            "author_role_at_signing",
            "status",
            "template_version",
            "signed_at",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        return (
            f"{obj.patient.first_name} {obj.patient.last_name}".strip()
            or obj.patient.username
        )

    def get_author_name(self, obj):
        return (
            f"{obj.author.first_name} {obj.author.last_name}".strip()
            or obj.author.username
        )

    def get_author_role(self, obj):
        return obj.author_role_at_signing or getattr(obj.author, "role", "")

    def validate(self, data):
        # A note being created must always resolve patient/org from the
        # appointment, never trust a client-supplied patient/organization.
        appointment = data.get("appointment") or getattr(
            self.instance, "appointment", None
        )
        if appointment is None:
            raise serializers.ValidationError(
                {"appointment": "This field is required."}
            )
        return data

    def create(self, validated_data):
        request = self.context["request"]
        user = request.user
        appointment = validated_data["appointment"]

        validated_data["patient"] = appointment.patient
        validated_data["organization"] = appointment.organization
        validated_data["author"] = user
        validated_data["author_role_at_signing"] = getattr(user, "role", "")

        # Snapshot the template's current version at creation time so that
        # editing the template later (via the future configuration UI) can
        # never change how this note renders in Note History. Never
        # recompute this from the live template after creation.
        template = validated_data.get("template")
        if template is not None:
            validated_data["template_version"] = template.version

        return super().create(validated_data)

    def update(self, instance, validated_data):
        if instance.status == "signed":
            raise serializers.ValidationError(
                "This note is signed and locked. Create an addendum instead of editing it."
            )
        return super().update(instance, validated_data)
