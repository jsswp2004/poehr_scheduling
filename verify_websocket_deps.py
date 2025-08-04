#!/usr/bin/env python3
"""
WebSocket Dependencies Verification Script
Run this in the Docker container to verify all WebSocket dependencies are installed
"""

import sys
import importlib

def test_import(module_name, description):
    """Test if a module can be imported"""
    try:
        module = importlib.import_module(module_name)
        version = getattr(module, '__version__', 'unknown')
        print(f"✅ {description}: {version}")
        return True
    except ImportError as e:
        print(f"❌ {description}: FAILED - {e}")
        return False

def main():
    print("🔍 Testing WebSocket Dependencies Installation...")
    print("=" * 50)
    
    all_good = True
    
    # Core WebSocket dependencies
    dependencies = [
        ('channels', 'Django Channels'),
        ('channels_redis', 'Channels Redis'),
        ('redis', 'Redis Client'),
        ('uvicorn', 'Uvicorn ASGI Server'),
        ('django', 'Django Framework'),
    ]
    
    for module_name, description in dependencies:
        if not test_import(module_name, description):
            all_good = False
    
    print("\n" + "=" * 50)
    
    # Test specific WebSocket components
    print("🔧 Testing WebSocket Components...")
    
    try:
        from channels.routing import ProtocolTypeRouter, URLRouter
        print("✅ Channels routing components")
    except ImportError as e:
        print(f"❌ Channels routing: {e}")
        all_good = False
    
    try:
        from channels_redis.core import RedisChannelLayer
        print("✅ Redis channel layer")
    except ImportError as e:
        print(f"❌ Redis channel layer: {e}")
        all_good = False
    
    try:
        from django.core.asgi import get_asgi_application
        print("✅ Django ASGI application")
    except ImportError as e:
        print(f"❌ Django ASGI: {e}")
        all_good = False
    
    print("\n" + "=" * 50)
    
    if all_good:
        print("🎉 All WebSocket dependencies are properly installed!")
        
        # Test ASGI application creation
        print("\n🧪 Testing ASGI Application Creation...")
        try:
            import os
            import django
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')
            django.setup()
            
            from poehr_scheduling_backend.asgi import application
            print("✅ ASGI application created successfully")
            print(f"   Type: {type(application)}")
            
            # Check if it's a ProtocolTypeRouter
            from channels.routing import ProtocolTypeRouter
            if isinstance(application, ProtocolTypeRouter):
                print("✅ ProtocolTypeRouter detected")
                protocols = list(application.application_mapping.keys())
                print(f"   Supported protocols: {protocols}")
            else:
                print("⚠️  Not a ProtocolTypeRouter - WebSocket support may be limited")
                
        except Exception as e:
            print(f"❌ ASGI application creation failed: {e}")
            import traceback
            traceback.print_exc()
            all_good = False
    else:
        print("❌ Some dependencies are missing. WebSocket functionality will not work.")
        sys.exit(1)
    
    print("\n🏁 Dependency check completed!")
    return 0 if all_good else 1

if __name__ == "__main__":
    sys.exit(main())
