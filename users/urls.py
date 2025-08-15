from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
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
    send_sms,
    send_sms_email,
    send_patient_email,
    send_contact_email,  # Add the new contact email function
    send_contact_sms,  # Add the new contact SMS function
    send_trial_reminders,  # Add trial reminders function
    PatientDeleteView,
    OrganizationViewSet,  # ✅
    DownloadProvidersCSVTemplate,
    UploadProvidersCSV,
    DownloadPatientsCSVTemplate,
    UploadPatientsCSV,
    get_current_user,
    get_team_members,
    # Offline Chat Message APIs
    get_unread_messages,
    mark_messages_read,
    get_chat_rooms_with_unread,
    # Debug function
    debug_stripe_config,
)

router = DefaultRouter()
router.register(r"organizations", OrganizationViewSet, basename="organization")

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
    # Offline Chat Message API Endpoints
    path("unread-messages/", get_unread_messages, name="get-unread-messages"),
    path("mark-messages-read/", mark_messages_read, name="mark-messages-read"),
    path("chat-rooms/", get_chat_rooms_with_unread, name="get-chat-rooms-with-unread"),
    # Debug endpoint for Stripe configuration
    path("debug-stripe/", debug_stripe_config, name="debug-stripe-config"),
]

# ✅ Append viewset routes
urlpatterns += router.urls
