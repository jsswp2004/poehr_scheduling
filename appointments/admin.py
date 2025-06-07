from django.contrib import admin
from .models import Appointment, Availability, ClinicEvent, AutoEmail, EnvironmentSetting, Holiday

admin.site.register(Appointment)
admin.site.register(Availability)
admin.site.register(ClinicEvent)
admin.site.register(AutoEmail)
admin.site.register(EnvironmentSetting)
admin.site.register(Holiday)
