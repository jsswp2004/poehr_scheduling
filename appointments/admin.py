from django.contrib import admin
from .models import Appointment, Availability, ClinicEvent

admin.site.register(Appointment)
admin.site.register(Availability)
admin.site.register(ClinicEvent)
