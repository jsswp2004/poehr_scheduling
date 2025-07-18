#!/usr/bin/env python
"""
Final test script to verify email functionality with updated credentials
"""

import os
import sys
import django
from pathlib import Path

# Add the project root to the Python path
sys.path.insert(0, str(Path(__file__).parent))

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from django.core.mail import send_mail
from django.conf import settings

def test_email():
    """Test email functionality with updated credentials"""
    print("=" * 50)
    print("EMAIL SYSTEM FINAL TEST")
    print("=" * 50)
    
    # Print email configuration
    print(f"EMAIL_BACKEND: {settings.EMAIL_BACKEND}")
    print(f"EMAIL_HOST: {settings.EMAIL_HOST}")
    print(f"EMAIL_PORT: {settings.EMAIL_PORT}")
    print(f"EMAIL_USE_SSL: {settings.EMAIL_USE_SSL}")
    print(f"EMAIL_HOST_USER: {settings.EMAIL_HOST_USER}")
    print("EMAIL_HOST_PASSWORD: [HIDDEN]")
    print("-" * 50)
    
    try:
        # Test sending email
        print("Sending test email...")
        
        subject = "✅ Email System Migration Complete"
        message = """
        Hello,
        
        This email confirms that the email system has been successfully migrated from Gmail to the private email server.
        
        ✅ Email server: mail.privateemail.com
        ✅ Port: 465 (SSL)
        ✅ From address: info@powerhealthcareit.com
        ✅ Authentication: Working
        
        The system is now ready for production use.
        
        Best regards,
        POEHR Scheduling System
        """
        
        from_email = settings.EMAIL_HOST_USER
        recipient_list = [settings.EMAIL_HOST_USER]
        
        send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=recipient_list,
            fail_silently=False
        )
        
        print("✅ Email sent successfully!")
        print(f"   From: {from_email}")
        print(f"   To: {recipient_list[0]}")
        print(f"   Subject: {subject}")
        
    except Exception as e:
        print(f"❌ Error sending email: {e}")
        return False
    
    return True

if __name__ == "__main__":
    success = test_email()
    print("=" * 50)
    if success:
        print("🎉 EMAIL MIGRATION SUCCESSFUL!")
        print("The system is now using info@powerhealthcareit.com")
    else:
        print("❌ EMAIL MIGRATION FAILED!")
    print("=" * 50)
