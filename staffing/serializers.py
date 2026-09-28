from rest_framework import serializers

from .models import (
    Staff,
    StaffRecurringPattern,
    StaffShift,
    ShiftCoverageRequirement,
    VALID_DAY_CODES,
)


class StaffSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    # profession is free text now (no fixed choices), so "display" is just
    # the value itself -- kept as a field so existing frontend code that
    # reads profession_display keeps working unchanged.
    profession_display = serializers.CharField(source="profession", read_only=True)

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
            "email",
            "phone_number",
            "is_active",
            "reminders_enabled",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["organization", "created_at", "updated_at"]


class StaffRecurringPatternSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
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


class StaffShiftSerializer(serializers.ModelSerializer):
    staff_name = serializers.CharField(source="staff.full_name", read_only=True)
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


class ShiftCoverageRequirementSerializer(serializers.ModelSerializer):
    shift_type_display = serializers.CharField(
        source="get_shift_type_display", read_only=True
    )

    class Meta:
        model = ShiftCoverageRequirement
        fields = [
            "id",
            "organization",
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
        return attrs
