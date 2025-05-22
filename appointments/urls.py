from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import EnvironmentSettingView, AppointmentViewSet, doctor_available_slots, AvailabilityViewSet  # ⬅️ import the new view

router = DefaultRouter()
router.register(r'appointments', AppointmentViewSet, basename='appointment')
router.register(r'availability', AvailabilityViewSet, basename='availability')

urlpatterns = router.urls + [
    # ⬇️ custom endpoint for doctor availability
    path('doctors/<int:doctor_id>/available-dates/', doctor_available_slots, name='doctor-available-dates'),
    path('settings/environment/', EnvironmentSettingView.as_view(), name='environment-setting'),
]
