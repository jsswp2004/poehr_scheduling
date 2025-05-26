from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser,Organization, Patient  # ✅ Include Patient

class CustomUserAdmin(UserAdmin):
    model = CustomUser
    list_display = ('username', 'email', 'first_name', 'last_name', 'role', 'is_active', 'is_staff')
    list_filter = ('role', 'is_active', 'is_staff')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('role', 'provider')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Custom Fields', {'fields': ('role', 'provider')}),
    )

admin.site.register(CustomUser, CustomUserAdmin)
admin.site.register(Organization)
@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ('user', 'date_of_birth', 'phone_number')
    search_fields = ('user__username', 'user__first_name', 'user__last_name')
