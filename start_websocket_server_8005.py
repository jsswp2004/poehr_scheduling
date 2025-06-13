#!/usr/bin/env python
import os
import subprocess
import sys

if __name__ == "__main__":
    print("🚀 Starting Django with WebSocket support...")
    print("📡 WebSocket endpoint: ws://localhost:8005/ws/presence/")
    print("🌐 HTTP endpoint: http://localhost:8005/")
    print()
    
    # Set environment variables
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
    
    # Start Daphne ASGI server
    try:
        subprocess.run([
            sys.executable, '-m', 'daphne',
            '-b', '127.0.0.1',
            '-p', '8005',
            'poehr_scheduling_backend.asgi:application'
        ], check=True)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except FileNotFoundError:
        print("❌ Daphne not found. Install it with: pip install daphne")
    except Exception as e:
        print(f"❌ Error starting server: {e}")
