#!/usr/bin/env python3
"""
Test script to verify admin password change functionality
"""
import requests
import json
import sys

BASE_URL = "http://localhost:8000"

def test_admin_password_change():
    print("🔍 Testing Admin Password Change Functionality")
    print("=" * 50)
    
    # Step 1: Login as daniellebishop (admin)
    print("1. Logging in as daniellebishop (admin)...")
    login_data = {
        "username": "daniellebishop",
        "password": "krat25Miko!"
    }
    
    response = requests.post(f"{BASE_URL}/api/users/login/", json=login_data)
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return False
    
    admin_token = response.json()["access"]
    print("✅ Admin login successful")
    
    # Step 2: Find Josh's user ID
    print("2. Searching for Josh Salvacion...")
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    search_response = requests.get(f"{BASE_URL}/api/users/search/?q=josh", headers=headers)
    if search_response.status_code != 200:
        print(f"❌ Search failed: {search_response.status_code}")
        return False
    
    users = search_response.json()
    josh_user = None
    for user in users:
        if "josh" in user.get("username", "").lower():
            josh_user = user
            break
    
    if not josh_user:
        print("❌ Josh Salvacion not found")
        return False
    
    josh_id = josh_user["id"]
    print(f"✅ Found Josh Salvacion with ID: {josh_id}")
    
    # Step 3: Test admin password change for Josh
    print("3. Testing admin password change for Josh...")
    admin_password_change_data = {
        "target_user_id": josh_id,
        "admin_password": "krat25Miko!",  # daniellebishop's password
        "new_password": "NewTestPassword123!",
        "confirm_password": "NewTestPassword123!"
    }
    
    change_response = requests.post(
        f"{BASE_URL}/api/users/admin-change-password/", 
        json=admin_password_change_data, 
        headers=headers
    )
    
    if change_response.status_code == 200:
        print("✅ Admin password change successful!")
        print(f"Response: {change_response.json()}")
        
        # Step 4: Test login with new password
        print("4. Testing Josh's login with new password...")
        josh_login_data = {
            "username": josh_user["username"],
            "password": "NewTestPassword123!"
        }
        
        josh_login_response = requests.post(f"{BASE_URL}/api/users/login/", json=josh_login_data)
        if josh_login_response.status_code == 200:
            print("✅ Josh can login with new password!")
            
            # Step 5: Reset Josh's password back to original
            print("5. Resetting Josh's password back...")
            reset_data = {
                "target_user_id": josh_id,
                "admin_password": "krat25Miko!",
                "new_password": "krat25Miko!",
                "confirm_password": "krat25Miko!"
            }
            
            reset_response = requests.post(
                f"{BASE_URL}/api/users/admin-change-password/", 
                json=reset_data, 
                headers=headers
            )
            
            if reset_response.status_code == 200:
                print("✅ Josh's password reset back to original")
                return True
            else:
                print(f"⚠️  Failed to reset password: {reset_response.status_code} - {reset_response.text}")
                return True  # Main test still passed
        else:
            print(f"❌ Josh login failed: {josh_login_response.status_code} - {josh_login_response.text}")
            return False
    else:
        print(f"❌ Admin password change failed: {change_response.status_code} - {change_response.text}")
        return False

if __name__ == "__main__":
    success = test_admin_password_change()
    sys.exit(0 if success else 1)
