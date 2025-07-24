from django.contrib import admin
from django.urls import path
from django.http import HttpResponse

def health_check(request):
    return HttpResponse("Core Django is working!")

urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health_check, name='health'),
]
