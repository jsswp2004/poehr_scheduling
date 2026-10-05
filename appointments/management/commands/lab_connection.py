"""
Manage lab interface connections (the keys a lab's interface engine uses).

  python manage.py lab_connection create --org 3 --name "Quest" --lab "Quest Diagnostics" --enable
  python manage.py lab_connection rotate --id 5
  python manage.py lab_connection disable --id 5
  python manage.py lab_connection orders --id 5 --on      # also send this clinic's lab orders here (--off to stop)
  python manage.py lab_connection list

The key is shown once, when created or rotated; only a hash is stored.
"""

import secrets

from django.core.management.base import BaseCommand, CommandError

from appointments.lab_intake import hash_key
from appointments.models import LabInterfaceConnection
from users.models import Organization


def _new_key():
    return "lab_" + secrets.token_urlsafe(32)


class Command(BaseCommand):
    help = "Create, rotate, disable or list lab interface connections."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["create", "rotate", "disable", "list", "orders"])
        parser.add_argument("--org", type=int, help="Organization id (create)")
        parser.add_argument("--name", help="Connection name (create)")
        parser.add_argument("--lab", default="", help="Lab name, e.g. Quest Diagnostics (create)")
        parser.add_argument("--id", type=int, help="Connection id (rotate/disable)")
        parser.add_argument("--on", action="store_true", help="orders: start sending orders on this connection")
        parser.add_argument("--off", action="store_true", help="orders: stop sending orders on this connection")
        parser.add_argument("--enable", action="store_true", help="Also switch the lab interface add-on on for the organization")

    def handle(self, *args, **o):
        action = o["action"]
        if action == "list":
            for c in LabInterfaceConnection.objects.select_related("organization").order_by("id"):
                self.stdout.write(
                    f"{c.id}\t{c.organization.name}\t{c.name}\t{'active' if c.is_active else 'disabled'}\t"
                    f"add-on {'on' if c.organization.lab_interface_enabled else 'off'}\torders {'on' if c.send_orders else 'off'}\tlast used {c.last_used_at or 'never'}"
                )
            return
        if action == "create":
            if not o["org"] or not o["name"]:
                raise CommandError("create needs --org and --name")
            try:
                org = Organization.objects.get(pk=o["org"])
            except Organization.DoesNotExist:
                raise CommandError("No such organization.")
            key = _new_key()
            c = LabInterfaceConnection.objects.create(
                organization=org, name=o["name"], lab_name=o["lab"], key_hash=hash_key(key), key_prefix=key[:8]
            )
            if o["enable"] and not org.lab_interface_enabled:
                org.lab_interface_enabled = True
                org.save(update_fields=["lab_interface_enabled"])
        else:
            if not o["id"]:
                raise CommandError(f"{action} needs --id")
            try:
                c = LabInterfaceConnection.objects.get(pk=o["id"])
            except LabInterfaceConnection.DoesNotExist:
                raise CommandError("No such connection.")
            if action == "orders":
                if o["on"] == o["off"]:
                    raise CommandError("orders needs --on or --off")
                if o["on"]:
                    other = LabInterfaceConnection.objects.filter(
                        organization=c.organization, send_orders=True, is_active=True
                    ).exclude(pk=c.pk).first()
                    if other:
                        raise CommandError(
                            f"{c.organization.name} already sends orders through connection {other.id} ({other.name}). "
                            "Turn that off first: orders are sent to one lab per clinic."
                        )
                c.send_orders = o["on"]
                c.save(update_fields=["send_orders"])
                self.stdout.write(f"Connection {c.id}: orders {'on' if c.send_orders else 'off'}.")
                return
            if action == "disable":
                c.is_active = False
                c.save(update_fields=["is_active"])
                self.stdout.write(f"Connection {c.id} disabled.")
                return
            key = _new_key()
            c.key_hash, c.key_prefix, c.is_active = hash_key(key), key[:8], True
            c.save(update_fields=["key_hash", "key_prefix", "is_active"])
        self.stdout.write(f"Connection {c.id} ({c.name}) for {c.organization.name}")
        self.stdout.write("Interface key (shown once, store it now):")
        self.stdout.write(key)
