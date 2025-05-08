from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    CustomTokenObtainPairView,
    DoctorListView,
    get_patients,
    PatientDetailView,
    PatientUpdateView,
    UserDetailView,
    change_password,
    search_users,
    send_sms,
    send_sms_email,
    send_patient_email,
    PatientDeleteView,
)

urlpatterns = [
    # Authentication
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Data views
    path('doctors/', DoctorListView.as_view(), name='doctor-list'),
    path('patients/', get_patients, name='patient-list'),
    path('patients/by-user/<int:user_id>/', PatientDetailView.as_view(), name='patient-detail'),
    path('patients/by-user/<int:user_id>/edit/', PatientUpdateView.as_view(), name='patient-update'),

    # ✅ Corrected user detail route using pk (not id)
    path('<int:pk>/', UserDetailView.as_view(), name='user-detail'),
    path('users/change-password/', change_password, name='change-password'),
    path('search/', search_users, name='user-search'),

    # Password reset
    path('', include('django_rest_passwordreset.urls', namespace='password_reset')),

    # Twilio SMS
    path('send-sms/', send_sms, name='send-sms'),
    path('send-sms-email/', send_sms_email, name='send-sms-email'),
    path('send-email/', send_patient_email, name='send-email'),

    path('patients/<int:user_id>/', PatientDeleteView.as_view(), name='patient-delete'),


]
