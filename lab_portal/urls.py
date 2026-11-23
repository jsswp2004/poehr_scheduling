from django.urls import path

from . import views as v

urlpatterns = [
    path("register/", v.RegisterView.as_view(), name="lab-portal-register"),
    path("me/", v.MeView.as_view(), name="lab-portal-me"),
    path("requests/", v.RequestListView.as_view(), name="lab-portal-requests"),
    path("requests/<int:pk>/", v.RequestDetailView.as_view(), name="lab-portal-request"),
    path("requests/<int:pk>/action/", v.RequestActionView.as_view(), name="lab-portal-action"),
    path("requests/<int:pk>/results/", v.ResultsView.as_view(), name="lab-portal-results"),
    path("requests/<int:pk>/report-file/", v.ReportFileView.as_view(), name="lab-portal-report-file"),
    path("requests/<int:pk>/report-file/view/", v.ReportFileDownloadView.as_view(), name="lab-portal-report-file-view"),
    path("requests/<int:pk>/critical-call/", v.CriticalCallView.as_view(), name="lab-portal-critical-call"),
    path("requests/<int:pk>/release/", v.ReleaseView.as_view(), name="lab-portal-release"),
    path("claim/", v.ClaimView.as_view(), name="lab-portal-claim"),
    path("notices/", v.NoticeListView.as_view(), name="lab-portal-notices"),
    path("notices/<int:pk>/read/", v.NoticeReadView.as_view(), name="lab-portal-notice-read"),
    path("staff/", v.StaffView.as_view(), name="lab-portal-staff"),
    path("staff/<int:pk>/", v.StaffDetailView.as_view(), name="lab-portal-staff-detail"),
]
