#!/usr/bin/env python
"""
Django startup script with WebSocket support using Daphne
"""
import os
import sys
import django

if __name__ == '__main__':
    # Set the Django settings module
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
    
    # Setup Django
    django.setup()      # Import and start Daphne
    from daphne.cli import CommandLineInterface
    print("Starting Django with WebSocket support...")
    print("WebSocket endpoint: ws://localhost:8001/ws/presence/")
    print("HTTP endpoint: http://localhost:8000/")
    print("")
    
    # Start Daphne with our ASGI application
    cli = CommandLineInterface()
    cli.run(['-p', '8001', 'poehr_scheduling_backend.asgi:application'])
