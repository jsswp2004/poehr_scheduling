#!/usr/bin/env python3
"""
Decode the JWT token to see user details
"""
import jwt
import json

# Token from login response
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoxNzY2MzE5NzA4LCJpYXQiOjE3MzQ3Mzk3MDgsImp0aSI6IjhiNzNkMDJjZmNlZjQzYWY5YWVkZGI0MzE5ZTUxZmE4IiwidXNlcl9pZCI6MSwidXNlcm5hbWUiOiJtYXJrYWJyYW0iLCJlbWFpbCI6Im1hcmthYnJhbUBnbWFpbC5jb20iLCJmaXJzdF9uYW1lIjoiTWFyayIsImxhc3RfbmFtZSI6IkFicmFtIiwicm9sZSI6InJlZ2lzdHJhciJ9.xaw88AodvXAXCWjVEticsU_-kkmTHQKM5Ts3s"

def decode_jwt_token(token):
    """Decode JWT token without verification to see payload"""
    try:
        # Decode without verification to see the payload
        decoded = jwt.decode(token, options={"verify_signature": False})
        print("🔍 JWT Token Payload:")
        print(json.dumps(decoded, indent=2))
        return decoded
    except Exception as e:
        print(f"❌ Error decoding token: {e}")
        return None

if __name__ == "__main__":
    decode_jwt_token(token)
