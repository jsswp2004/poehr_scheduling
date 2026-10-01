from django.urls import path
from rest_framework.routers import DefaultRouter

from .compliance_views import CoverageStatusView, OrgLocationView
from .timeoff_views import (
    MyTimeOffView,
    MyTimeOffCancelView,
    TimeOffListCreateView,
    TimeOffDecideView,
    TimeOffResolveView,
    TimeOffCoverCandidatesView,
)
from .views import (
    StaffRecurringPatternViewSet,
    StaffShiftViewSet,
    StaffViewSet,
    ShiftCoverageRequirementViewSet,
    UnitViewSet,
    UnitCensusViewSet,
    UploadStaffCSV,
    SendStaffMessageView,
    InviteStaffView,
    AcceptStaffInviteView,
    MyStaffProfileView,
    MyShiftsView,
    UnscheduledStaffReportView,
    LaborHoursReportView,
    CoverageComplianceReportView,
    MessageDeliveryLogReportView,
    ShiftDistributionReportView,
)

router = DefaultRouter()
router.register(r"staff", StaffViewSet, basename="staffing-staff")
router.register(
    r"recurring-patterns", StaffRecurringPatternViewSet, basename="staffing-recurring-pattern"
)
router.register(r"shifts", StaffShiftViewSet, basename="staffing-shift")
router.register(r"units", UnitViewSet, basename="staffing-unit")
router.register(r"census", UnitCensusViewSet, basename="staffing-census")
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
    path(
        "staff/<int:staff_id>/invite/",
        InviteStaffView.as_view(),
        name="staffing-staff-invite",
    ),
    path(
        "accept-invite/<str:uidb64>/<str:token>/",
        AcceptStaffInviteView.as_view(),
        name="staffing-accept-invite",
    ),
    path("coverage-status/", CoverageStatusView.as_view(), name="staffing-coverage-status"),
    path("location/", OrgLocationView.as_view(), name="staffing-location"),
    path("me/time-off/", MyTimeOffView.as_view(), name="staffing-me-time-off"),
    path("me/time-off/<int:pk>/cancel/", MyTimeOffCancelView.as_view(), name="staffing-me-time-off-cancel"),
    path("time-off/", TimeOffListCreateView.as_view(), name="staffing-time-off"),
    path("time-off/<int:pk>/decide/", TimeOffDecideView.as_view(), name="staffing-time-off-decide"),
    path("time-off/<int:pk>/resolve/", TimeOffResolveView.as_view(), name="staffing-time-off-resolve"),
    path(
        "time-off/<int:pk>/cover-candidates/",
        TimeOffCoverCandidatesView.as_view(),
        name="staffing-time-off-cover-candidates",
    ),
    path("me/", MyStaffProfileView.as_view(), name="staffing-me"),
    path("me/shifts/", MyShiftsView.as_view(), name="staffing-me-shifts"),
    path(
        "reports/unscheduled/",
        UnscheduledStaffReportView.as_view(),
        name="staffing-report-unscheduled",
    ),
    path(
        "reports/labor-hours/",
        LaborHoursReportView.as_view(),
        name="staffing-report-labor-hours",
    ),
    path(
        "reports/coverage-compliance/",
        CoverageComplianceReportView.as_view(),
        name="staffing-report-coverage-compliance",
    ),
    path(
        "reports/message-log/",
        MessageDeliveryLogReportView.as_view(),
        name="staffing-report-message-log",
    ),
    path(
        "reports/shift-distribution/",
        ShiftDistributionReportView.as_view(),
        name="staffing-report-shift-distribution",
    ),
] + router.urls
