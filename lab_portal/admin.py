from django.contrib import admin

from .models import ClinicLab, LabRequest, PartnerLab, PartnerLabStaff


@admin.register(PartnerLab)
class PartnerLabAdmin(admin.ModelAdmin):
    list_display = ("name", "country", "license_number", "license_expiry", "status")
    list_filter = ("country", "status")
    search_fields = ("name", "license_number", "city")


@admin.register(PartnerLabStaff)
class PartnerLabStaffAdmin(admin.ModelAdmin):
    list_display = ("full_name", "partner", "license_number", "is_pathologist", "can_release", "is_active")
    search_fields = ("full_name", "license_number")


@admin.register(ClinicLab)
class ClinicLabAdmin(admin.ModelAdmin):
    list_display = ("name", "organization", "mode", "partner", "is_default", "is_active")


@admin.register(LabRequest)
class LabRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "organization", "partner", "status", "priority", "created_at")
    list_filter = ("status", "priority")
    readonly_fields = ("claim_code",)
