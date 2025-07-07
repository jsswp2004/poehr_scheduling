#!/usr/bin/env python3
"""
Test the organization API endpoint to see what data it returns
"""
import requests
import jwt
from datetime import datetime, timedelta
import os
import sys

# Add the current directory to the Python path
sys.path.append('c:/Users/jsswp/POWER/poehr_scheduling')

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from users.models import Organization

User = get_user_model()

def generate_test_token():
    """Generate a test JWT token for jsswp2004"""
    user = User.objects.filter(username='jsswp2004').first()
    if not user:
        print("User jsswp2004 not found")
        return None
    
    payload = {
        'user_id': user.id,
        'username': user.username,
        'role': user.role,
        'organization_id': user.organization.id if user.organization else None,
        'organization_name': user.organization.name if user.organization else None,
        'exp': datetime.utcnow() + timedelta(hours=1),
        'iat': datetime.utcnow(),
    }
    
    # Use a simple secret - this is just for testing
    secret = 'your-secret-key'
    token = jwt.encode(payload, secret, algorithm='HS256')
    return token

def test_organization_api():
    """Test the organization API endpoint"""
    token = generate_test_token()
    if not token:
        return
    
    print(f"Generated token: {token[:50]}...")
    
    # Decode to check organization ID
    decoded = jwt.decode(token, options={"verify_signature": False})
    org_id = decoded.get('organization_id')
    print(f"Organization ID from token: {org_id}")
    
    # Test the API endpoint
    url = f"http://127.0.0.1:8000/api/organizations/{org_id}/"
    headers = {'Authorization': f'Bearer {token}'}
    
    try:
        response = requests.get(url, headers=headers)
        print(f"API Response Status: {response.status_code}")
        print(f"API Response Content: {response.json()}")
    except Exception as e:
        print(f"API Error: {e}")

if __name__ == '__main__':
    test_organization_api()
