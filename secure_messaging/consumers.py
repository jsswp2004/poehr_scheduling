import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from users.rights import user_has_right


class SecureMessagingConsumer(AsyncWebsocketConsumer):
    """
    A quiet socket that only says "go fetch": it carries thread and message ids, never message text or
    patient details. Unlike the presence socket it refuses anonymous visitors.
    """

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close(code=4401)
            return
        allowed = await database_sync_to_async(user_has_right)(user, "secure_messaging.use")
        if not allowed:
            await self.close(code=4403)
            return
        self.group = f"secure_user_{user.pk}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group = getattr(self, "group", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            if json.loads(text_data or "{}").get("type") == "ping":
                await self.send(text_data=json.dumps({"type": "pong"}))
        except ValueError:
            pass

    async def secure_nudge(self, event):
        await self.send(
            text_data=json.dumps(
                {"type": "secure_message", "thread": event["thread"], "message": event["message"], "urgent": event.get("urgent", False)}
            )
        )
