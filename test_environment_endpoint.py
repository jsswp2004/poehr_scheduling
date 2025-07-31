#!/usr/bin/env python
"""
Simple test view to check if the environment settings endpoint is reachable
"""

import os
import sys
import django

# Set up Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def test_environment_endpoint(request):
    """Simple test endpoint"""
    return JsonResponse({
        'status': 'success',
        'message': 'Environment settings endpoint is reachable',
        'user': str(request.user),
        'user_org': str(getattr(request.user, 'organization', 'No organization'))
    })

# Add this to urls.py temporarily for testing
if __name__ == "__main__":
    print("Test endpoint created. Add this to appointments/urls.py:")
    print("path('settings/environment/test/', test_environment_endpoint, name='test-environment'),")
