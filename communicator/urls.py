from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ContactViewSet, BulkUploadView, SendBulkMessageView, MessageLogViewSet

router = DefaultRouter()
router.register(r'contacts', ContactViewSet, basename='contact')
router.register(r'logs', MessageLogViewSet, basename='messagelog')

urlpatterns = [
    path('upload/', BulkUploadView.as_view(), name='contacts-upload'),
    path('send/', SendBulkMessageView.as_view(), name='bulk-send'),
]
urlpatterns += router.urls
