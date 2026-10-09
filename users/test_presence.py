"""Presence is all that is left of the old chat socket; messaging moved to secure_messaging."""
import json

from asgiref.sync import async_to_sync
from asgiref.testing import ApplicationCommunicator
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.test import TransactionTestCase

from users.consumers import PresenceConsumer
from users.models import CustomUser, Organization


class PresenceTests(TransactionTestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Presence Org")
        self.other = Organization.objects.create(name="Other Org")
        mk = CustomUser.objects.create_user
        self.doc = mk(username="pd", password="pw-12345-xyz", role="doctor", organization=self.org)
        self.nurse = mk(username="pn", password="pw-12345-xyz", role="nurse", organization=self.org)
        self.patient = mk(username="pp", password="pw-12345-xyz", role="patient", organization=self.org)
        self.outsider = mk(username="po", password="pw-12345-xyz", role="nurse", organization=self.other)
        self.staff = mk(username="ps", password="pw-12345-xyz", role="staff", organization=self.org)

    def comm(self, user):
        return ApplicationCommunicator(
            PresenceConsumer.as_asgi(), {"type": "websocket", "path": "/ws/presence/", "user": user, "headers": [], "subprotocols": []}
        )

    def test_refuses_anonymous_and_roster_staff(self):
        async def run():
            for user, code in ((AnonymousUser(), 4401), (self.staff, 4403)):
                c = self.comm(user)
                await c.send_input({"type": "websocket.connect"})
                out = await c.receive_output(2)
                self.assertEqual((out["type"], out.get("code")), ("websocket.close", code))

        async_to_sync(run)()

    def test_online_list_shows_only_my_organization_and_old_chat_messages_are_ignored(self):
        async def read(c):
            return json.loads((await c.receive_output(2))["text"])

        async def run():
            c = self.comm(self.doc)
            await c.send_input({"type": "websocket.connect"})
            self.assertEqual((await c.receive_output(2))["type"], "websocket.accept")
            first = await read(c)  # my own online broadcast
            self.assertEqual((first["type"], first["user_id"], first["is_online"]), ("user_status_update", self.doc.pk, True))
            await database_sync_to_async(lambda: CustomUser.objects.filter(pk__in=[self.nurse.pk, self.outsider.pk, self.patient.pk]).update(is_online=True))()
            await c.send_input({"type": "websocket.receive", "text": json.dumps({"type": "get_online_users"})})
            users = (await read(c))["users"]
            names = {u["username"] for u in users}
            self.assertEqual(names, {"pd", "pn"})  # no outsider, no patient
            # the old chat commands no longer do anything
            await c.send_input({"type": "websocket.receive", "text": json.dumps({"type": "send_message", "content": "hi", "recipient_id": self.nurse.pk})})
            await c.send_input({"type": "websocket.receive", "text": json.dumps({"type": "ping"})})
            self.assertEqual((await read(c))["type"], "pong")
            await c.send_input({"type": "websocket.receive", "text": "not json"})
            self.assertEqual((await read(c))["type"], "error")
            await c.send_input({"type": "websocket.disconnect", "code": 1000})
            await c.wait()
            self.assertFalse(await database_sync_to_async(lambda: CustomUser.objects.get(pk=self.doc.pk).is_online)())

        async_to_sync(run)()

    def test_old_chat_endpoints_are_gone(self):
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_authenticate(self.doc)
        for url in ("/api/users/unread-messages/", "/api/users/mark-messages-read/", "/api/users/chat-rooms/"):
            self.assertEqual(c.get(url).status_code, 404, url)

    def test_old_chat_tables_were_dropped_but_presence_stays(self):
        from django.db import connection

        tables = set(connection.introspection.table_names())
        for gone in ("users_chatmessage", "users_chatroom", "users_chatroom_participants", "users_typingindicator"):
            self.assertNotIn(gone, tables)
        self.assertIn("users_onlineuser", tables)
