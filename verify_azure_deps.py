#!/usr/bin/env python3
"""
Azure Dependencies Verification Script
This script verifies that all required dependencies for Azure deployment are properly installed.
"""

import sys
import importlib

def test_import(module_name, description):
    """Test if a module can be imported and show version if available."""
    try:
        module = importlib.import_module(module_name)
        version = getattr(module, '__version__', 'Unknown')
        print(f"✅ {description}: {version}")
        return True
    except ImportError as e:
        print(f"❌ {description}: {e}")
        return False

def main():
    print("🔍 Testing Azure Dependencies Installation...")
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
    
    # Test Azure-specific dependencies
    print("☁️  Testing Azure Dependencies...")
    azure_dependencies = [
        ('azure.keyvault.secrets', 'Azure Key Vault Secrets'),
        ('azure.identity', 'Azure Identity'),
        ('azure.core', 'Azure Core'),
    ]
    
    for module_name, description in azure_dependencies:
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
        print("🎉 All Azure dependencies are properly installed!")
        
        # Test ASGI application creation
        print("\n🧪 Testing ASGI Application Creation...")
        try:
            import os
            import django
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_azure')
            django.setup()
            
            from poehr_scheduling_backend.asgi import application
            print("✅ ASGI application created successfully")
            print(f"   Type: {type(application)}")
            
            # Check if it's a ProtocolTypeRouter
            from channels.routing import ProtocolTypeRouter
            if isinstance(application, ProtocolTypeRouter):
                print("✅ ProtocolTypeRouter detected - WebSocket support enabled")
                protocols = list(application.application_mapping.keys())
                print(f"   Supported protocols: {protocols}")
            else:
                print("⚠️  Basic ASGI application - WebSocket support may be limited")
                
        except Exception as e:
            print(f"❌ ASGI application test failed: {e}")
            all_good = False
        
        # Test Azure secrets utility
        print("\n🔐 Testing Azure Key Vault Integration...")
        try:
            from poehr_scheduling_backend.utils.azure_secrets import get_azure_secret
            
            # Test with a non-existent secret (should handle gracefully)
            test_secret = get_azure_secret('test-secret', default='test-default')
            if test_secret == 'test-default':
                print("✅ Azure secrets utility working correctly")
            else:
                print("⚠️  Azure secrets utility returned unexpected value")
                
        except Exception as e:
            print(f"❌ Azure secrets utility test failed: {e}")
            all_good = False
        
        print("\n" + "=" * 50)
        
        if all_good:
            print("🎉 Dependency check completed successfully!")
            print("\n🚀 Ready for Azure deployment!")
        else:
            print("⚠️  Some tests failed, but basic dependencies are installed")
            
    else:
        print("💥 Dependency check FAILED. Missing required dependencies.")
        print("\n🔧 Troubleshooting:")
        print("1. Ensure all dependencies are installed: pip install -r requirements.azure.txt")
        print("2. Check Azure CLI authentication: az login")
        print("3. Verify Azure Key Vault permissions")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
