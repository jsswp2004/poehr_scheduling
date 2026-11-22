from django.urls import path

from . import portal_views as v

urlpatterns = [
    path("register/", v.RegisterView.as_view(), name="portal-register"),
    path("me/", v.MeView.as_view(), name="portal-me"),
    path("rx/", v.RxListView.as_view(), name="portal-rx"),
    path("rx/<int:pk>/", v.RxDetailView.as_view(), name="portal-rx-detail"),
    path("rx/<int:pk>/action/", v.RxActionView.as_view(), name="portal-rx-action"),
    path("rx/<int:pk>/requests/", v.RxRequestView.as_view(), name="portal-rx-requests"),
    path("claim/", v.ClaimView.as_view(), name="portal-claim"),
    path("notices/", v.NoticeListView.as_view(), name="portal-notices"),
    path("notices/<int:pk>/read/", v.NoticeReadView.as_view(), name="portal-notice-read"),
    path("pharmacy/", v.PharmacyDetailsView.as_view(), name="portal-pharmacy-details"),
    path("staff/", v.StaffView.as_view(), name="portal-staff"),
    path("staff/<int:pk>/", v.StaffDetailView.as_view(), name="portal-staff-detail"),
]
