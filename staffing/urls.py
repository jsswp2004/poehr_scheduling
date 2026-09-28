from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    StaffRecurringPatternViewSet,
    StaffShiftViewSet,
    StaffViewSet,
    UploadStaffCSV,
)

router = DefaultRouter()
router.register(r"staff", StaffViewSet, basename="staffing-staff")
router.register(
    r"recurring-patterns", StaffRecurringPatternViewSet, basename="staffing-recurring-pattern"
)
router.register(r"shifts", StaffShiftViewSet, basename="staffing-shift")

# The CSV-upload path must be listed BEFORE router.urls: DefaultRouter's
# detail route (staff/<pk>/) would otherwise match "staff/upload-csv/"
# first, treating "upload-csv" as a pk and rejecting POST with 405.
urlpatterns = [
    path("staff/upload-csv/", UploadStaffCSV.as_view(), name="staffing-staff-upload-csv"),
] + router.urls
