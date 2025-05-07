from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth-specific routes (register/login)
    path('api/auth/', include('users.urls')),       # Only for login/register/change-password

    # ✅ Password reset routes from django-rest-passwordreset
    path('api/password-reset/', include('django_rest_passwordreset.urls', namespace='password_reset')),

    # Profile & user-specific endpoints
    path('api/users/', include('users.urls')),      # Keep all user routes under /api/users/

    # Appointments
    path('api/', include('appointments.urls')),
    # path('api/auth/', include('django_rest_passwordreset.urls', namespace='password_reset')),

    path('api/sms/', include('users.urls')),  # or sms.urls
    path('api/messages/', include('users.urls')),


] 
# + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve media during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
