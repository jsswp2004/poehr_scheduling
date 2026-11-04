from rest_framework import serializers

from appointments.models import Facility
from users.models import CustomUser, Patient, Registration

from .models import (
    CASE_TYPE_CHOICES,
    PARTICIPANT_ROLES,
    TIME_FIELDS,
    CHARGE_POLICY_TYPES,
    DOCUMENT_CATEGORIES,
    DOCUMENT_MAX_BYTES,
    DOCUMENT_TYPES,
    USAGE_CATEGORIES,
    CaseParticipant,
    CaseProcedure,
    SurgeryCase,
    SurgeryRoom,
)


class ProcedureIn(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    laterality = serializers.ChoiceField(
        choices=[c[0] for c in CaseProcedure.LATERALITY_CHOICES], required=False, allow_blank=True, default=""
    )
    cpt_code = serializers.CharField(max_length=10, required=False, allow_blank=True, default="")
    is_primary = serializers.BooleanField(required=False, default=False)


class CaseWriteSerializer(serializers.Serializer):
    """Booking and editing a case. Everything is checked against the caller's organization."""

    facility = serializers.PrimaryKeyRelatedField(queryset=Facility.objects.none(), required=False)
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none(), required=False)
    visit = serializers.PrimaryKeyRelatedField(queryset=Registration.objects.none(), required=False, allow_null=True)
    room = serializers.PrimaryKeyRelatedField(queryset=SurgeryRoom.objects.none(), required=False, allow_null=True)
    surgeon = serializers.PrimaryKeyRelatedField(queryset=CustomUser.objects.none(), required=False, allow_null=True)
    scheduled_start = serializers.DateTimeField(required=False)
    duration_minutes = serializers.IntegerField(required=False, min_value=5, max_value=1440)
    service = serializers.CharField(max_length=80, required=False, allow_blank=True)
    case_type = serializers.ChoiceField(choices=[c[0] for c in CASE_TYPE_CHOICES], required=False)
    anesthesia_type = serializers.CharField(max_length=60, required=False, allow_blank=True)
    comments = serializers.CharField(required=False, allow_blank=True)
    procedures = ProcedureIn(many=True, required=False)
    # Case Header
    planned_start = serializers.DateTimeField(required=False, allow_null=True)
    scheduled_delay_reason = serializers.CharField(max_length=120, required=False, allow_blank=True)
    planned_delay_reason = serializers.CharField(max_length=120, required=False, allow_blank=True)
    requires_review = serializers.BooleanField(required=False)
    review_reason = serializers.CharField(required=False, allow_blank=True)
    physical_status = serializers.CharField(max_length=20, required=False, allow_blank=True)
    block_id = serializers.CharField(max_length=60, required=False, allow_blank=True)
    booking_comments_2 = serializers.CharField(required=False, allow_blank=True)
    procedure_notes = serializers.CharField(required=False, allow_blank=True)
    provider_notes = serializers.CharField(required=False, allow_blank=True)
    time_reasons = serializers.DictField(child=serializers.CharField(max_length=120, allow_blank=True), required=False)

    def validate_time_reasons(self, value):
        bad = [k for k in value if k not in TIME_FIELDS]
        if bad:
            raise serializers.ValidationError(f"Unknown time: {', '.join(bad)}.")
        return {k: v for k, v in value.items() if v}

    def __init__(self, *args, org=None, allowed_facilities=None, **kwargs):
        super().__init__(*args, **kwargs)
        for f in TIME_FIELDS:
            self.fields[f] = serializers.DateTimeField(required=False, allow_null=True)
        if org is not None:
            facilities = Facility.objects.filter(organization=org)
            if allowed_facilities is not None:
                facilities = facilities.filter(pk__in=allowed_facilities)
            self.fields["facility"].queryset = facilities
            self.fields["patient"].queryset = Patient.objects.filter(organization=org)
            self.fields["visit"].queryset = Registration.objects.filter(patient__organization=org)
            self.fields["room"].queryset = SurgeryRoom.objects.filter(facility__organization=org, is_active=True)
            self.fields["surgeon"].queryset = CustomUser.objects.filter(organization=org, role="doctor")

    def validate(self, attrs):
        case = self.instance
        facility = attrs.get("facility") or (case.facility if case else None)
        room = attrs["room"] if "room" in attrs else (case.room if case else None)
        patient = attrs.get("patient") or (case.patient if case else None)
        visit = attrs["visit"] if "visit" in attrs else (case.visit if case else None)
        if case is None:
            missing = {f: "This field is required." for f in ("patient", "scheduled_start") if f not in attrs}
            if missing:
                raise serializers.ValidationError(missing)
            if facility is None and room is not None:
                facility = attrs["facility"] = room.facility
            if facility is None:
                raise serializers.ValidationError({"facility": "This field is required."})
        if room is not None and facility is not None and room.facility_id != facility.pk:
            raise serializers.ValidationError({"room": "That room belongs to a different facility."})
        if visit is not None and patient is not None and visit.patient_id != patient.pk:
            raise serializers.ValidationError({"visit": "That visit belongs to a different patient."})
        if attrs.get("requires_review") is False:
            attrs.setdefault("review_reason", "")
        # milestone times must not run backwards
        times = {f: attrs[f] if f in attrs else getattr(case, f, None) for f in TIME_FIELDS}
        previous_name, previous = None, None
        for name in TIME_FIELDS:
            value = times[name]
            if value is None:
                continue
            if previous is not None and value < previous:
                label = lambda n: n.replace("_", " ")
                raise serializers.ValidationError({name: f"{label(name).capitalize()} cannot be before {label(previous_name)}."})
            previous_name, previous = name, value
        return attrs


class ParticipantWriteSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[r[0] for r in PARTICIPANT_ROLES], required=False)
    user = serializers.PrimaryKeyRelatedField(queryset=CustomUser.objects.none(), required=False, allow_null=True)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    time_in = serializers.DateTimeField(required=False, allow_null=True)
    time_out = serializers.DateTimeField(required=False, allow_null=True)
    comments = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def __init__(self, *args, org=None, **kwargs):
        super().__init__(*args, **kwargs)
        if org is not None:
            self.fields["user"].queryset = CustomUser.objects.filter(organization=org, is_active=True).exclude(
                role__in=["patient", "staff"]
            )

    def validate(self, attrs):
        row = self.instance
        if row is None and "role" not in attrs:
            raise serializers.ValidationError({"role": "This field is required."})
        user = attrs["user"] if "user" in attrs else (row.user if row else None)
        name = attrs["name"] if "name" in attrs else (row.name if row else "")
        if user is None and not name.strip():
            raise serializers.ValidationError({"user": "Pick a person, or type a name."})
        t_in = attrs["time_in"] if "time_in" in attrs else (row.time_in if row else None)
        t_out = attrs["time_out"] if "time_out" in attrs else (row.time_out if row else None)
        if t_in and t_out and t_out < t_in:
            raise serializers.ValidationError({"time_out": "Time out cannot be before time in."})
        return attrs


class UsageWriteSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=[c[0] for c in USAGE_CATEGORIES], required=False)
    name = serializers.CharField(max_length=200, required=False)
    catalog_number = serializers.CharField(max_length=60, required=False, allow_blank=True)
    total = serializers.IntegerField(min_value=0, max_value=999, required=False)
    hold = serializers.IntegerField(min_value=0, max_value=999, required=False)
    wasted = serializers.IntegerField(min_value=0, max_value=999, required=False)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)
    charge_code = serializers.CharField(max_length=120, required=False, allow_blank=True)
    department = serializers.CharField(max_length=80, required=False, allow_blank=True)

    def validate(self, attrs):
        row = self.instance
        if row is None and not str(attrs.get("name", "")).strip():
            raise serializers.ValidationError({"name": "This field is required."})
        if "name" in attrs and not attrs["name"].strip():
            raise serializers.ValidationError({"name": "Name cannot be blank."})
        get = lambda f, d: attrs[f] if f in attrs else (getattr(row, f) if row else d)
        if get("hold", 0) + get("wasted", 0) > get("total", 1):
            raise serializers.ValidationError({"total": "Hold plus wasted cannot be more than the total."})
        return attrs


class CardItemIn(serializers.Serializer):
    category = serializers.ChoiceField(choices=[c[0] for c in USAGE_CATEGORIES], default="OTHER")
    name = serializers.CharField(max_length=200)
    catalog_number = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    quantity = serializers.IntegerField(min_value=1, max_value=999, default=1)
    charge_code = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    department = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")


class CardWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    procedure_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    pre_op_notes = serializers.CharField(required=False, allow_blank=True)
    post_op_notes = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    items = CardItemIn(many=True, required=False)


class PolicyWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    policy_type = serializers.ChoiceField(choices=[c[0] for c in CHARGE_POLICY_TYPES if c[0] != "usage"], required=False)
    time_basis = serializers.ChoiceField(choices=["or", "anesthesia"], required=False)
    first_code = serializers.CharField(max_length=120)
    first_minutes = serializers.IntegerField(min_value=1, max_value=600, required=False)
    extra_code = serializers.CharField(max_length=120, required=False, allow_blank=True)
    extra_minutes = serializers.IntegerField(min_value=1, max_value=600, required=False)
    description = serializers.CharField(max_length=120, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class ChargeWriteSerializer(serializers.Serializer):
    charge_code = serializers.CharField(max_length=120, required=False)
    description = serializers.CharField(max_length=200, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, max_value=999, required=False)
    item_charge = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True)

    def validate(self, attrs):
        if self.instance is None and not str(attrs.get("charge_code", "")).strip():
            raise serializers.ValidationError({"charge_code": "This field is required."})
        return attrs


class PriceWriteSerializer(serializers.Serializer):
    charge_code = serializers.CharField(max_length=60)
    description = serializers.CharField(max_length=200, required=False, allow_blank=True)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class DocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=160, required=False, allow_blank=True)
    category = serializers.ChoiceField(choices=[c[0] for c in DOCUMENT_CATEGORIES], required=False, default="other")

    def validate_file(self, f):
        name = (f.name or "").lower()
        ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""
        if ext not in DOCUMENT_TYPES:
            raise serializers.ValidationError("Only PDF, PNG and JPEG files can be uploaded.")
        if f.size > DOCUMENT_MAX_BYTES:
            raise serializers.ValidationError(f"That file is larger than {DOCUMENT_MAX_BYTES // (1024 * 1024)} MB.")
        if f.size == 0:
            raise serializers.ValidationError("That file is empty.")
        head = f.read(8)
        f.seek(0)
        if not head.startswith(DOCUMENT_TYPES[ext][1]):  # the name says one thing, the contents another
            raise serializers.ValidationError("That file is not a real " + ext[1:].upper() + ".")
        return f
