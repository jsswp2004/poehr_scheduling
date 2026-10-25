import re

from rest_framework import serializers

from . import hppd

from .models import (
    Staff,
    StaffRecurringPattern,
    StaffShift,
    ShiftCoverageRequirement,
    Unit,
    UnitCensus,
    VALID_DAY_CODES,
)


BASE_SHIFT_TYPES = {"day", "evening", "night", "custom"}
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def normalize_custom_shifts(raw):
    """Validate and normalise a unit's own shift list; returns clean rows with stable keys."""
    if not isinstance(raw, list):
        raise serializers.ValidationError("custom_shifts must be a list.")
    if len(raw) > 6:
        raise serializers.ValidationError("A unit can have at most 6 shifts.")
    out, seen_names, seen_keys = [], set(), set()
    for row in raw:
        if not isinstance(row, dict):
            raise serializers.ValidationError("Each shift needs a name, start and end time.")
        name = str(row.get("name") or "").strip()[:40]
        if not name:
            raise serializers.ValidationError("Every shift needs a name.")
        if name.lower() in seen_names:
            raise serializers.ValidationError(f'Two shifts are named "{name}". Names must be different.')
        seen_names.add(name.lower())
        start, end = str(row.get("start") or "")[:5], str(row.get("end") or "")[:5]
        if not (_TIME_RE.match(start) and _TIME_RE.match(end)):
            raise serializers.ValidationError(f'"{name}" needs start and end times like 08:00.')
        if start == end:
            raise serializers.ValidationError(f'"{name}" starts and ends at the same time.')
        try:
            brk = int(row.get("break_minutes") or 0)
        except (TypeError, ValueError):
            raise serializers.ValidationError(f'"{name}" unpaid break must be a number of minutes.')
        span = (hppd._to_minutes(end) - hppd._to_minutes(start)) % 1440 or 1440
        if brk < 0 or brk >= span:
            raise serializers.ValidationError(f'"{name}" unpaid break must be shorter than the shift.')
        key = str(row.get("key") or "")
        if not re.match(r"^u_[a-z0-9_]{1,17}$", key) or key in seen_keys:
            base = "u_" + (re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_") or "shift")[:14]
            key, n = base, 2
            while key in seen_keys:
                key = f"{base}{n}"[:19]
                n += 1
        seen_keys.add(key)
        out.append({"key": key, "name": name, "start": start, "end": end, "break_minutes": brk})
    return out


class UnitOrgValidationMixin:
    """
    Reject a ``unit`` that belongs to another organization. Without this an
    admin could attach their data to any unit id they guessed. System admins
    are exempt (they work across organizations).
    """

    def to_internal_value(self, data):
        attrs = super().to_internal_value(data)
        # shift_type is a free CharField so a unit's own shifts (keys like "u_regular_day") are
        # accepted; check it against the base codes or that unit's custom shifts.
        st = attrs.get("shift_type")
        if st is not None and st not in BASE_SHIFT_TYPES:
            unit = attrs.get("unit", getattr(self.instance, "unit", None))
            keys = {x["key"] for x in (getattr(unit, "custom_shifts", None) or [])}
            if unit is None or getattr(unit, "shift_pattern", "") != "custom" or st not in keys:
                raise serializers.ValidationError({"shift_type": f'"{st}" is not a valid shift for this unit.'})
        return attrs

    def get_shift_type_display(self, obj):
        return obj.get_shift_type_display()

    def validate_unit(self, value):
        if value is None:
            return value
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or getattr(user, "role", None) == "system_admin":
            return value
        if value.organization_id != getattr(user, "organization_id", None):
            raise serializers.ValidationError("Unit not found.")
        return value


class StaffSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    # profession is free text now (no fixed choices), so "display" is just
    # the value itself -- kept as a field so existing frontend code that
    # reads profession_display keeps working unchanged.
    profession_display = serializers.CharField(source="profession", read_only=True)
    has_login = serializers.SerializerMethodField()
    nursing_role_display = serializers.CharField(
        source="get_nursing_role_display", read_only=True
    )

    class Meta:
        model = Staff
        fields = [
            "id",
            "organization",
            "first_name",
            "last_name",
            "full_name",
            "profession",
            "profession_display",
            "nursing_role",
            "nursing_role_display",
            "email",
            "phone_number",
            "is_active",
            "reminders_enabled",
            "has_login",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "created_at", "updated_at"]

    def get_has_login(self, obj):
        return obj.user_id is not None


class StaffRecurringPatternSerializer(UnitOrgValidationMixin, serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
    unit_name = serializers.CharField(
        source="unit.name", read_only=True, allow_null=True, default=None
    )
    shift_type = serializers.CharField(max_length=20, required=False)
    shift_type_display = serializers.SerializerMethodField()

    class Meta:
        model = StaffRecurringPattern
        fields = [
            "id",
            "organization",
            "staff",
            "staff_name",
            "unit",
            "unit_name",
            "shift_type",
            "shift_type_display",
            "start_time",
            "end_time",
            "days_of_week",
            "start_date",
            "end_date",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "created_at", "updated_at"]

    def validate_days_of_week(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError(
                "days_of_week must be a non-empty list of day codes."
            )
        bad = [code for code in value if code not in VALID_DAY_CODES]
        if bad:
            raise serializers.ValidationError(
                f"Invalid day code(s): {bad}. Valid codes: {sorted(VALID_DAY_CODES)}."
            )
        return value

    def validate(self, attrs):
        start_date = attrs.get(
            "start_date", getattr(self.instance, "start_date", None)
        )
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "end_date cannot be before start_date."}
            )
        return attrs


class StaffShiftSerializer(UnitOrgValidationMixin, serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
    unit_name = serializers.CharField(
        source="unit.name", read_only=True, allow_null=True, default=None
    )
    profession = serializers.CharField(source="staff.profession", read_only=True)
    nursing_role = serializers.CharField(source="staff.nursing_role", read_only=True)
    shift_type = serializers.CharField(max_length=20, required=False)
    shift_type_display = serializers.SerializerMethodField()

    class Meta:
        model = StaffShift
        fields = [
            "id",
            "organization",
            "staff",
            "staff_name",
            "profession",
            "nursing_role",
            "unit",
            "unit_name",
            "date",
            "shift_type",
            "shift_type_display",
            "start_time",
            "end_time",
            "source",
            "recurring_pattern",
            "is_cancelled",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "source", "created_at", "updated_at"]


class StaffCSVRowResultSerializer(serializers.Serializer):
    """Not a model serializer -- just documents the CSV-upload response shape."""

    created = serializers.IntegerField()
    updated = serializers.IntegerField()
    schedules_created = serializers.IntegerField()
    schedules_updated = serializers.IntegerField()
    errors = serializers.ListField(child=serializers.CharField())


class ShiftCoverageRequirementSerializer(UnitOrgValidationMixin, serializers.ModelSerializer):
    shift_type = serializers.CharField(max_length=20, required=False)
    shift_type_display = serializers.SerializerMethodField()
    unit_name = serializers.CharField(
        source="unit.name", read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = ShiftCoverageRequirement
        fields = [
            "id",
            "organization",
            "unit",
            "unit_name",
            "mode",
            "shift_type",
            "shift_type_display",
            "days_of_week",
            "min_staff_required",
            "start_date",
            "end_date",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "created_at", "updated_at"]

    def validate_days_of_week(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError(
                "days_of_week must be a non-empty list of day codes."
            )
        bad = [code for code in value if code not in VALID_DAY_CODES]
        if bad:
            raise serializers.ValidationError(
                f"Invalid day code(s): {bad}. Valid codes: {sorted(VALID_DAY_CODES)}."
            )
        return value

    def validate(self, attrs):
        start_date = attrs.get(
            "start_date", getattr(self.instance, "start_date", None)
        )
        end_date = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start_date and end_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "end_date cannot be before start_date."}
            )
        mode = attrs.get("mode", getattr(self.instance, "mode", "fixed"))
        unit = attrs.get("unit", getattr(self.instance, "unit", None))
        if mode == "hppd" and unit is None:
            raise serializers.ValidationError(
                {"unit": "Pick a unit: HPPD requirements are calculated from a unit's census."}
            )
        return attrs


class UnitSerializer(serializers.ModelSerializer):
    shift_pattern_display = serializers.CharField(
        source="get_shift_pattern_display", read_only=True
    )
    # Filled from one batched lookup in UnitViewSet, so the Units screen can
    # show the latest census without a query per unit.
    latest_census = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = [
            "id",
            "organization",
            "name",
            "shift_pattern",
            "shift_pattern_display",
            "custom_shifts",
            "bed_capacity",
            "is_active",
            "notes",
            "latest_census",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "created_at", "updated_at"]

    def get_latest_census(self, obj):
        entry = (self.context.get("latest_census") or {}).get(obj.id)
        if not entry:
            return None
        return {"date": entry.date.isoformat(), "census": entry.census}

    def validate_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_custom_shifts(self, value):
        return normalize_custom_shifts(value)

    def validate(self, attrs):
        pattern = attrs.get("shift_pattern", getattr(self.instance, "shift_pattern", "8h"))
        shifts = attrs.get("custom_shifts", getattr(self.instance, "custom_shifts", None))
        if pattern == "custom" and not shifts:
            raise serializers.ValidationError({"custom_shifts": "Add at least one shift for custom hours."})
        # organization is server-set, so the model's unique_together is not
        # enforced by DRF automatically; check it here for a clean 400.
        request = self.context.get("request")
        name = attrs.get("name", getattr(self.instance, "name", None))
        org_id = getattr(self.instance, "organization_id", None)
        if org_id is None and request is not None:
            from . import org_scope

            org_id = org_scope.requested_org_id(request, allow_body=True) or request.user.organization_id
        if name and org_id:
            qs = Unit.objects.filter(organization_id=org_id, name__iexact=name)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError(
                    {"name": "A unit with this name already exists."}
                )
        return attrs


class UnitCensusSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source="unit.name", read_only=True)
    entered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = UnitCensus
        fields = [
            "id",
            "unit",
            "unit_name",
            "date",
            "census",
            "notes",
            "entered_by",
            "entered_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["entered_by", "created_at", "updated_at"]
        # A second entry for the same unit+date is an update (handled as an
        # upsert in the view), not a validation error.
        validators = []

    def get_entered_by_name(self, obj):
        user = obj.entered_by
        if user is None:
            return None
        return user.get_full_name() or user.get_username()

    def validate_unit(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or getattr(user, "role", None) == "system_admin":
            return value
        if value.organization_id != getattr(user, "organization_id", None):
            raise serializers.ValidationError("Unit not found.")
        return value
