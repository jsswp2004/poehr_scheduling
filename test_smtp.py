#!/usr/bin/env python3
"""
Test SMTP connection to private email server
"""
import smtplib
import ssl
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Email configuration
SMTP_SERVER = "mail.privateemail.com"
SMTP_PORT = 465
USERNAME = "info@powerhealthcareit.com"
PASSWORD = "krat25Miko!"

def test_smtp_connection():
    print("🔧 Testing SMTP connection...")
    print(f"Server: {SMTP_SERVER}")
    print(f"Port: {SMTP_PORT}")
    print(f"Username: {USERNAME}")
    print(f"Password: {'*' * len(PASSWORD)}")
    
    try:
        # Create a secure SSL context
        context = ssl.create_default_context()
        
        # Create SMTP_SSL connection
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            print("✅ SSL connection established")
            
            # Login to the server
            server.login(USERNAME, PASSWORD)
            print("✅ Authentication successful")
            
            # Create a test message
            message = MIMEMultipart()
            message["From"] = USERNAME
            message["To"] = "jsswp199427@gmail.com"
            message["Subject"] = "Test Email from Power Healthcare IT"
            
            body = "This is a test email to verify SMTP configuration."
            message.attach(MIMEText(body, "plain"))
            
            # Send the message
            server.send_message(message)
            print("✅ Test email sent successfully!")
            
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ Authentication Error: {e}")
        print("   - Check username and password")
        print("   - Verify if 2FA is enabled (may need app password)")
        print("   - Check if account is locked or suspended")
        
    except smtplib.SMTPConnectError as e:
        print(f"❌ Connection Error: {e}")
        print("   - Check server hostname and port")
        print("   - Verify firewall settings")
        
    except smtplib.SMTPException as e:
        print(f"❌ SMTP Error: {e}")
        
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")

if __name__ == "__main__":
    test_smtp_connection()
