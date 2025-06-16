#!/usr/bin/env python3
"""
Quick test to check what JWT tokens are stored and test WebSocket auth
"""
import json
import subprocess
import sys

# Test 1: Check if we can get a valid token from Django
print("🔍 Testing JWT token generation...")

try:
    # Test with a simple Python script to check token
    test_script = """
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth import get_user_model

User = get_user_model()
user = User.objects.first()
if user:
    token = AccessToken.for_user(user)
    print(f"✅ Generated token for user {user.username}: {str(token)[:50]}...")
    print(f"✅ Full token: {str(token)}")
else:
    print("❌ No users found in database")
"""
    
    with open('temp_token_test.py', 'w') as f:
        f.write(test_script)
    
    result = subprocess.run([sys.executable, 'temp_token_test.py'], 
                          capture_output=True, text=True, cwd='.')
    print("Token test output:")
    print(result.stdout)
    if result.stderr:
        print("Errors:")
        print(result.stderr)
        
except Exception as e:
    print(f"❌ Error: {e}")
