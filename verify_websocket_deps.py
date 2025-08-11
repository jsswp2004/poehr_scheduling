#!/usr/bin/env python3

"""
ASGI Application Verification Script
Tests if the ASGI application can be imported and configured properly
"""

import os
import sys
import django
from django.conf import settings

# Set Django settings
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_production"
)


def test_asgi_imports():
    """Test if all ASGI-related imports work"""
    print("🧪 Testing ASGI imports...")

    try:
        print("1️⃣ Testing Django core imports...")
        from django.core.asgi import get_asgi_application

        print("   ✅ Django ASGI imported successfully")

        print("2️⃣ Testing Channels imports...")
        from channels.routing import ProtocolTypeRouter, URLRouter

        print("   ✅ Channels routing imported successfully")

        print("3️⃣ Testing Redis channel layer...")
        from channels_redis.core import RedisChannelLayer

        print("   ✅ Redis channel layer imported successfully")

        print("4️⃣ Testing custom middleware...")
        from users.middleware import JWTAuthMiddlewareStack

        print("   ✅ Custom JWT middleware imported successfully")

        print("5️⃣ Testing WebSocket routing...")
        import users.routing

        print(
            f"   ✅ WebSocket routing imported: {users.routing.websocket_urlpatterns}"
        )

        print("6️⃣ Testing WebSocket consumer...")
        from users.consumers import PresenceConsumer

        print("   ✅ WebSocket consumer imported successfully")

        return True

    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_asgi_application():
    """Test if the ASGI application can be created"""
    print("\n🔧 Testing ASGI application creation...")

    try:
        # Setup Django
        print("1️⃣ Setting up Django...")
        django.setup()
        print("   ✅ Django setup successful")

        print("2️⃣ Importing ASGI application...")
        from poehr_scheduling_backend.asgi import application

        print("   ✅ ASGI application imported successfully")

        print("3️⃣ Checking application type...")
        from channels.routing import ProtocolTypeRouter

        if isinstance(application, ProtocolTypeRouter):
            print("   ✅ ProtocolTypeRouter detected - WebSocket support enabled")
            protocols = list(application.application_mapping.keys())
            print(f"   📋 Supported protocols: {protocols}")
        else:
            print(f"   ⚠️  Application type: {type(application)}")
            print("   ❌ Not a ProtocolTypeRouter - WebSocket support may be limited")

        return True

    except Exception as e:
        print(f"❌ ASGI application creation failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_channel_layer():
    """Test if the channel layer is configured properly"""
    print("\n📡 Testing channel layer configuration...")

    try:
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()

        if channel_layer is None:
            print("❌ No channel layer configured")
            return False

        print(f"✅ Channel layer configured: {type(channel_layer)}")

        # Test if it's Redis
        from channels_redis.core import RedisChannelLayer

        if isinstance(channel_layer, RedisChannelLayer):
            print("✅ Redis channel layer detected")
        else:
            print(f"⚠️  Non-Redis channel layer: {type(channel_layer)}")

        return True

    except Exception as e:
        print(f"❌ Channel layer test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    print("🔍 ASGI Application Verification")
    print("=" * 50)

    # Test imports
    imports_ok = test_asgi_imports()

    if not imports_ok:
        print("❌ Import test failed. Cannot proceed with application test.")
        return False

    # Test application creation
    app_ok = test_asgi_application()

    if not app_ok:
        print("❌ ASGI application test failed.")
        return False

    # Test channel layer
    channel_ok = test_channel_layer()

    # Summary
    print("\n📊 Test Results:")
    print("=" * 50)
    print(f"Imports: {'✅ PASS' if imports_ok else '❌ FAIL'}")
    print(f"ASGI Application: {'✅ PASS' if app_ok else '❌ FAIL'}")
    print(f"Channel Layer: {'✅ PASS' if channel_ok else '❌ FAIL'}")

    overall_success = imports_ok and app_ok and channel_ok
    print(
        f"\nOverall: {'✅ ALL TESTS PASSED' if overall_success else '❌ SOME TESTS FAILED'}"
    )

    if overall_success:
        print("\n🎉 ASGI application should work properly!")
        print(
            "💡 The WebSocket 500 error might be due to runtime issues or Azure configuration."
        )
    else:
        print("\n🔧 ASGI application has configuration issues that need to be fixed.")

    return overall_success


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n👋 Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
