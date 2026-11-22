from django.urls import path

from . import formulary_views as fv
from . import views

urlpatterns = [
    path("patients/", views.PharmacyPatientListView.as_view(), name="pharmacy-patients"),
    path("queue/", views.VerificationQueueView.as_view(), name="pharmacy-queue"),
    path("orders/<int:pk>/", views.PharmacyOrderView.as_view(), name="pharmacy-order"),
    path("orders/<int:pk>/action/", views.PharmacyOrderActionView.as_view(), name="pharmacy-order-action"),
    path("med-profile/<int:patient_id>/", views.MedProfileView.as_view(), name="pharmacy-med-profile"),
    # Phase 2: in-house outpatient fill
    path("fills/", views.FillQueueView.as_view(), name="pharmacy-fills"),
    path("fills/<int:pk>/", views.FillDetailView.as_view(), name="pharmacy-fill"),
    path("fills/<int:pk>/action/", views.FillActionView.as_view(), name="pharmacy-fill-action"),
    path("fills/<int:pk>/complete-partial/", views.FillCompletePartialView.as_view(), name="pharmacy-fill-complete-partial"),
    path("fills/<int:pk>/label/", views.FillLabelView.as_view(), name="pharmacy-fill-label"),
    path("prescriptions/<int:rx_id>/refill/", views.PrescriptionRefillView.as_view(), name="pharmacy-rx-refill"),
    path("prices/", views.PriceListView.as_view(), name="pharmacy-prices"),
    path("prices/<int:pk>/", views.PriceDetailView.as_view(), name="pharmacy-price"),
    path("patients/<int:patient_id>/discount-ids/", views.PatientDiscountIdsView.as_view(), name="pharmacy-discount-ids"),
    path("discount-ids/<int:pk>/", views.DiscountIdDetailView.as_view(), name="pharmacy-discount-id"),
    # Phase 3: POWER Pharmacy Portal (clinic side)
    path("network/", views.PartnerNetworkView.as_view(), name="pharmacy-network"),
    path("network/<int:pk>/status/", views.PartnerStatusView.as_view(), name="pharmacy-network-status"),
    path("network/<int:pk>/changes/", views.PartnerChangesView.as_view(), name="pharmacy-network-changes"),
    path("network/<int:pk>/changes/<int:change_id>/review/", views.PartnerChangeReviewView.as_view(), name="pharmacy-network-change-review"),
    path("network/<int:pk>/add-to-directory/", views.PartnerAddToDirectoryView.as_view(), name="pharmacy-network-add"),
    path("portal-requests/", views.PortalRequestListView.as_view(), name="pharmacy-portal-requests"),
    path("portal-requests/<int:pk>/respond/", views.PortalRequestRespondView.as_view(), name="pharmacy-portal-request-respond"),
    path("portal-reroute/<int:rx_id>/", views.PortalRerouteView.as_view(), name="pharmacy-portal-reroute"),
    path("portal-access-log/", views.PortalAccessLogView.as_view(), name="pharmacy-portal-access-log"),
    # POWER Formulary (shared, with clinic overrides)
    path("formulary/", fv.FormularyListView.as_view(), name="formulary"),
    path("formulary/export/", fv.FormularyExportView.as_view(), name="formulary-export"),
    path("formulary/template/", fv.FormularyTemplateView.as_view(), name="formulary-template"),
    path("formulary/import/", fv.FormularyImportView.as_view(), name="formulary-import"),
    path("formulary/imports/", fv.FormularyImportListView.as_view(), name="formulary-imports"),
    path("formulary/reviewers/", fv.FormularyReviewersView.as_view(), name="formulary-reviewers"),
    path("formulary/reviewers/<int:pk>/", fv.FormularyReviewersView.as_view(), name="formulary-reviewer"),
    path("formulary/imports/<int:pk>/file/", fv.FormularyImportFileView.as_view(), name="formulary-import-file"),
    path("formulary/<int:pk>/", fv.FormularyItemView.as_view(), name="formulary-item"),
    path("formulary/<int:pk>/revert/", fv.FormularyRevertView.as_view(), name="formulary-revert"),
    path("formulary/<int:pk>/history/", fv.FormularyHistoryView.as_view(), name="formulary-history"),
    path("formulary/<int:pk>/review/", fv.FormularyReviewView.as_view(), name="formulary-review"),
]
