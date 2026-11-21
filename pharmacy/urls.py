from django.urls import path

from . import views

urlpatterns = [
    path("patients/", views.PharmacyPatientListView.as_view(), name="pharmacy-patients"),
    path("queue/", views.VerificationQueueView.as_view(), name="pharmacy-queue"),
    path("orders/<int:pk>/", views.PharmacyOrderView.as_view(), name="pharmacy-order"),
    path("orders/<int:pk>/action/", views.PharmacyOrderActionView.as_view(), name="pharmacy-order-action"),
    path("med-profile/<int:patient_id>/", views.MedProfileView.as_view(), name="pharmacy-med-profile"),
]
