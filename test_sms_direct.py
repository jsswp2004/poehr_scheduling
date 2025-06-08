#!/usr/bin/env python3

import os
import sys
import django
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

# Now we can import Django modules
from django.conf import settings
from twilio.rest import Client

def test_sms_direct():
    """Test SMS functionality directly"""
    
    print("🔧 Testing SMS Function Directly:")
    print(f"Account SID: {settings.TWILIO_ACCOUNT_SID}")
    print(f"Auth Token: {settings.TWILIO_AUTH_TOKEN[:10]}...")
    print(f"Phone Number: {settings.TWILIO_PHONE_NUMBER}")
    
    # Test phone number and message
    test_phone = "+13018806015"  # Your test number
    test_message = "Test SMS from Django - SMS functionality working!"
    
    try:
        print(f"\n📤 Attempting to send SMS to {test_phone}...")
        
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        
        message = client.messages.create(
            body=test_message,
            from_=settings.TWILIO_PHONE_NUMBER,
            to=test_phone
        )
        
        print(f"✅ SMS sent successfully!")
        print(f"   Message SID: {message.sid}")
        print(f"   Status: {message.status}")
        print(f"   From: {message.from_}")
        print(f"   To: {message.to}")
        
    except Exception as e:
        print(f"❌ SMS failed: {e}")
        print(f"   Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_sms_direct()
