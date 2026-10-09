from django.urls import re_path
from . import consumers
from secure_messaging.consumers import SecureMessagingConsumer
import logging

logger = logging.getLogger(__name__)

# Log available consumers
logger.info(f"📋 Available consumers: {dir(consumers)}")
logger.info(f"📋 PresenceConsumer: {consumers.PresenceConsumer}")

websocket_urlpatterns = [
    re_path(r'^ws/presence/$', consumers.PresenceConsumer.as_asgi()),
    re_path(r'^ws/secure-messages/$', SecureMessagingConsumer.as_asgi()),
]

logger.info(f"📋 WebSocket URL patterns configured: {websocket_urlpatterns}")
