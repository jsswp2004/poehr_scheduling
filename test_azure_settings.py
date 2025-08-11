#!/usr/bin/env python3

import os
import sys

print("Testing Azure settings import...")

# Set Azure settings
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_azure"
)

try:
    print("1. Setting up Django with Azure settings...")
    import django

    django.setup()
    print("   ✅ Django setup successful")

    print("2. Testing users.routing import...")
    import users.routing

    print("   ✅ users.routing imported successfully")

    print("3. Testing ASGI application...")
    from poehr_scheduling_backend.asgi import application

    print("   ✅ ASGI application imported successfully")

    print("4. Checking application type...")
    from channels.routing import ProtocolTypeRouter

    if isinstance(application, ProtocolTypeRouter):
        print("   ✅ ProtocolTypeRouter detected - WebSocket support enabled")
        protocols = list(application.application_mapping.keys())
        print(f"   📋 Supported protocols: {protocols}")
    else:
        print(f"   ⚠️  Basic ASGI application - Type: {type(application)}")

    print("\n🎉 Azure settings verification PASSED!")

except Exception as e:
    print(f"\n❌ Azure settings verification FAILED: {e}")
    import traceback

    traceback.print_exc()
    sys.exit(1)
