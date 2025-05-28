from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, Organization, Patient  # ✅ Include Patient

class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = (
        'username', 'email', 'first_name', 'last_name', 'role', 'organization', 'is_active', 'is_staff'
    )  # <-- Shows organization
    list_filter = ('role', 'organization', 'is_active', 'is_staff')  # <-- Filter by org and role
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('role', 'provider', 'organization')}), # <-- Show these on detail view
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Custom Fields', {'fields': ('role', 'provider', 'organization')}), # <-- Show these on add form
    )

admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(Organization)

@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('user', 'date_of_birth', 'phone_number')
    search_fields = ('user__username', 'user__first_name', 'user__last_name')
