from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    StaffRecurringPatternViewSet,
    StaffShiftViewSet,
    StaffViewSet,
    ShiftCoverageRequirementViewSet,
    UploadStaffCSV,
    SendStaffMessageView,
)

router = DefaultRouter()
router.register(r"staff", StaffViewSet, basename="staffing-staff")
router.register(
    r"recurring-patterns", StaffRecurringPatternViewSet, basename="staffing-recurring-pattern"
)
router.register(r"shifts", StaffShiftViewSet, basename="staffing-shift")
router.register(
    r"coverage-requirements", ShiftCoverageRequirementViewSet, basename="staffing-coverage-requirement"
)

# The CSV-upload and send-message paths must be listed BEFORE router.urls:
# DefaultRouter's detail route (staff/<pk>/) would otherwise match
# "staff/upload-csv/" first, treating "upload-csv" as a pk and rejecting
# POST with 405 (same reasoning applies to staff/<id>/send-message/, which
# is registered as its own path rather than a router @action for clarity).
urlpatterns = [
    path("staff/upload-csv/", UploadStaffCSV.as_view(), name="staffing-staff-upload-csv"),
    path(
        "staff/<int:staff_id>/send-message/",
        SendStaffMessageView.as_view(),
        name="staffing-staff-send-message",
    ),
] + router.urls
