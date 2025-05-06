from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth-specific routes (register/login)
    path('api/auth/', include('users.urls')),       # Only for login/register/change-password

    # Profile & user-specific endpoints
    path('api/users/', include('users.urls')),      # Keep all user routes under /api/users/

    # Appointments
    path('api/', include('appointments.urls')),
] 
# + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve media during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
