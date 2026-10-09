from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .admissions import AdmitView, TransferView, DischargeView, AttendingView
from .board_builder import StatusSettingsView, StatusViewDetailView, StatusViewListView, StatusViewUndoView
from .ed_board import BoardUpdateView, EdBoardPreferenceView, EdBoardView
from .views import (
    RegisterView,
    CustomTokenObtainPairView,
    DoctorListView,
    get_patients,
    PatientDetailView,
    PatientUpdateView,
    PatientMobileView,
    UserDetailView,
    change_password,
    admin_change_password,
    search_users,
    rights_catalog,
    user_rights,
    user_facilities,
    send_sms,
    send_sms_email,
    send_patient_email,
    send_contact_email,  # Add the new contact email function
    send_contact_sms,  # Add the new contact SMS function
    send_trial_reminders,  # Add trial reminders function
    PatientDeleteView,
    OrganizationViewSet,  # ✅
    RegistrationViewSet,
    SMSOptOutManagementView,
    SMSPreferencesView,
    DownloadProvidersCSVTemplate,
    UploadProvidersCSV,
    DownloadPatientsCSVTemplate,
    UploadPatientsCSV,
    get_current_user,
    get_team_members,
    # Debug functions
    debug_stripe_config,
    debug_delete_user,
    get_organization_admin_info,  # Add new function
    # Organization management
    OrganizationDataExportView,
    OrganizationDeleteView,
    OrganizationSearchView,
    OrganizationAdminView,
)

# Import payment views
from .payment_views import (
    cancel_subscription,
    change_plan,
    payment_methods,
    billing_history,
    add_payment_method,
    delete_payment_method,
    set_default_payment_method,
    messaging_usage,
)

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")
router.register(r"registrations", RegistrationViewSet, basename="registration")

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", CustomTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("doctors/", DoctorListView.as_view(), name="doctor-list"),
    path("patients/", get_patients, name="patient-list"),
    path("me/", get_current_user, name="current-user"),
    path(
        "patients/by-user/<int:user_id>/",
        PatientDetailView.as_view(),
        name="patient-detail",
    ),
    path(
        "patients/by-user/<int:user_id>/edit/",
        PatientUpdateView.as_view(),
        name="patient-update",
    ),
    # Mobile app compatible URLs - using Patient primary key
    path("patients/<int:pk>/", PatientMobileView.as_view(), name="patient-mobile"),
    path("<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("change-password/", change_password, name="change-password"),
    path("admin-change-password/", admin_change_password, name="admin-change-password"),
    path("search/", search_users, name="user-search"),
    path("rights-catalog/", rights_catalog, name="rights-catalog"),
    path("<int:user_id>/rights/", user_rights, name="user-rights"),
    path("<int:user_id>/facilities/", user_facilities, name="user-facilities"),
    path("", include("django_rest_passwordreset.urls", namespace="password_reset")),
    path("send-sms/", send_sms, name="send-sms"),
    path("send-sms-email/", send_sms_email, name="send-sms-email"),
    path("send-email/", send_patient_email, name="send-email"),
    path(
        "contact-email/", send_contact_email, name="contact-email"
    ),  # New public contact endpoint
    path(
        "contact-sms/", send_contact_sms, name="contact-sms"
    ),  # New public SMS endpoint
    path(
        "providers/download-template/",
        DownloadProvidersCSVTemplate.as_view(),
        name="providers-download-template",
    ),
    path(
        "providers/upload-csv/",
        UploadProvidersCSV.as_view(),
        name="providers-upload-csv",
    ),
    path(
        "patients/download-template/",
        DownloadPatientsCSVTemplate.as_view(),
        name="patients-download-template",
    ),
    path(
        "patients/upload-csv/", UploadPatientsCSV.as_view(), name="patients-upload-csv"
    ),
    path(
        "trial-reminders/", send_trial_reminders, name="send-trial-reminders"
    ),  # Trial reminders endpoint
    path("team/", get_team_members, name="team-list"),
    # Debug endpoint for Stripe configuration
    path("debug-stripe/", debug_stripe_config, name="debug-stripe-config"),
    # Debug endpoint for user deletion
    path("debug-delete/<int:user_id>/", debug_delete_user, name="debug-delete-user"),
    # Organization admin info endpoint
    path(
        "organization-admin-info/",
        get_organization_admin_info,
        name="organization-admin-info",
    ),
    # Organization data management endpoints
    path(
        "organization/export-data/",
        OrganizationDataExportView.as_view(),
        name="organization-export-data",
    ),
    path(
        "organization/delete/",
        OrganizationDeleteView.as_view(),
        name="organization-delete",
    ),
    path(
        "organization/search/",
        OrganizationSearchView.as_view(),
        name="organization-search",
    ),
    path(
        "organization/<int:organization_id>/admin/",
        OrganizationAdminView.as_view(),
        name="organization-admin",
    ),
    # SMS Opt-out Management
    path(
        "sms-optout-management/",
        SMSOptOutManagementView.as_view(),
        name="sms-optout-management",
    ),
    path("sms-preferences/", SMSPreferencesView.as_view(), name="sms-preferences"),
    # Payment Management Endpoints
    path(
        "payments/cancel-subscription/", cancel_subscription, name="cancel-subscription"
    ),
    path("payments/change-plan/", change_plan, name="change-plan"),
    path("payments/methods/", payment_methods, name="payment-methods"),
    path(
        "payments/methods/<str:method_id>/",
        delete_payment_method,
        name="delete-payment-method",
    ),
    path(
        "payments/methods/<str:method_id>/set-default/",
        set_default_payment_method,
        name="set-default-payment-method",
    ),
    path("payments/history/", billing_history, name="billing-history"),
    path("payments/add-method/", add_payment_method, name="add-payment-method"),
    path("payments/messaging-usage/", messaging_usage, name="messaging-usage"),
    # Admit, transfer and discharge a visit (locations come from the Location Manager).
    path("admissions/admit/", AdmitView.as_view(), name="admission-admit"),
    path("admissions/<int:pk>/transfer/", TransferView.as_view(), name="admission-transfer"),
    path("admissions/<int:pk>/discharge/", DischargeView.as_view(), name="admission-discharge"),
    path("admissions/<int:pk>/attending/", AttendingView.as_view(), name="admission-attending"),
    path("admissions/<int:pk>/board/", BoardUpdateView.as_view(), name="admission-board"),
    path("ed-board/", EdBoardView.as_view(), name="ed-board"),
    path("ed-board/preference/", EdBoardPreferenceView.as_view(), name="ed-board-preference"),
    path("status-views/", StatusViewListView.as_view(), name="status-views"),
    path("status-views/settings/", StatusSettingsView.as_view(), name="status-views-settings"),
    path("status-views/<int:pk>/", StatusViewDetailView.as_view(), name="status-view"),
    path("status-views/<int:pk>/undo/", StatusViewUndoView.as_view(), name="status-view-undo"),
]

# ✅ Append viewset routes
urlpatterns += router.urls
