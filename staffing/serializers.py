from rest_framework import serializers

from .models import (
    Staff,
    StaffRecurringPattern,
    StaffShift,
    ShiftCoverageRequirement,
    Unit,
    UnitCensus,
    VALID_DAY_CODES,
)


class UnitOrgValidationMixin:
    """
    Reject a ``unit`` that belongs to another organization. Without this an
    admin could attach their data to any unit id they guessed. System admins
    are exempt (they work across organizations).
    """

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
    shift_type_display = serializers.CharField(
        source="get_shift_type_display", read_only=True
    )

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
    shift_type_display = serializers.CharField(
        source="get_shift_type_display", read_only=True
    )

    class Meta:
        model = StaffShift
        fields = [
            "id",
            "organization",
            "staff",
            "staff_name",
            "profession",
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
    shift_type_display = serializers.CharField(
        source="get_shift_type_display", read_only=True
    )
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

    def validate(self, attrs):
        # organization is server-set, so the model's unique_together is not
        # enforced by DRF automatically; check it here for a clean 400.
        request = self.context.get("request")
        name = attrs.get("name", getattr(self.instance, "name", None))
        org_id = getattr(self.instance, "organization_id", None)
        if org_id is None and request is not None:
            user = request.user
            if user.role == "system_admin" and request.data.get("organization"):
                org_id = request.data.get("organization")
            else:
                org_id = user.organization_id
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
