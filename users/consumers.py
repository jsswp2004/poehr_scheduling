"""Presence: who is online. (Staff messaging lives in the secure_messaging app.)"""
import asyncio
import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.utils import timezone

logger = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 30


class PresenceConsumer(AsyncWebsocketConsumer):
    """Marks a signed-in person online while the socket is open and tells their own organization.

    Anonymous sockets and roster-staff ("My Shifts") logins are refused: the online list shows names,
    emails and roles, and it only ever covers the caller's own organization.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        self.rejected = False
        if self.user is None or not getattr(self.user, "is_authenticated", False):
            self.rejected = True
            await self.close(code=4401)
            return
        if getattr(self.user, "role", None) == "staff":
            self.rejected = True
            await self.close(code=4403)
            return

        self.org_group = f"presence_org_{self.user.organization_id or 0}"
        await self.channel_layer.group_add(f"user_{self.user.id}", self.channel_name)
        await self.channel_layer.group_add(self.org_group, self.channel_name)
        await self.accept()
        await self.set_user_online(True)
        await self.broadcast_user_status()
        self.heartbeat_task = asyncio.create_task(self.heartbeat_loop())

    async def disconnect(self, close_code):
        if getattr(self, "rejected", False) or not hasattr(self, "org_group"):
            return
        task = getattr(self, "heartbeat_task", None)
        if task:
            task.cancel()
        await self.set_user_online(False)
        await self.broadcast_user_status()
        await self.channel_layer.group_discard(f"user_{self.user.id}", self.channel_name)
        await self.channel_layer.group_discard(self.org_group, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except (TypeError, ValueError):
            await self.send(text_data=json.dumps({"type": "error", "message": "Invalid JSON format"}))
            return
        kind = data.get("type") if isinstance(data, dict) else None
        if kind == "heartbeat":
            await self.update_user_last_seen()
            await self.send(text_data=json.dumps({"type": "heartbeat_response", "timestamp": data.get("timestamp")}))
        elif kind == "get_online_users":
            await self.send(text_data=json.dumps({"type": "online_users_list", "users": await self.get_online_users()}))
        elif kind == "ping":
            await self.send(text_data=json.dumps({"type": "pong", "timestamp": timezone.now().isoformat(), "user_id": self.user.id}))
        # anything else is ignored

    async def heartbeat_loop(self):
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_SECONDS)
                await self.update_user_last_seen()
        except asyncio.CancelledError:
            pass

    async def user_status_update(self, event):
        await self.send(
            text_data=json.dumps(
                {"type": "user_status_update", "user_id": event["user_id"], "is_online": event["is_online"], "last_seen": event["last_seen"]}
            )
        )

    @database_sync_to_async
    def set_user_online(self, is_online):
        from .models import CustomUser

        user = CustomUser.objects.filter(id=self.user.id).first()
        if user is None:
            return False
        user.set_online_status(is_online)
        return True

    @database_sync_to_async
    def update_user_last_seen(self):
        from .models import CustomUser

        user = CustomUser.objects.filter(id=self.user.id).first()
        if user is None:
            return False
        user.update_last_seen()
        return True

    @database_sync_to_async
    def get_online_users(self):
        """Online people in the caller's own organization (patients excluded)."""
        from .models import CustomUser

        rows = (
            CustomUser.objects.filter(is_online=True, organization_id=self.user.organization_id)
            .exclude(role="patient")
            .values("id", "username", "first_name", "last_name", "email", "role", "is_online", "last_seen")
        )
        out = []
        for row in rows:
            if row["last_seen"]:
                row["last_seen"] = row["last_seen"].isoformat()
            out.append(row)
        return out

    async def broadcast_user_status(self):
        data = await self.get_user_data()
        await self.channel_layer.group_send(
            self.org_group,
            {"type": "user_status_update", "user_id": self.user.id, "is_online": data["is_online"], "last_seen": data["last_seen"]},
        )

    @database_sync_to_async
    def get_user_data(self):
        from .models import CustomUser

        user = CustomUser.objects.filter(id=self.user.id).first()
        if user is None:
            return {"id": self.user.id, "is_online": False, "last_seen": None}
        return {"id": user.id, "is_online": user.is_online, "last_seen": user.last_seen.isoformat() if user.last_seen else None}
