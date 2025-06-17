#!/usr/bin/env python
"""
Django startup script with WebSocket support using Daphne on port 9001
"""
import os
import sys
import django

if __name__ == '__main__':
    # Set the Django settings module
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
    
    # Setup Django
    django.setup()
    
    # Import and start Daphne
    from daphne.cli import CommandLineInterface
    print("🚀 Starting Django with WebSocket support...")
    print("📡 WebSocket endpoint: ws://localhost:9001/ws/presence/")
    print("🌐 HTTP endpoint: http://localhost:9001/")
    print("")
      # Start Daphne with our ASGI application
    cli = CommandLineInterface()
    cli.run(['-b', '0.0.0.0', '-p', '9001', 'poehr_scheduling_backend.asgi:application'])
