#!/usr/bin/env python3
"""
Vonage SMS API Test Script
Test script to verify Vonage SMS functionality before integrating into the main application.
"""

import os
import sys
from datetime import datetime

# Try to import vonage - install if not available
try:
    import vonage
    print("✓ Vonage library imported successfully")
except ImportError:
    print("❌ Vonage library not found. Installing...")
    os.system("pip install vonage")
    try:
        import vonage
        print("✓ Vonage library installed and imported successfully")
    except ImportError:
        print("❌ Failed to install Vonage library. Please install manually: pip install vonage")
        sys.exit(1)

def test_vonage_sms():
    """Test Vonage SMS functionality with proper error handling"""
    
    print(f"\n📱 Vonage SMS Test - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Configuration - Replace with your actual credentials
    API_KEY = "*******"  # Your API key from the screenshot
    API_SECRET = "********Cl"  # Your actual Vonage API secret
    FROM_NUMBER = "12185080889"  # Your Vonage number
    TO_NUMBER = "16469372978"  # Test recipient number
    
    # Validate configuration
    if not API_KEY or not API_SECRET:
        print("❌ Error: API_KEY and API_SECRET must be provided")
        return False
        
    if not FROM_NUMBER or not TO_NUMBER:
        print("❌ Error: FROM_NUMBER and TO_NUMBER must be provided")
        return False
    
    try:
        # Initialize Vonage client (using modern API)
        print("🔧 Initializing Vonage client...")
        client = vonage.Vonage(
            vonage.Auth(
                api_key=API_KEY, 
                api_secret=API_SECRET
            )
        )
        print("✓ Vonage client initialized successfully")
        
        # Prepare test message
        test_message = f"Test message from Vonage SMS API - {datetime.now().strftime('%H:%M:%S')}"
        
        print(f"\n📤 Sending test SMS...")
        print(f"From: {FROM_NUMBER}")
        print(f"To: {TO_NUMBER}")
        print(f"Message: {test_message}")
        
        # Send SMS using modern API
        response_data = client.sms.send({
            "from_": FROM_NUMBER,
            "to": TO_NUMBER,
            "text": test_message
        })
        
        print(f"\n📊 Response received:")
        print(f"Raw response: {response_data}")
        
        # Check response
        if response_data.messages:
            message = response_data.messages[0]
            status = message.status
            message_id = message.message_id
            error_text = getattr(message, 'error_text', 'N/A')
            
            print(f"\n📋 Message Details:")
            print(f"Message ID: {message_id}")
            print(f"Status: {status}")
            
            if status == "0":
                print("✅ SUCCESS: Message sent successfully!")
                print(f"💰 Cost: €{message.message_price}")
                print(f"💰 Remaining Balance: €{message.remaining_balance}")
                return True
            else:
                print(f"❌ FAILED: Message failed to send")
                print(f"Error: {error_text}")
                return False
        else:
            print("❌ FAILED: No messages in response")
            return False
            
    except Exception as e:
        print(f"❌ EXCEPTION: {str(e)}")
        print(f"Exception type: {type(e).__name__}")
        return False

def test_account_balance():
    """Test account balance check"""
    
    API_KEY = "00758797"
    API_SECRET = "7cjWBidmmPG7TxCl"  # Your actual Vonage API secret
    
    try:
        print(f"\n💰 Checking Vonage Account Balance...")
        client = vonage.Vonage(
            vonage.Auth(
                api_key=API_KEY, 
                api_secret=API_SECRET
            )
        )
        
        # Get account balance using modern API
        balance = client.account.get_balance()
        print(f"✓ Account Balance: €{balance.value:.4f}")
        print(f"Auto-reload: {getattr(balance, 'auto_reload', 'Not set')}")
        
        if float(balance.value) < 1.0:
            print("⚠️  WARNING: Low balance! Consider topping up your account.")
        
        return True
        
    except Exception as e:
        print(f"❌ Failed to check balance: {str(e)}")
        return False

def main():
    """Main test function"""
    
    print("🚀 Starting Vonage SMS Integration Test")
    print("=" * 60)
    
    # Test 1: Account balance
    balance_ok = test_account_balance()
    
    # Test 2: SMS sending
    sms_ok = test_vonage_sms()
    
    # Summary
    print(f"\n📊 TEST SUMMARY")
    print("=" * 60)
    print(f"Balance Check: {'✅ PASS' if balance_ok else '❌ FAIL'}")
    print(f"SMS Sending:   {'✅ PASS' if sms_ok else '❌ FAIL'}")
    
    if balance_ok and sms_ok:
        print(f"\n🎉 ALL TESTS PASSED! Vonage SMS is ready for integration.")
        return True
    else:
        print(f"\n⚠️  SOME TESTS FAILED. Please check configuration and credentials.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
