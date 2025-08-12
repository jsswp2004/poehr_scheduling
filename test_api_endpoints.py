#!/usr/bin/env python3
"""
Simple HTTP test for offline message API endpoints on Azure
"""
import requests
import json

def test_api_endpoints():
    # Azure URL
    base_url = 'https://poehr-scheduling.bluedune-dee8c412.centralus.azurecontainerapps.io/api/users'
    
    # Login credentials
    login_data = {
        'username': 'jsswp2004',
        'password': 'krat25Miko!'
    }
    
    try:
        print('🔐 Attempting login...')
        response = requests.post(f'{base_url}/login/', json=login_data, timeout=30)
        print(f'Login status: {response.status_code}')
        
        if response.status_code == 200:
            token = response.json().get('access')
            headers = {'Authorization': f'Bearer {token}'}
            print('✅ Login successful!')
            
            # Test 1: Get unread messages
            print('\n=== Testing /unread-messages/ ===')
            resp = requests.get(f'{base_url}/unread-messages/', headers=headers, timeout=30)
            print(f'Status: {resp.status_code}')
            if resp.status_code == 200:
                data = resp.json()
                count = data.get('count', 0)
                print(f'✅ API endpoint working! Found {count} unread messages')
                if count > 0:
                    messages = data.get('unread_messages', [])
                    for i, msg in enumerate(messages[:3], 1):
                        sender = msg.get('sender_name', 'Unknown')
                        content = msg.get('content', '')[:50]
                        print(f'  {i}. From {sender}: {content}...')
            elif resp.status_code == 404:
                print('❌ API endpoint not found - deployment may not be complete')
            else:
                print(f'❌ Error: {resp.text[:100]}...')
            
            # Test 2: Get chat rooms with unread
            print('\n=== Testing /chat-rooms/ ===')
            resp = requests.get(f'{base_url}/chat-rooms/', headers=headers, timeout=30)
            print(f'Status: {resp.status_code}')
            if resp.status_code == 200:
                data = resp.json()
                rooms_count = len(data.get('chat_rooms', []))
                total_unread = data.get('total_unread', 0)
                print(f'✅ API endpoint working! Found {rooms_count} rooms, {total_unread} total unread')
            elif resp.status_code == 404:
                print('❌ API endpoint not found - deployment may not be complete')
            else:
                print(f'❌ Error: {resp.text[:100]}...')
                
        else:
            print('❌ Login failed')
            print(f'Response: {response.text[:200]}...')
            
    except requests.exceptions.Timeout:
        print('❌ Request timed out - server might be starting up')
    except Exception as e:
        print(f'❌ Error: {e}')

if __name__ == '__main__':
    test_api_endpoints()
