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
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')

try:
    logger.info("🔧 Setting up Django...")
    django.setup()
    logger.info("✅ Django setup complete")
    
    # Test channels import AFTER Django setup
    logger.info("📦 Testing channels import...")
    from channels.routing import ProtocolTypeRouter, URLRouter
    from users.middleware import JWTAuthMiddlewareStack
    import users.routing
    logger.info("✅ Channels imports successful")
    
    # Get Django ASGI application
    django_asgi_app = get_asgi_application()
    logger.info("✅ Django ASGI application created")
    
    # Test websocket patterns
    logger.info(f"📋 WebSocket URL patterns: {users.routing.websocket_urlpatterns}")
    
    # Create protocol router
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": JWTAuthMiddlewareStack(
            URLRouter(
                users.routing.websocket_urlpatterns
            )
        ),
    })
    logger.info("✅ ASGI Protocol Router configured with WebSocket support")
    
except ImportError as e:
    logger.error(f"❌ Import error in ASGI setup: {e}")
    logger.error("📦 Channels or related modules not available")
    # Fallback to basic Django ASGI app if channels setup fails
    django.setup()
    application = get_asgi_application()
    logger.warning("⚠️  Falling back to basic Django ASGI (no WebSocket support)")
except Exception as e:
    logger.error(f"❌ ASGI setup failed: {e}")
    import traceback
    logger.error(f"📋 Full traceback: {traceback.format_exc()}")
    # Fallback to basic Django ASGI app if channels setup fails
    django.setup()
    application = get_asgi_application()
    logger.warning("⚠️  Falling back to basic Django ASGI (no WebSocket support)")
