from django.contrib import admin

from .models import CaseHistory, CaseProcedure, SurgeryCase, SurgeryRoom

admin.site.register(SurgeryRoom)
admin.site.register(SurgeryCase)
admin.site.register(CaseProcedure)
admin.site.register(CaseHistory)
