from django.contrib import admin

from .models import Staff, StaffRecurringPattern, StaffShift, Unit, UnitCensus


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
