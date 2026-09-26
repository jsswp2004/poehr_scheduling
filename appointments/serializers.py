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
    VitalSignsFlowsheet,
    VITAL_SIGNS_FLOWSHEET_SECTIONS,
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
    dictionary = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = NoteFieldDefinition
        fields = [
            "id",
            "tab_label",
            "section_label",
            "key",
            "label",
            "field_type",
            # Read-only numeric id of the linked Dictionary, if any. Ignored
            # by DynamicNoteForm/DynamicNoteSummary (they only use `options`
            # below) -- included so the note-builder configuration UI can
            # preselect the right dictionary when an admin opens an existing
            # field for editing.
            "dictionary",
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


# --- Phase 2: note-builder configuration UI (admin-only write access) -----
# Everything below is used only by NoteTemplateAdminViewSet /
# DictionaryAdminViewSet (appointments/views.py), gated by
# IsNoteTemplateAdmin. The read-only serializers above are untouched and
# keep serving DynamicNoteForm/ClinicalNoteSerializer exactly as before.


class DictionaryItemAdminSerializer(serializers.ModelSerializer):
    """A single writable option row within a Dictionary's item list."""

    id = serializers.IntegerField(required=False)

    class Meta:
        model = DictionaryItem
        fields = ["id", "value", "label", "sort_order"]


class DictionaryAdminSerializer(serializers.ModelSerializer):
    """
    Full CRUD for a Dictionary and its items. Items are synced wholesale on
    every save: an item without an id (or with an id not already on this
    dictionary) is created, an item whose id matches an existing item is
    updated in place, and any existing item missing from the payload is
    deleted. Removing an option here never touches already-signed notes --
    those render from ClinicalNote.template_snapshot, frozen at signing.
    """

    items = DictionaryItemAdminSerializer(many=True)
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = Dictionary
        fields = ["id", "code", "name", "description", "items", "usage_count"]

    def get_usage_count(self, obj):
        return obj.notefielddefinition_set.count()

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        dictionary = Dictionary.objects.create(**validated_data)
        for item_data in items_data:
            item_data.pop("id", None)
            DictionaryItem.objects.create(dictionary=dictionary, **item_data)
        return dictionary

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            existing_ids = set(instance.items.values_list("id", flat=True))
            seen_ids = set()
            for item_data in items_data:
                item_id = item_data.get("id")
                if item_id and item_id in existing_ids:
                    DictionaryItem.objects.filter(id=item_id, dictionary=instance).update(
                        value=item_data["value"],
                        label=item_data["label"],
                        sort_order=item_data.get("sort_order", 0),
                    )
                    seen_ids.add(item_id)
                else:
                    new_item = DictionaryItem.objects.create(
                        dictionary=instance,
                        value=item_data["value"],
                        label=item_data["label"],
                        sort_order=item_data.get("sort_order", 0),
                    )
                    seen_ids.add(new_item.id)
            instance.items.exclude(id__in=seen_ids).delete()
        return instance


class NoteFieldDefinitionAdminSerializer(serializers.Serializer):
    """
    Write-side representation of a single field within a template save.
    A plain Serializer (not ModelSerializer): saving a whole template's
    field list together -- with reordering, additions, removals, and
    cross-field depends_on wiring all in one request -- needs the custom
    two-pass logic in NoteTemplateAdminSerializer._save_fields, driven from
    there rather than from a per-instance create()/update().

    `client_id` identifies a field across the request: an existing field's
    real database id (sent as a string) when editing, or any other string
    (e.g. "new-<uuid>") for a brand new field. `depends_on_client_id`
    references another field's client_id *within this same request*, so a
    new field can depend on another new field before either has a database
    id yet.
    """

    client_id = serializers.CharField()
    tab_label = serializers.CharField(allow_blank=True, required=False, default="")
    section_label = serializers.CharField(allow_blank=True, required=False, default="")
    key = serializers.SlugField(max_length=64)
    label = serializers.CharField(max_length=200)
    field_type = serializers.ChoiceField(choices=NoteFieldDefinition.FIELD_TYPE_CHOICES)
    dictionary = serializers.PrimaryKeyRelatedField(
        queryset=Dictionary.objects.all(), required=False, allow_null=True, default=None
    )
    required = serializers.BooleanField(required=False, default=False)
    sort_order = serializers.IntegerField(required=False, default=0)
    help_text = serializers.CharField(allow_blank=True, required=False, default="")
    depends_on_client_id = serializers.CharField(required=False, allow_null=True, default=None)
    depends_on_value = serializers.CharField(allow_blank=True, required=False, default="")

    def validate(self, data):
        field_type = data.get("field_type")
        if field_type in ("radio", "dropdown", "multiselect") and not data.get("dictionary"):
            raise serializers.ValidationError(
                {"dictionary": f"A dictionary is required for field type '{field_type}'."}
            )
        return data


class NoteTemplateAdminSerializer(serializers.ModelSerializer):
    """
    Create/update a NoteTemplate together with its complete field list in
    one request. Field order in the submitted `fields` array IS the new
    sort_order -- validate_fields() overwrites whatever sort_order values
    were sent with index * 10, so the frontend's drag-and-drop list order is
    always what gets saved.

    A field's structural "signature" -- key, field_type, dictionary,
    required, and depends_on wiring -- is diffed against what's currently
    saved; any difference (a field added, removed, retyped, re-pointed at a
    different dictionary, or its conditional logic changed) bumps
    `version`. Cosmetic-only edits (label, help_text, section_label, pure
    reordering) do not. Either way, already-signed notes are unaffected --
    they always render from their own frozen ClinicalNote.template_snapshot,
    never the live template.
    """

    fields = NoteFieldDefinitionAdminSerializer(many=True)

    class Meta:
        model = NoteTemplate
        fields = ["id", "code", "name", "organization", "is_active", "version", "fields"]
        read_only_fields = ["id", "version"]

    def validate_fields(self, value):
        if not value:
            raise serializers.ValidationError("A template needs at least one field.")
        keys = [f["key"] for f in value]
        if len(keys) != len(set(keys)):
            raise serializers.ValidationError("Field keys must be unique within a template.")
        client_ids = [f["client_id"] for f in value]
        if len(client_ids) != len(set(client_ids)):
            raise serializers.ValidationError("Duplicate client_id in submitted fields.")
        client_id_set = set(client_ids)
        for f in value:
            dep = f.get("depends_on_client_id")
            if dep and dep not in client_id_set:
                raise serializers.ValidationError(
                    f"Field '{f['key']}' depends on an unknown field (client_id '{dep}')."
                )
            if dep == f["client_id"]:
                raise serializers.ValidationError(f"Field '{f['key']}' cannot depend on itself.")
        # The submitted order IS the new order -- ignore whatever sort_order
        # values arrived and assign fresh ones, leaving room to insert
        # between existing values later if ever needed.
        for idx, f in enumerate(value):
            f["sort_order"] = idx * 10
        return value

    @staticmethod
    def _signature(key, field_type, dictionary_id, required, depends_on_key, depends_on_value):
        return (key, field_type, dictionary_id, bool(required), depends_on_key, depends_on_value or "")

    def _existing_signatures(self, template):
        sigs = set()
        for f in template.fields.all():
            sigs.add(
                self._signature(
                    f.key,
                    f.field_type,
                    f.dictionary_id,
                    f.required,
                    f.depends_on.key if f.depends_on_id else None,
                    f.depends_on_value,
                )
            )
        return sigs

    def _incoming_signatures(self, fields_data, client_id_to_key):
        sigs = set()
        for f in fields_data:
            dep_client_id = f.get("depends_on_client_id")
            dep_key = client_id_to_key.get(dep_client_id) if dep_client_id else None
            sigs.add(
                self._signature(
                    f["key"],
                    f["field_type"],
                    f["dictionary"].id if f.get("dictionary") else None,
                    f.get("required", False),
                    dep_key,
                    f.get("depends_on_value", ""),
                )
            )
        return sigs

    def _save_fields(self, template, fields_data):
        client_id_to_key = {f["client_id"]: f["key"] for f in fields_data}

        # Pass 1: create/update every field EXCEPT depends_on, so every
        # client_id (new or existing) maps to a real database id before any
        # depends_on FK is resolved in pass 2.
        existing_ids = set(template.fields.values_list("id", flat=True))
        client_id_to_pk = {}
        seen_ids = set()

        for f in fields_data:
            client_id = f["client_id"]
            real_id = (
                int(client_id) if client_id.isdigit() and int(client_id) in existing_ids else None
            )
            common = dict(
                tab_label=f.get("tab_label", ""),
                section_label=f.get("section_label", ""),
                key=f["key"],
                label=f["label"],
                field_type=f["field_type"],
                dictionary=f.get("dictionary"),
                required=f.get("required", False),
                sort_order=f.get("sort_order", 0),
                help_text=f.get("help_text", ""),
                depends_on_value=f.get("depends_on_value", ""),
            )
            if real_id:
                NoteFieldDefinition.objects.filter(id=real_id).update(**common)
                client_id_to_pk[client_id] = real_id
                seen_ids.add(real_id)
            else:
                obj = NoteFieldDefinition.objects.create(template=template, **common)
                client_id_to_pk[client_id] = obj.id
                seen_ids.add(obj.id)

        # A field that existed on this template before but wasn't included
        # in this save has been deleted by the admin -- remove it.
        template.fields.exclude(id__in=seen_ids).delete()

        # Pass 2: every client_id now maps to a real pk -- wire up depends_on.
        for f in fields_data:
            dep_client_id = f.get("depends_on_client_id")
            depends_on_id = client_id_to_pk.get(dep_client_id) if dep_client_id else None
            NoteFieldDefinition.objects.filter(id=client_id_to_pk[f["client_id"]]).update(
                depends_on_id=depends_on_id
            )

        return client_id_to_key

    def create(self, validated_data):
        fields_data = validated_data.pop("fields")
        template = NoteTemplate.objects.create(**validated_data)
        self._save_fields(template, fields_data)
        return template

    def update(self, instance, validated_data):
        fields_data = validated_data.pop("fields", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if fields_data is not None:
            before = self._existing_signatures(instance)
            client_id_to_key = self._save_fields(instance, fields_data)
            after = self._incoming_signatures(fields_data, client_id_to_key)
            if before != after:
                instance.version += 1

        instance.save()
        return instance


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
    #
    # Returns the FROZEN template_snapshot taken when this note was created,
    # never the live template -- so editing a template later via the
    # note-builder configuration UI (Phase 2) can never change how an
    # already-signed note displays. Only falls back to the live template for
    # legacy notes that predate template_snapshot existing at all.
    template_detail = serializers.SerializerMethodField()

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

    def get_template_detail(self, obj):
        if obj.template_snapshot:
            return obj.template_snapshot
        if obj.template_id:
            return NoteTemplateSerializer(obj.template).data
        return None

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

        # Snapshot the template's current version AND full field definitions
        # at creation time so that editing the template later (via the
        # note-builder configuration UI) can never change how this note
        # renders in Note History. Never recompute this from the live
        # template after creation.
        self._sync_template_snapshot(validated_data)

        return super().create(validated_data)

    def update(self, instance, validated_data):
        if instance.status == "signed":
            raise serializers.ValidationError(
                "This note is signed and locked. Create an addendum instead of editing it."
            )
        # A draft can still switch documentation_type/template before it's
        # signed (e.g. the author picked the wrong note type) -- re-snapshot
        # whenever that happens so the note keeps tracking whichever
        # template it's currently pointed at.
        self._sync_template_snapshot(validated_data)
        return super().update(instance, validated_data)

    @staticmethod
    def _sync_template_snapshot(validated_data):
        template = validated_data.get("template")
        if template is not None:
            validated_data["template_version"] = template.version
            validated_data["template_snapshot"] = NoteTemplateSerializer(template).data


class VitalSignsFlowsheetSerializer(serializers.ModelSerializer):
    """
    The one hardcoded "Vital Signs" flowsheet (see VITAL_SIGNS_FLOWSHEET_SECTIONS
    in models.py). `row_definitions` is included on every read so the
    frontend grid renders purely from this response -- it never hardcodes
    the row layout itself, which is what will let a future flowsheet-builder
    swap this constant for a database-backed definition without a frontend
    change.
    """

    patient_name = serializers.SerializerMethodField()
    row_definitions = serializers.SerializerMethodField()

    class Meta:
        model = VitalSignsFlowsheet
        fields = [
            "id",
            "organization",
            "appointment",
            "patient",
            "patient_name",
            "columns",
            "data",
            "row_definitions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "patient", "created_at", "updated_at"]

    def get_patient_name(self, obj):
        return (
            f"{obj.patient.first_name} {obj.patient.last_name}".strip()
            or obj.patient.username
        )

    def get_row_definitions(self, obj):
        return VITAL_SIGNS_FLOWSHEET_SECTIONS

    def validate_columns(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("columns must be a list.")
        return value

    def validate_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("data must be an object.")
        return value

    def create(self, validated_data):
        appointment = validated_data["appointment"]
        validated_data["patient"] = appointment.patient
        validated_data["organization"] = appointment.organization
        return super().create(validated_data)
