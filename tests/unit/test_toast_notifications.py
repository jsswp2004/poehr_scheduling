#!/usr/bin/env python
"""
Test script to check toast notification behavior in the React app.
This script will open the toast test page in a browser.
"""
import webbrowser
import time
import os
import sys
import subprocess

# Define the URL of the test page
TEST_URL = "http://localhost:3000/toast-test"

def is_react_app_running():
    """Check if the React app is already running on port 3000"""
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = False
    try:
        sock.connect(('localhost', 3000))
        result = True
    except:
        result = False
    sock.close()
    return result

def main():
    print("Toast Notification Test Script")
    print("-----------------------------")
    
    # Check if the React app is already running
    if not is_react_app_running():
        print("React app is not running. Please start it with 'npm start' in the frontend directory.")
        print("After starting the app, run this script again.")
        sys.exit(1)
    
    print("Opening toast test page in browser...")
    # Open the test page in the default browser
    webbrowser.open(TEST_URL)
    
    print("\nInstructions:")
    print("1. When the page loads, click each toast button to test different notification types")
    print("2. Verify that each toast stays visible for 5 seconds")
    print("3. Check for any visual issues with the toast notifications")
    print("\nTroubleshooting tips if toasts still disappear quickly:")
    print("- Check browser console for any errors")
    print("- Verify that the custom CSS is being applied")
    print("- Try disabling browser extensions that might interfere with animations")
    
    print("\nTest page URL:", TEST_URL)

if __name__ == "__main__":
    main()
