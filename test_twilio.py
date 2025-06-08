#!/usr/bin/env python3

import os
from dotenv import load_dotenv
from twilio.rest import Client

# Load environment variables
load_dotenv()

# Get Twilio credentials
account_sid = os.getenv('TWILIO_ACCOUNT_SID')
auth_token = os.getenv('TWILIO_AUTH_TOKEN')
from_phone = os.getenv('TWILIO_PHONE_NUMBER')

print("🔧 Testing Twilio Configuration:")
print(f"Account SID: {account_sid}")
print(f"Auth Token: {auth_token[:10]}...")  # Only show first 10 chars for security
print(f"From Phone: {from_phone}")

if not all([account_sid, auth_token, from_phone]):
    print("❌ Missing Twilio configuration!")
    exit(1)

try:
    # Initialize Twilio client
    client = Client(account_sid, auth_token)
    
    # Get account information
    account = client.api.accounts(account_sid).fetch()
    print(f"✅ Twilio Account Status: {account.status}")
    
    # List phone numbers in the account
    print("\n📞 Phone numbers in your Twilio account:")
    incoming_phone_numbers = client.incoming_phone_numbers.list()
    
    if not incoming_phone_numbers:
        print("❌ No phone numbers found in your Twilio account!")
    else:
        for record in incoming_phone_numbers:
            print(f"  📱 {record.phone_number} - SMS: {record.capabilities['sms']}")
            if record.phone_number == from_phone:
                print(f"    ✅ This matches your configured FROM number!")
                if not record.capabilities['sms']:
                    print(f"    ❌ WARNING: This number is NOT SMS-enabled!")
    
    # Check if configured number exists and is SMS-enabled
    configured_number_found = False
    for record in incoming_phone_numbers:
        if record.phone_number == from_phone:
            configured_number_found = True
            if record.capabilities['sms']:
                print(f"\n✅ Your configured number {from_phone} is SMS-enabled!")
            else:
                print(f"\n❌ Your configured number {from_phone} is NOT SMS-enabled!")
            break
    
    if not configured_number_found:
        print(f"\n❌ Your configured number {from_phone} was NOT found in your Twilio account!")
        print("   Please check that the number is correct and provisioned in Twilio.")

except Exception as e:
    print(f"❌ Twilio Error: {e}")
