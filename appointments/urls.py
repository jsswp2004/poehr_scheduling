from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import DownloadClinicEventsTemplate, UploadClinicEventsCSV, EnvironmentSettingView, AppointmentViewSet, doctor_available_slots, AvailabilityViewSet, HolidayViewSet, ClinicEventViewSet, DownloadAvailabilityTemplate, UploadAvailabilityCSV, RunWeeklyPatientRemindersView, RunPatientRemindersNowView, AutoEmailViewSet  # ⬅️ import the new view

router = DefaultRouter()
router.register(r'clinic-events', ClinicEventViewSet, basename='clinicevent')
router.register(r'appointments', AppointmentViewSet, basename='appointment')
router.register(r'availability', AvailabilityViewSet, basename='availability')
router.register(r'holidays', HolidayViewSet)
router.register(r'auto-email', AutoEmailViewSet, basename='autoemail')

urlpatterns = [
    # ⬇️ custom endpoint for doctor availability
    path('doctors/<int:doctor_id>/available-dates/', doctor_available_slots, name='doctor-available-dates'),
    path('settings/environment/', EnvironmentSettingView.as_view(), name='environment-setting'),
    path('upload/clinic-events/template/', DownloadClinicEventsTemplate.as_view(), name='download-clinic-events-template'),
    path('upload/clinic-events/', UploadClinicEventsCSV.as_view(), name='upload-clinic-events'),
    path('availability/download-template/', DownloadAvailabilityTemplate.as_view(), name='download-availability-template'),
    path('availability/upload-csv/', UploadAvailabilityCSV.as_view(), name='upload-availability-csv'),
    path('run-weekly-patient-reminders/', RunWeeklyPatientRemindersView.as_view(), name='run-weekly-patient-reminders'),
    path('run-patient-reminders-now/', RunPatientRemindersNowView.as_view(), name='run-patient-reminders-now'),
]+ router.urls
