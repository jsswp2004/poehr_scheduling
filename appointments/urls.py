from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import (
    DownloadClinicEventsTemplate,
    UploadClinicEventsCSV,
    EnvironmentSettingView,
    SMSSettingView,
    AppointmentViewSet,
    doctor_available_slots,
    AvailabilityViewSet,
    HolidayViewSet,
    ClinicEventViewSet,
    DownloadAvailabilityTemplate,
    UploadAvailabilityCSV,
    RunWeeklyPatientRemindersView,
    RunPatientRemindersNowView,
    RunPatientSMSRemindersNowView,
    RunScheduledJobsView,
    RunStaffingHourlyJobsView,
    AutoEmailViewSet,
    update_appointment_status,
    CheckInSearchView,
    CheckInStatusUpdateView,
    ClinicalNoteViewSet,
    VitalSignsFlowsheetViewSet,
    FlowsheetTemplateViewSet,
    FlowsheetTemplateAdminViewSet,
    NoteTemplateViewSet,
    NoteTemplateAdminViewSet,
    DictionaryAdminViewSet,
    OrderViewSet,
    OrderableViewSet,
    OrderSetViewSet,
    OrderableAdminViewSet,
    OrderSetAdminViewSet,
)  # ⬅️ import the new SMS view and check-in views
from .analytics_views import AnalyticsReportView, ExportReportView
from .icd10 import Icd10SearchView
from .lab_views import LabReportViewSet
from .locations import BedHoldView, LocationItemView, LocationTreeView
from .chart_tabs import ChartTabsView, MyChartTabsView, OrgChartTabsView
from .my_schedule import MyScheduleView
from . import allergies as allergy_views
from .referral_views import (
    DestinationDetailView,
    DestinationListCreateView,
    ReferralActionView,
    ReferralDetailView,
    ReferralListCreateView,
    ReferralMetaView,
    ReferralQueuesView,
    ReferralSettingsView,
)
from .patient_header import (
    HeaderConfigView,
    HeaderFieldViewSet,
    PatientAllergiesView,
    PatientAllergyDetailView,
    PatientAllergyStatusView,
    PatientHeaderValuesView,
    PatientHeaderView,
)
from .lab_interface_views import LabInboundMessageViewSet, LabUsageView, fhir_intake, hl7_intake, orders_ack, orders_pull

# Debug import
from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta
from .models import Appointment, AutoEmail, AutoSMS
from users.models import Organization
from django.contrib.auth import get_user_model


def debug_sms_logs(request):
    """Debug endpoint to check SMS logs and phone number formatting"""
    try:
        from communicator.models import MessageLog
        from communicator.utils import format_phone_to_international

        data = {"recent_sms_logs": [], "phone_formatting_test": []}

        # Get recent SMS logs
        sms_logs = MessageLog.objects.filter(message_type="sms").order_by(
            "-created_at"
        )[:10]

        for log in sms_logs:
            data["recent_sms_logs"].append(
                {
                    "id": log.id,
                    "recipient": log.recipient,
                    "status": log.status,
                    "organization": log.organization.name if log.organization else None,
                    "created_at": str(log.created_at),
                    "message_preview": (
                        log.body[:100] + "..." if len(log.body) > 100 else log.body
                    ),
                    "provider_id": log.provider_id,
                }
            )

        # Test phone number formatting with the numbers we saw in logs
        test_numbers = ["546.865.8964", "366.890.4152", "5468658964", "3668904152"]

        for num in test_numbers:
            formatted = format_phone_to_international(num)
            data["phone_formatting_test"].append(
                {"original": num, "formatted": formatted}
            )

        return JsonResponse(data)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


def debug_sms_data(request):
    """Debug endpoint to check SMS data in Azure"""
    try:
        today = timezone.now().date()
        next_week = today + timedelta(days=7)
        User = get_user_model()

        data = {
            "current_date": str(today),
            "date_range": f"{today} to {next_week}",
            "current_weekday": timezone.now().weekday(),
        }

        # Check AutoSMS configs (this debug endpoint is specifically about
        # SMS, which since the fully-separate-configs change has its own
        # AutoSMS model independent of AutoEmail)
        active_configs = AutoSMS.objects.filter(is_active=True)
        data["active_configs"] = []

        for config in active_configs:
            config_data = {
                "id": config.id,
                "organization": (
                    config.organization.name if config.organization else None
                ),
                "frequency": config.auto_message_frequency,
                "day_of_week": config.auto_message_day_of_week,
                "start_date": (
                    str(config.auto_message_start_date)
                    if config.auto_message_start_date
                    else None
                ),
            }

            # Get appointments for this config
            if config.organization:
                appointments = Appointment.all_objects.filter(
                    appointment_datetime__date__gte=today,
                    appointment_datetime__date__lte=next_week,
                    organization=config.organization,
                ).select_related("patient")
            else:
                appointments = Appointment.all_objects.filter(
                    appointment_datetime__date__gte=today,
                    appointment_datetime__date__lte=next_week,
                ).select_related("patient")

            config_data["appointments_count"] = appointments.count()
            config_data["appointments"] = []

            for appt in appointments:
                patient = appt.patient
                if patient:
                    config_data["appointments"].append(
                        {
                            "id": appt.id,
                            "patient_name": f"{patient.first_name} {patient.last_name}",
                            "phone": patient.phone_number,
                            "email": patient.email,
                            "appointment_date": str(appt.appointment_datetime),
                            "title": appt.title,
                        }
                    )

            data["active_configs"].append(config_data)

        # Check total appointments in database
        all_appointments = Appointment.all_objects.all()
        data["total_appointments"] = all_appointments.count()

        # Check patients with phone numbers
        patients_with_phones = User.objects.filter(
            role="patient", phone_number__isnull=False
        ).exclude(phone_number="")
        data["patients_with_phones"] = patients_with_phones.count()

        return JsonResponse(data)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


router = DefaultRouter()
router.register(r"clinic-events", ClinicEventViewSet, basename="clinicevent")
router.register(r"appointments", AppointmentViewSet, basename="appointment")
router.register(r"availability", AvailabilityViewSet, basename="availability")
router.register(r"holidays", HolidayViewSet)
router.register(r"auto-email", AutoEmailViewSet, basename="autoemail")
router.register(r"clinical-notes", ClinicalNoteViewSet, basename="clinicalnote")
router.register(r"vital-signs-flowsheets", VitalSignsFlowsheetViewSet, basename="vitalsignsflowsheet")
router.register(r"flowsheet-templates", FlowsheetTemplateViewSet, basename="flowsheettemplate")
router.register(r"admin/flowsheet-templates", FlowsheetTemplateAdminViewSet, basename="flowsheettemplateadmin")
router.register(r"note-templates", NoteTemplateViewSet, basename="notetemplate")
router.register(r"admin/note-templates", NoteTemplateAdminViewSet, basename="notetemplateadmin")
router.register(r"admin/dictionaries", DictionaryAdminViewSet, basename="dictionaryadmin")
router.register(r"orders", OrderViewSet, basename="order")
router.register(r"orderables", OrderableViewSet, basename="orderable")
router.register(r"lab-reports", LabReportViewSet, basename="labreport")
router.register(r"patient-header-fields", HeaderFieldViewSet, basename="headerfield")
router.register(r"lab-messages", LabInboundMessageViewSet, basename="labmessage")
router.register(r"order-sets", OrderSetViewSet, basename="orderset")
router.register(r"admin/orderables", OrderableAdminViewSet, basename="orderableadmin")
router.register(r"admin/order-sets", OrderSetAdminViewSet, basename="ordersetadmin")

urlpatterns = router.urls + [
    # lab interface engines post results here (key-authenticated, no login)
    path("lab-interface/hl7/", hl7_intake, name="lab-interface-hl7"),
    path("lab-interface/fhir/", fhir_intake, name="lab-interface-fhir"),
    path("lab-usage/", LabUsageView.as_view(), name="lab-usage"),
    # patient chart header: layout, items, allergies
    path("locations/tree/", LocationTreeView.as_view(), name="location-tree"),
    path("locations/beds/<int:pk>/hold/", BedHoldView.as_view(), name="bed-hold"),
    path("locations/<str:kind>/", LocationItemView.as_view(), name="location-item-create"),
    path("locations/<str:kind>/<int:pk>/", LocationItemView.as_view(), name="location-item"),
    path("patient-header-config/", HeaderConfigView.as_view(), name="patient-header-config"),
    path("my-schedule/", MyScheduleView.as_view(), name="my-schedule"),
    # referral manager
    path("referrals/", ReferralListCreateView.as_view(), name="referrals"),
    path("referrals/queues/", ReferralQueuesView.as_view(), name="referral-queues"),
    path("referrals/<int:pk>/", ReferralDetailView.as_view(), name="referral-detail"),
    path("referrals/<int:pk>/action/", ReferralActionView.as_view(), name="referral-action"),
    path("referral-meta/", ReferralMetaView.as_view(), name="referral-meta"),
    path("referral-destinations/", DestinationListCreateView.as_view(), name="referral-destinations"),
    path("referral-destinations/<int:pk>/", DestinationDetailView.as_view(), name="referral-destination"),
    path("referral-settings/", ReferralSettingsView.as_view(), name="referral-settings"),
    path("chart-tabs/", ChartTabsView.as_view(), name="chart-tabs"),
    path("chart-tabs/mine/", MyChartTabsView.as_view(), name="chart-tabs-mine"),
    path("chart-tabs/defaults/", OrgChartTabsView.as_view(), name="chart-tabs-defaults"),
    path("patient-header/<int:patient_id>/", PatientHeaderView.as_view(), name="patient-header"),
    path("patient-header/<int:patient_id>/values/", PatientHeaderValuesView.as_view(), name="patient-header-values"),
    path("patient-header/<int:patient_id>/allergies/", PatientAllergiesView.as_view(), name="patient-allergies"),
    path("patient-header/<int:patient_id>/allergies/<int:allergy_id>/", PatientAllergyDetailView.as_view(), name="patient-allergy"),
    path("patient-header/<int:patient_id>/allergies/fhir/", allergy_views.PatientAllergyFhirView.as_view(), name="patient-allergies-fhir"),
    path("allergy-substances/", allergy_views.AllergySubstanceSearchView.as_view(), name="allergy-substances"),
    path("allergy-reactions/", allergy_views.AllergyReactionsView.as_view(), name="allergy-reactions"),
    path("allergy-check/", allergy_views.AllergyCheckView.as_view(), name="allergy-check"),
    path("patient-header/<int:patient_id>/allergy-status/", PatientAllergyStatusView.as_view(), name="patient-allergy-status"),
    path("lab-interface/orders/", orders_pull, name="lab-interface-orders"),
    path("lab-interface/orders/ack/", orders_ack, name="lab-interface-orders-ack"),
    # ICD-10-CM code search for the order diagnosis picker (proxies NLM's free service)
    path("icd10/search/", Icd10SearchView.as_view(), name="icd10-search"),
    # ⬇️ custom endpoint for doctor availability
    path(
        "doctors/<int:doctor_id>/available-dates/",
        doctor_available_slots,
        name="doctor-available-dates",
    ),
    path(
        "appointments/<int:appointment_id>/status/",
        update_appointment_status,
        name="update-appointment-status",
    ),
    path(
        "settings/environment/",
        EnvironmentSettingView.as_view(),
        name="environment-setting",
    ),
    path(
        "settings/sms/",
        SMSSettingView.as_view(),
        name="sms-setting",
    ),
    path(
        "upload/clinic-events/template/",
        DownloadClinicEventsTemplate.as_view(),
        name="download-clinic-events-template",
    ),
    path(
        "upload/clinic-events/",
        UploadClinicEventsCSV.as_view(),
        name="upload-clinic-events",
    ),
    path(
        "upload/availability/template/",
        DownloadAvailabilityTemplate.as_view(),
        name="download-availability-template",
    ),
    path(
        "upload/availability/",
        UploadAvailabilityCSV.as_view(),
        name="upload-availability-csv",
    ),
    path(
        "run-weekly-patient-reminders/",
        RunWeeklyPatientRemindersView.as_view(),
        name="run-weekly-patient-reminders",
    ),
    path(
        "run-patient-reminders-now/",
        RunPatientRemindersNowView.as_view(),
        name="run-patient-reminders-now",
    ),
    path(
        "run-patient-sms-reminders-now/",
        RunPatientSMSRemindersNowView.as_view(),
        name="run-patient-sms-reminders-now",
    ),
    path(
        "run-scheduled-jobs/",
        RunScheduledJobsView.as_view(),
        name="run-scheduled-jobs",
    ),
    path(
        "run-staffing-hourly-jobs/",
        RunStaffingHourlyJobsView.as_view(),
        name="run-staffing-hourly-jobs",
    ),
    path("analytics/reports/", AnalyticsReportView.as_view(), name="analytics-reports"),
    path("analytics/export/", ExportReportView.as_view(), name="export-reports"),
    path("debug-sms/", debug_sms_data, name="debug-sms"),
    path("debug-sms-logs/", debug_sms_logs, name="debug-sms-logs"),
    # Check-in endpoints
    path("check-in/search/", CheckInSearchView.as_view(), name="check-in-search"),
    path(
        "check-in/update-status/<int:appointment_id>/",
        CheckInStatusUpdateView.as_view(),
        name="check-in-status-update",
    ),
]
