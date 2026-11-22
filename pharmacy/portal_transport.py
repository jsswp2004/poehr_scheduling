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


def pharmacist_mobiles(partner):
    """The SMS number of every active pharmacist of the pharmacy, without repeats."""
    out = []
    for member in partner.staff.filter(is_active=True).exclude(mobile=""):
        if member.mobile not in out:
            out.append(member.mobile)
    return out


def sms_pharmacy(partner, text, organization=None):
    """
    A short text through POWER's existing SMS setup (Twilio, communicator.utils.send_sms) to each active pharmacist's
    mobile, or the pharmacy's 'Mobile number for SMS' when none has one. Nothing is sent to numbers that weren't
    entered. Every send is logged in MessageLog by send_sms; a failure is logged here and never raised.
    """
    from communicator.utils import send_sms

    numbers = pharmacist_mobiles(partner) or ([partner.sms_mobile] if partner.sms_mobile else [])
    for number in numbers:
        try:
            send_sms(number, text, organization=organization)
        except Exception:  # noqa: BLE001 - an SMS problem must never stop the prescription
            log.exception("pharmacy portal: SMS to the pharmacy %s failed", partner.pk)
    return numbers


def new_rx_sms_text(partner):
    """No drug, diagnosis or patient in an SMS (RA 10173): only that something is waiting, and where."""
    from django.conf import settings

    base = getattr(settings, "FRONTEND_BASE_URL", "https://www.powerhealthit.com").rstrip("/")
    return f"New POWER e-Rx for {partner.name}. Open the portal: {base}/pharmacy-portal"


# SMS for every notice would cost a text each; only new prescriptions are texted (sms_pharmacy, from route()).
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
        # and a text, once the signing is saved (a failed or slow SMS never blocks signing)
        from django.db import transaction

        partner, org = portal_rx.partner, rx.organization
        transaction.on_commit(lambda: sms_pharmacy(partner, new_rx_sms_text(partner), org))

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
