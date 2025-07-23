#!/usr/bin/env python
"""
Test script to verify organization-based message filtering
"""

import requests
import json

def test_message_filtering():
    """Test that message filtering works correctly for different user roles"""
    
    # Test URLs
    base_url = "http://127.0.0.1:8000"
    login_url = f"{base_url}/api/auth/login/"
    logs_url = f"{base_url}/api/communicator/logs/?message_type=email"
    
    print("🧪 TESTING MESSAGE LOG ORGANIZATION FILTERING")
    print("=" * 60)
    
    # Test different user credentials (you'll need to update these with actual users)
    test_users = [
        {
            "name": "System Admin",
            "username": "system_admin_user",  # Update with actual system admin username
            "password": "password123",        # Update with actual password
            "expected_role": "system_admin"
        },
        {
            "name": "SUNY Downstate Admin",
            "username": "admin_suny",         # Update with actual admin username  
            "password": "password123",        # Update with actual password
            "expected_role": "admin"
        },
        {
            "name": "SUNY Downstate Registrar", 
            "username": "registrar_suny",     # Update with actual registrar username
            "password": "password123",        # Update with actual password
            "expected_role": "registrar"
        }
    ]
    
    for user_info in test_users:
        print(f"\n🔍 Testing user: {user_info['name']}")
        print("-" * 40)
        
        # Login
        login_data = {
            "username": user_info["username"],
            "password": user_info["password"]
        }
        
        try:
            login_response = requests.post(login_url, json=login_data)
            
            if login_response.status_code == 200:
                login_result = login_response.json()
                token = login_result["access"]
                
                # Decode token to see what's inside
                import jwt
                try:
                    decoded = jwt.decode(token, options={"verify_signature": False})
                    print(f"✅ Login successful!")
                    print(f"📋 Role: {decoded.get('role', 'Not found')}")
                    print(f"🏢 Organization ID: {decoded.get('organization_id', 'Not found')}")
                    print(f"👤 Username: {decoded.get('username', 'Not found')}")
                    
                    # Test message logs endpoint
                    headers = {"Authorization": f"Bearer {token}"}
                    logs_response = requests.get(logs_url, headers=headers)
                    
                    if logs_response.status_code == 200:
                        logs = logs_response.json()
                        print(f"📧 Message logs returned: {len(logs)} emails")
                        
                        # Show first few messages (if any)
                        if logs:
                            print("📋 Sample messages:")
                            for i, log in enumerate(logs[:3]):
                                print(f"   {i+1}. To: {log.get('recipient', 'N/A')}")
                                print(f"      Subject: {log.get('subject', 'N/A')[:50]}...")
                                print(f"      Date: {log.get('created_at', 'N/A')}")
                        else:
                            print("📭 No messages found for this user")
                            
                    else:
                        print(f"❌ Failed to fetch logs: {logs_response.status_code}")
                        print(f"📝 Error: {logs_response.text}")
                        
                except Exception as jwt_error:
                    print(f"❌ Failed to decode JWT: {jwt_error}")
                    
            else:
                print(f"❌ Login failed: {login_response.status_code}")
                print(f"📝 Error: {login_response.text}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Connection error: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 TESTING COMPLETE")
    print("\n💡 Expected Results:")
    print("- System Admin: Should see ALL messages from all organizations")
    print("- Organization Admin/Registrar: Should see only their organization's messages")
    print("- Organization ID should be present in JWT token")
    print("\n📋 If you don't see the expected filtering:")
    print("1. Check that users have the correct organization assigned")
    print("2. Verify JWT token contains organization_id")
    print("3. Ensure backend filtering logic is working")

if __name__ == "__main__":
    print("⚠️  IMPORTANT: Update the test_users list with actual usernames and passwords")
    print("   before running this test!")
    print()
    
    # Uncomment the line below after updating credentials
    # test_message_filtering()
    
    print("📝 To run the test:")
    print("1. Update test_users with real usernames/passwords")
    print("2. Uncomment the test_message_filtering() call")
    print("3. Run: python test_message_filtering.py")
