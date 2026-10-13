from django.contrib import admin

from .models import AssistantMessage, Staff, StaffRecurringPattern, StaffShift, Unit, UnitCensus


@admin.register(Staff)
class StaffAdmin(admin.ModelAdmin):
    list_display = ("full_name", "profession", "nursing_role", "organization", "is_active", "email", "phone_number")
    list_filter = ("organization", "profession", "nursing_role", "is_active")
    search_fields = ("first_name", "last_name", "email")


@admin.register(StaffRecurringPattern)
class StaffRecurringPatternAdmin(admin.ModelAdmin):
    list_display = ("staff", "shift_type", "days_of_week", "start_date", "end_date", "is_active")
    list_filter = ("organization", "shift_type", "is_active")
    search_fields = ("staff__first_name", "staff__last_name")


@admin.register(StaffShift)
class StaffShiftAdmin(admin.ModelAdmin):
    list_display = ("staff", "date", "shift_type", "source", "is_cancelled")
    list_filter = ("organization", "shift_type", "source", "is_cancelled")
    search_fields = ("staff__first_name", "staff__last_name")
    date_hierarchy = "date"


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "shift_pattern", "is_active")
    list_filter = ("organization", "shift_pattern", "is_active")
    search_fields = ("name",)


@admin.register(UnitCensus)
class UnitCensusAdmin(admin.ModelAdmin):
    list_display = ("unit", "date", "census", "entered_by")
    list_filter = ("unit__organization", "unit")
    date_hierarchy = "date"


from .models import StaffTimeOffRequest  # noqa: E402


@admin.register(StaffTimeOffRequest)
class StaffTimeOffRequestAdmin(admin.ModelAdmin):
    list_display = ("staff", "kind", "status", "start_date", "end_date", "organization", "alert_sent_at")
    list_filter = ("organization", "kind", "status")
    search_fields = ("staff__first_name", "staff__last_name", "reason")
    date_hierarchy = "start_date"


from .models import OrgStaffingRule, StaffingRule, StaffingRuleAudit  # noqa: E402


@admin.register(StaffingRule)
class StaffingRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "state", "organization", "hppd_min", "status", "needs_verification", "updated_at")
    list_filter = ("status", "needs_verification", "state")
    search_fields = ("name", "state")


@admin.register(StaffingRuleAudit)
class StaffingRuleAuditAdmin(admin.ModelAdmin):
    list_display = ("rule_name", "action", "changed_by", "changed_at")
    list_filter = ("action",)
    readonly_fields = ("rule", "rule_name", "organization", "action", "changes", "changed_by", "changed_at")


admin.site.register(OrgStaffingRule)


@admin.register(AssistantMessage)
class AssistantMessageAdmin(admin.ModelAdmin):
    """Read-only support/audit log of assistant conversations."""

    list_display = ("created_at", "user", "user_role", "organization", "short_question", "error")
    list_filter = ("organization", "user_role")
    search_fields = ("question", "answer", "user__username")
    date_hierarchy = "created_at"

    def short_question(self, obj):
        return obj.question[:80]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
