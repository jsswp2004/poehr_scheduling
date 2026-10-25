from django.urls import path
from rest_framework.routers import DefaultRouter

from .assistant import AssistantActionCancelView, AssistantActionConfirmView, AssistantMessageView
from .availability_views import AvailabilityView
from .compliance_views import CoverageStatusView, OrgLocationView
from .master_schedule_autocreate import MasterScheduleCreateScheduleView
from .master_schedule_csv import MasterScheduleCsvTemplateView, MasterScheduleUploadCsvView
from .daily_reports_views import DailyStaffingReportView
from .pickup_views import MyPickupProfileView, PickUpShiftView
from .master_schedule_views import (
    MasterScheduleCellsView,
    MasterScheduleCopyMonthView,
    MasterScheduleRowDetailView,
    MasterScheduleRowsView,
    MasterScheduleSectionDetailView,
    MasterScheduleSectionsView,
    MasterScheduleSettingsView,
    MasterScheduleView,
)
from .rules_views import (
    RuleAuditView,
    RuleDetailView,
    RuleDuplicateView,
    RuleSelectionView,
    RuleUnitsView,
    RulesListCreateView,
)
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
    path("assistant/message/", AssistantMessageView.as_view(), name="staffing-assistant-message"),
    path(
        "assistant/actions/<uuid:pk>/confirm/",
        AssistantActionConfirmView.as_view(),
        name="staffing-assistant-action-confirm",
    ),
    path(
        "assistant/actions/<uuid:pk>/cancel/",
        AssistantActionCancelView.as_view(),
        name="staffing-assistant-action-cancel",
    ),
    path("master-schedule/", MasterScheduleView.as_view(), name="staffing-master-schedule"),
    path("master-schedule/settings/", MasterScheduleSettingsView.as_view(), name="staffing-master-schedule-settings"),
    path("master-schedule/sections/", MasterScheduleSectionsView.as_view(), name="staffing-master-schedule-sections"),
    path("master-schedule/sections/<int:pk>/", MasterScheduleSectionDetailView.as_view(), name="staffing-master-schedule-section"),
    path("master-schedule/rows/", MasterScheduleRowsView.as_view(), name="staffing-master-schedule-rows"),
    path("master-schedule/rows/<int:pk>/", MasterScheduleRowDetailView.as_view(), name="staffing-master-schedule-row"),
    path("master-schedule/copy/", MasterScheduleCopyMonthView.as_view(), name="staffing-master-schedule-copy"),
    path("master-schedule/create-schedule/", MasterScheduleCreateScheduleView.as_view(), name="staffing-master-schedule-create-schedule"),
    path("master-schedule/csv/", MasterScheduleCsvTemplateView.as_view(), name="staffing-master-schedule-csv"),
    path("master-schedule/upload-csv/", MasterScheduleUploadCsvView.as_view(), name="staffing-master-schedule-upload-csv"),
    path("master-schedule/cells/", MasterScheduleCellsView.as_view(), name="staffing-master-schedule-cells"),
    path("daily-reports/<str:kind>/pdf/", DailyStaffingReportView.as_view(), name="staffing-daily-report-pdf"),
    path("coverage-status/", CoverageStatusView.as_view(), name="staffing-coverage-status"),
    path("availability/", AvailabilityView.as_view(), name="staffing-availability"),
    path("location/", OrgLocationView.as_view(), name="staffing-location"),
    path("rules/", RulesListCreateView.as_view(), name="staffing-rules"),
    path("rules/selection/", RuleSelectionView.as_view(), name="staffing-rules-selection"),
    path("rules/<int:pk>/units/", RuleUnitsView.as_view(), name="staffing-rule-units"),
    path("rules/<int:pk>/", RuleDetailView.as_view(), name="staffing-rule-detail"),
    path("rules/<int:pk>/duplicate/", RuleDuplicateView.as_view(), name="staffing-rule-duplicate"),
    path("rules/<int:pk>/audit/", RuleAuditView.as_view(), name="staffing-rule-audit"),
    path("me/pickup/", MyPickupProfileView.as_view(), name="staffing-me-pickup"),
    path("me/pick-up-shift/", PickUpShiftView.as_view(), name="staffing-me-pick-up-shift"),
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
