from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import AppointmentViewSet, doctor_available_slots  # ⬅️ import the new view

router = DefaultRouter()
router.register(r'appointments', AppointmentViewSet, basename='appointment')

urlpatterns = router.urls + [
    # ⬇️ custom endpoint for doctor availability
    path('doctors/<int:doctor_id>/available-dates/', doctor_available_slots, name='doctor-available-dates'),
]
