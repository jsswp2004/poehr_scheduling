from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve
from django.http import HttpResponse
from django.shortcuts import redirect
import os

def favicon_view(request):
    # Redirect to the static favicon
    return redirect('/static/frontend/favicon.ico')

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Favicon handler
    path('favicon.ico', favicon_view, name='favicon'),

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
    path('api/communicator/', include('communicator.urls')),

    # Serve React static files
    re_path(r'^static/frontend/(?P<path>.*)$', serve, {
        'document_root': os.path.join(settings.BASE_DIR, 'static', 'frontend'),
    }),
    
    # Catch-all: serve React app for any non-API routes
    re_path(r'^(?!api/).*$', TemplateView.as_view(template_name='index.html'), name='landing_page'),


] 
# + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Serve media during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
