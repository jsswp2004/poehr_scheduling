#!/usr/bin/env python3
import jwt
import json

# Token from the console
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2ODEwMWIyZDg3ZTJhMjBkMWM4MjIxM2YiLCJpYXQiOjE3NDU4ODY0NzQsImV4cCI6MTc0NjQ5MTI3NH0.9OVWwSUmkSwtOjcCkERgGvEP5tfHXd5AVpwpwyT3Z8c"

try:
    # Decode without verification first to see the payload
    decoded = jwt.decode(token, options={"verify_signature": False})
    print("JWT Payload:")
    print(json.dumps(decoded, indent=2))
    
    # Convert ObjectId to check which user this is
    object_id = decoded.get('_id')
    print(f"\nObjectId in token: {object_id}")
    
except Exception as e:
    print(f"Error decoding token: {e}")
