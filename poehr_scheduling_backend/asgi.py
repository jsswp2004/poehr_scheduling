"""
ASGI config for poehr_scheduling_backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
import django
import logging
from django.core.asgi import get_asgi_application

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set Django settings
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings_production"
)

try:
    logger.info("🔧 Setting up Django...")
    logger.info("✅ Django setup will be handled by get_asgi_application()")

    # Get Django ASGI application FIRST (this calls django.setup() internally)
    django_asgi_app = get_asgi_application()
    logger.info("✅ Django ASGI application created")

    # Now test channels import AFTER Django is set up
    logger.info("📦 Testing channels import...")
    from channels.routing import ProtocolTypeRouter, URLRouter
    from users.middleware import JWTAuthMiddlewareStack
    import users.routing

    logger.info("✅ Channels imports successful")

    # Test websocket patterns
    logger.info(f"📋 WebSocket URL patterns: {users.routing.websocket_urlpatterns}")
    logger.info(f"📋 Number of WebSocket patterns: {len(users.routing.websocket_urlpatterns)}")

    # Test channel layer configuration
    logger.info("🔧 Testing channel layer...")
    try:
        from django.conf import settings
        channel_config = getattr(settings, 'CHANNEL_LAYERS', {})
        logger.info(f"📋 Channel layer config: {channel_config}")
        
        # Test channel layer import and creation
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        logger.info(f"✅ Channel layer created: {type(channel_layer)}")
        logger.info(f"📋 Channel layer backend: {channel_layer.__class__.__module__}.{channel_layer.__class__.__name__}")
        
    except Exception as channel_error:
        logger.error(f"⚠️ Channel layer test failed: {channel_error}")
        import traceback
        logger.error(f"📋 Channel layer traceback: {traceback.format_exc()}")
        # Don't fail - continue with WebSocket setup
        logger.info("🔄 Proceeding with WebSocket setup anyway...")

    # Create the WebSocket middleware stack
    logger.info("🔧 Creating WebSocket middleware stack...")
    websocket_application = JWTAuthMiddlewareStack(
        URLRouter(users.routing.websocket_urlpatterns)
    )
    logger.info("✅ WebSocket middleware stack created")

    # Create protocol router
    logger.info("🔧 Creating ProtocolTypeRouter...")
    application = ProtocolTypeRouter(
        {
            "http": django_asgi_app,
            "websocket": websocket_application,
        }
    )
    logger.info("✅ ASGI Protocol Router configured with WebSocket support")
    logger.info(f"📋 Protocol mappings: {list(application.application_mapping.keys())}")
    
    # Verify the WebSocket application is properly configured
    if "websocket" in application.application_mapping:
        logger.info("✅ WebSocket protocol handler registered successfully")
        ws_app = application.application_mapping["websocket"]
        logger.info(f"📋 WebSocket app type: {type(ws_app)}")
    else:
        logger.error("❌ WebSocket protocol handler NOT registered!")

except ImportError as e:
    logger.error(f"❌ Import error in ASGI setup: {e}")
    logger.error("📦 Channels or related modules not available")
    import traceback
    logger.error(f"📋 Import traceback: {traceback.format_exc()}")
    # Fallback to basic Django ASGI app if channels setup fails
    application = get_asgi_application()
    logger.warning("⚠️  Falling back to basic Django ASGI (no WebSocket support)")
except Exception as e:
    logger.error(f"❌ ASGI setup failed: {e}")
    import traceback
    logger.error(f"📋 Full traceback: {traceback.format_exc()}")
    # Fallback to basic Django ASGI app if channels setup fails
    application = get_asgi_application()
    logger.warning("⚠️  Falling back to basic Django ASGI (no WebSocket support)")
