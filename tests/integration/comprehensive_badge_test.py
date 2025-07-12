#!/usr/bin/env python3
"""
Test the badge functionality by simulating a complete chat scenario
"""
import requests
import json
import time

# Test credentials
MARKABRAM_USERNAME = "markabram"
MARKABRAM_PASSWORD = "krat27Miko!"
DANIELLEBISHOP_USERNAME = "daniellebishop"
DANIELLEBISHOP_PASSWORD = "YOUR_PASSWORD_HERE"  # Need actual password

BASE_URL = "http://localhost:8000"

def get_auth_token(username, password):
    """Get authentication token"""
    login_data = {
        'username': username,
        'password': password
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login/", json=login_data)
        if response.status_code == 200:
            data = response.json()
            return data.get('access')
        else:
            print(f"❌ Login failed for {username}: {response.text}")
            return None
    except Exception as e:
        print(f"❌ Login error for {username}: {e}")
        return None

def test_badge_logic():
    """Test the badge logic directly by simulating scenarios"""
    print("🧪 Testing badge logic scenarios...")
    
    # Simulate the badge logic from our useChat.js
    def simulate_unread_count_update(unread_counts, message, current_user_id, active_room):
        """Simulate the unread count logic from handleNewMessage"""
        print(f"   📨 Processing message from user {message['sender_id']} in room {message['room_id']}")
        print(f"   👤 Current user: {current_user_id}, Active room: {active_room}")
        
        # Check if message is from another user and room is not active
        if message['sender_id'] != current_user_id and active_room != message['room_id']:
            other_user_id = message['sender_id']
            unread_counts[other_user_id] = unread_counts.get(other_user_id, 0) + 1
            print(f"   🔔 ✅ Incremented unread count for user {other_user_id} to {unread_counts[other_user_id]}")
        else:
            print(f"   🔔 ❌ NOT incrementing unread count. Reasons:")
            print(f"       - Is own message: {message['sender_id'] == current_user_id}")
            print(f"       - Is active room: {active_room == message['room_id']}")
        
        return unread_counts
    
    # Test scenarios
    unread_counts = {}
    current_user_id = 1  # markabram
    
    print("\n📋 Scenario 1: Message from another user when chat is closed")
    message1 = {'sender_id': 2, 'room_id': 'room_1_2', 'content': 'Hello Mark!'}
    active_room = None
    unread_counts = simulate_unread_count_update(unread_counts, message1, current_user_id, active_room)
    
    print("\n📋 Scenario 2: Another message from same user")
    message2 = {'sender_id': 2, 'room_id': 'room_1_2', 'content': 'Are you there?'}
    unread_counts = simulate_unread_count_update(unread_counts, message2, current_user_id, active_room)
    
    print("\n📋 Scenario 3: Message from another user when their chat is active")
    active_room = 'room_1_2'
    message3 = {'sender_id': 2, 'room_id': 'room_1_2', 'content': 'This should not increment'}
    unread_counts = simulate_unread_count_update(unread_counts, message3, current_user_id, active_room)
    
    print("\n📋 Scenario 4: Own message")
    message4 = {'sender_id': 1, 'room_id': 'room_1_2', 'content': 'My reply'}
    unread_counts = simulate_unread_count_update(unread_counts, message4, current_user_id, active_room)
    
    print(f"\n📊 Final unread counts: {unread_counts}")
    
    # Test clear unread when opening chat
    print("\n📋 Scenario 5: Opening chat should clear unread count")
    def simulate_clear_unread(unread_counts, user_id):
        if user_id in unread_counts:
            old_count = unread_counts[user_id]
            unread_counts[user_id] = 0
            print(f"   🧹 Cleared unread count for user {user_id} (was {old_count})")
        return unread_counts
    
    unread_counts = simulate_clear_unread(unread_counts, 2)
    print(f"📊 Final unread counts after clearing: {unread_counts}")

def test_browser_instructions():
    """Provide instructions for browser testing"""
    print("\n🌐 Browser Testing Instructions:")
    print("=" * 50)
    print("1. Open the React app in your browser")
    print("2. Login as markabram with the token we verified")
    print("3. Open browser console and run:")
    print("   window.simulateIncomingMessage();")
    print("4. Check if the chat icon shows a notification badge")
    print("5. Open chat modal and verify badge clears")
    print("6. Test with real messages between users")
    
    # Get the token for markabram
    token = get_auth_token(MARKABRAM_USERNAME, MARKABRAM_PASSWORD)
    if token:
        print(f"\n🔑 Token for browser testing:")
        print(f"localStorage.setItem('authToken', '{token}');")
        print("window.location.reload();")

def main():
    print("🚀 Comprehensive Badge System Test")
    print("=" * 50)
    
    # Test the logic
    test_badge_logic()
    
    print("\n" + "=" * 50)
    
    # Provide browser testing instructions
    test_browser_instructions()
    
    print("\n" + "=" * 50)
    print("✅ Tests completed!")
    print("\nNext steps:")
    print("1. Use the browser instructions above to test in UI")
    print("2. Test real chat messages between users")
    print("3. Verify badges work correctly in all scenarios")

if __name__ == "__main__":
    main()
