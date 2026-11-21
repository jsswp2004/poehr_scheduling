"""
How a prescription reaches an outside pharmacy, and how people are told about it.

Routing adapters
----------------
Every outside pharmacy is reached through an adapter. Today there is one: the POWER Pharmacy Portal, where the
partner pharmacy logs in. A later adapter (for example an NCPDP SCRIPT / Surescripts connection for a US
deployment) implements the same three calls and is picked by `adapter_for()`; nothing else changes. That
adapter is deliberately not built.

    route(portal_rx)      the prescription now belongs to this pharmacy
    cancel(portal_rx)     the prescriber cancelled it
    respond(request)      the prescriber answered a change / renewal request

Notification channels
---------------------
`notify_pharmacy` and `notify_prescriber` send through every channel in CHANNELS: in-app and email today.
An SMS channel can be added later by writing one class with `send(...)` and adding it to the list.
"""

import logging

from django.conf import settings

log = logging.getLogger(__name__)


# --------------------------------------------------------------------------- notification channels

class Channel:
    name = ""

    def to_pharmacy(self, partner, title, body, portal_rx=None):
        raise NotImplementedError

    def to_prescriber(self, prescriber, title, body, rx=None, source_type="", source_id=None):
        raise NotImplementedError


class InAppChannel(Channel):
    """Portal notices for the pharmacy; the POWER inbox (an alert) for the prescriber."""

    name = "in_app"

    def to_pharmacy(self, partner, title, body, portal_rx=None):
        from .models import PortalNotice

        PortalNotice.objects.create(partner=partner, portal=portal_rx, title=title[:200], body=body)

    def to_prescriber(self, prescriber, title, body, rx=None, source_type="", source_id=None):
        from appointments import inbox

        inbox.notify(
            prescriber, title[:200], body, kind="notice", patient=rx.patient if rx is not None else None,
            source_type=source_type, source_id=source_id, organization=rx.organization if rx is not None else None,
        )


class EmailChannel(Channel):
    """The existing email setup (communicator.utils.send_email). A failure is logged, never raised."""

    name = "email"

    def _send(self, address, title, body, organization=None):
        if not address:
            return
        from communicator.utils import send_email

        try:
            send_email(address, title, body, organization=organization)
        except Exception:  # noqa: BLE001 - email trouble must not stop the pharmacy's work
            log.exception("pharmacy portal: email to %s failed", address)

    def to_pharmacy(self, partner, title, body, portal_rx=None):
        """Each active pharmacist gets the email at their own address; the pharmacy's email only when none has one."""
        addresses = pharmacist_addresses(partner) or ([partner.email] if partner.email else [])
        for address in addresses:
            self._send(address, f"POWER Pharmacy Portal: {title}", body)

    def to_prescriber(self, prescriber, title, body, rx=None, source_type="", source_id=None):
        self._send(prescriber.email, f"POWER: {title}", body, organization=rx.organization if rx is not None else None)


def pharmacist_addresses(partner):
    """The email of every active member of the pharmacy (their own record, else their login), without repeats."""
    out = []
    for member in partner.staff.filter(is_active=True).select_related("user"):
        address = (member.email or (member.user.email if member.user_id and member.user.is_active else "") or "").strip()
        if address and address.lower() not in {a.lower() for a in out}:
            out.append(address)
    return out


# SMS later: class SmsChannel(Channel): ... and add SmsChannel() here.
CHANNELS = [InAppChannel(), EmailChannel()]


def _channels():
    names = getattr(settings, "PHARMACY_PORTAL_CHANNELS", None)
    return [c for c in CHANNELS if names is None or c.name in names]


def notify_pharmacy(partner, title, body, portal_rx=None):
    for channel in _channels():
        channel.to_pharmacy(partner, title, body, portal_rx)


def notify_prescriber(prescriber, title, body, rx=None, source_type="", source_id=None):
    for channel in _channels():
        channel.to_prescriber(prescriber, title, body, rx, source_type, source_id)


# --------------------------------------------------------------------------- routing adapters

class RoutingAdapter:
    name = ""

    def route(self, portal_rx):
        raise NotImplementedError

    def cancel(self, portal_rx):
        raise NotImplementedError

    def respond(self, request):
        raise NotImplementedError


class PowerPortalAdapter(RoutingAdapter):
    """The partner pharmacy works in the POWER Pharmacy Portal: it is told in-app and by email."""

    name = "power_portal"

    def route(self, portal_rx):
        rx = portal_rx.prescription
        # no patient details in the notice itself (RA 10173): the pharmacy opens the portal to see them
        notify_pharmacy(
            portal_rx.partner, "New prescription",
            f"A new prescription from {rx.organization.name} is waiting in your portal inbox (RX-{rx.pk:06d}).", portal_rx,
        )

    def cancel(self, portal_rx):
        rx = portal_rx.prescription
        notify_pharmacy(
            portal_rx.partner, "Prescription cancelled",
            f"RX-{rx.pk:06d} was cancelled by the prescriber. Do not dispense it.\n\nReason: {rx.cancel_reason}", portal_rx,
        )

    def respond(self, request):
        rx = request.portal.prescription
        notify_pharmacy(
            request.partner, f"{request.get_kind_display()} request {request.status}",
            f"RX-{rx.pk:06d}: the prescriber {request.status} your {request.get_kind_display().lower()} request."
            + (f"\n\n{request.response}" if request.response else ""),
            request.portal,
        )


ADAPTERS = {"power_portal": PowerPortalAdapter()}


def adapter_for(partner):
    """The adapter for a partner pharmacy. Only the POWER portal exists today."""
    return ADAPTERS["power_portal"]
