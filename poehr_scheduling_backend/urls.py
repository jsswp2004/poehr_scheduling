from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect
import os

def favicon_view(request):
    # Redirect to the static favicon
    return redirect('/static/frontend/favicon.ico')

def health_check(request):
    """Health check endpoint for Cloud Run"""
    return JsonResponse({
        'status': 'healthy',
        'service': 'poehr-scheduling',
        'version': '1.0.0'
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # Health check endpoint
    path('health/', health_check, name='health_check'),
    
    # Favicon handler
    path('favicon.ico', favicon_view, name='favicon'),

    # Auth-specific routes (register/login)
    path('api/auth/', include('users.urls')),       # Only for login/register/change-password

    # ✅ Password reset routes from django-rest-passwordreset
    path('api/password-reset/', include('django_rest_passwordreset.urls', namespace='password_reset')),

    # Profile & user-specific endpoints
    path('api/users/', include('users.urls')),      # Keep all user routes under /api/users/

    # API routes
    path('api/', include('appointments.urls')),
    path('api/sms/', include('users.urls')),  # or sms.urls
    path('api/messages/', include('users.urls')),
    path('api/communicator/', include('communicator.urls')),

] 

# Debug: Let's temporarily disable catch-all to test static files
# urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
# urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

# Manually add static file serving for production
urlpatterns += [
    # Serve static files manually
    re_path(r'^static/(?P<path>.*)$', serve, {
        'document_root': settings.STATIC_ROOT,
    }),
    # Serve media files manually  
    re_path(r'^media/(?P<path>.*)$', serve, {
        'document_root': settings.MEDIA_ROOT,
    }),
]

# Add the catch-all pattern LAST (so it doesn't interfere with static files)
urlpatterns += [
    # Catch-all: serve React app for any remaining routes
    re_path(r'.*$', TemplateView.as_view(template_name='index.html'), name='landing_page'),
]
