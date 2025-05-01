"""
URL configuration for poehr_scheduling_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),       # ✅ Keep this for login/register/token
    path('api/', include('appointments.urls')),     # ✅ Appointment API
    path('api/users/', include('users.urls')),  # ✅ This is the correct one
    # path('api/users/', include('users.user_urls')), # 👈 Fix: Separate file if you want a clean separation
]

