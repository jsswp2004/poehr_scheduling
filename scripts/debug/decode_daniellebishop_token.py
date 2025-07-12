#!/usr/bin/env python3
import base64
import json

# Get the token from the browser console output
# Looking at the token in the browser console for daniellebishop
token = input("Enter the JWT token for daniellebishop: ")

# Decode the token
try:
    # JWT tokens have 3 parts separated by dots
    header, payload, signature = token.split('.')
    
    # Add padding if needed
    payload += '=' * (4 - len(payload) % 4)
    
    # Decode the payload
    decoded_payload = base64.urlsafe_b64decode(payload)
    payload_data = json.loads(decoded_payload)
    
    print("JWT Token Payload:")
    print(json.dumps(payload_data, indent=2))
    
    # Check what user fields are available
    print("\nUser fields in token:")
    for key, value in payload_data.items():
        if 'user' in key.lower() or key in ['username', 'email', 'first_name', 'last_name', 'id']:
            print(f"{key}: {value}")
            
except Exception as e:
    print(f"Error decoding token: {e}")
