from django.urls import path

from . import views as v

urlpatterns = [
    path("", v.ClinicRequestListView.as_view(), name="lab-requests"),
    path("<int:pk>/", v.ClinicRequestDetailView.as_view(), name="lab-request"),
    path("<int:pk>/cancel/", v.ClinicRequestCancelView.as_view(), name="lab-request-cancel"),
    path("clinic-labs/", v.ClinicLabListView.as_view(), name="clinic-labs"),
    path("clinic-labs/<int:pk>/", v.ClinicLabDetailView.as_view(), name="clinic-lab"),
    path("partners/", v.PartnerDirectoryView.as_view(), name="lab-partners"),
    path("admin/partners/", v.AdminPartnerListView.as_view(), name="lab-admin-partners"),
    path("admin/partners/<int:pk>/status/", v.AdminPartnerStatusView.as_view(), name="lab-admin-partner-status"),
]
