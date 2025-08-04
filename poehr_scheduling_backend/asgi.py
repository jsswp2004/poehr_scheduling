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
from channels.routing import ProtocolTypeRouter, URLRouter
from users.middleware import JWTAuthMiddlewareStack
import users.routing

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings_production')

try:
    logger.info("🔧 Setting up Django...")
    django.setup()
    logger.info("✅ Django setup complete")
    
    # Get Django ASGI application
    django_asgi_app = get_asgi_application()
    logger.info("✅ Django ASGI application created")
    
    # Create protocol router
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": JWTAuthMiddlewareStack(
            URLRouter(
                users.routing.websocket_urlpatterns
            )
        ),
    })
    logger.info("✅ ASGI Protocol Router configured")
    
except Exception as e:
    logger.error(f"❌ ASGI setup failed: {e}")
    # Fallback to basic Django ASGI app if channels setup fails
    django.setup()
    application = get_asgi_application()
    logger.warning("⚠️  Falling back to basic Django ASGI (no WebSocket support)")
