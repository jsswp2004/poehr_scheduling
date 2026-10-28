"""
Communicator data sources for custom reports (messages sent, SMS replies, contacts).

They register on the same engine as the Staffing sources (staffing.custom_reports). Message text is never
included, only who it went to, when, by which channel and whether it was delivered. Access follows the
"messages.view_logs" right, the one that already gates the Communicator's message log.
"""

import datetime

from django.db.models import Q
from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "messages.view_logs"

STATUS_LABELS = {
    "sent": "Sent",
    "failed": "Failed",
    "received": "Reply received",
    "blocked_no_consent": "Blocked: no consent",
    "blocked_opted_out": "Blocked: opted out",
}
CHANNEL_LABELS = {"sms": "SMS", "email": "Email", "webhook": "SMS reply"}
BLOCKED = {"blocked_no_consent", "blocked_opted_out"}


def _local_date(dt):
    return timezone.localtime(dt).date() if timezone.is_aware(dt) else dt.date()


def _monday(d):
    return d - datetime.timedelta(days=d.weekday())


def _status(raw):
    raw = raw or ""
    return STATUS_LABELS.get(raw) or (raw.replace("_", " ").capitalize() if raw else "Unknown")


def _person(user):
    if not user:
        return "System"
    return (user.get_full_name() or user.get_username() or "System").strip() or "System"


def _message_qs(org, start, end, types):
    from communicator.models import MessageLog

    return (
        MessageLog.objects.filter(message_type__in=types, created_at__date__gte=start, created_at__date__lte=end)
        .filter(Q(user__organization=org) | Q(organization=org))
        .select_related("user")
        .order_by("created_at")
    )


def load_messages(org, start, end):
    rows = []
    for m in _message_qs(org, start, end, ("sms", "email")):
        d = _local_date(m.created_at)
        raw = m.status or ""
        rows.append(
            {
                "date": d.isoformat(),
                "week": _monday(d).isoformat(),
                "channel": CHANNEL_LABELS.get(m.message_type, m.message_type),
                "status": _status(raw),
                "sender": _person(m.user),
                "recipient": m.recipient,
                "subject": m.subject or None,
                "messages": 1,
                "sent": 1 if raw == "sent" else 0,
                "failed": 1 if raw == "failed" else 0,
                "blocked": 1 if raw in BLOCKED else 0,
            }
        )
    return rows


def _keyword(body):
    text = (body or "").replace("Webhook:", "", 1).strip()
    return text.split()[0].upper()[:20] if text else "(empty)"


def load_replies(org, start, end):
    rows = []
    for m in _message_qs(org, start, end, ("webhook",)):
        d = _local_date(m.created_at)
        rows.append(
            {
                "date": d.isoformat(),
                "week": _monday(d).isoformat(),
                "recipient": m.recipient,
                "keyword": _keyword(m.body),
                "replies": 1,
            }
        )
    return rows


def load_contacts(org, start, end):
    from communicator.models import Contact

    rows = []
    for c in Contact.objects.filter(uploaded_by__organization=org).select_related("uploaded_by").order_by("name"):
        rows.append(
            {
                "name": c.name,
                "has_phone": "Yes" if c.phone else "No",
                "has_email": "Yes" if c.email else "No",
                "sms_status": "Opted out" if c.sms_opt_out else "Can receive SMS",
                "opt_out_date": _local_date(c.sms_opt_out_date).isoformat() if c.sms_opt_out_date else None,
                "opt_out_method": c.sms_opt_out_method or None,
                "uploaded_by": _person(c.uploaded_by),
                "added": _local_date(c.created_at).isoformat(),
                "contacts": 1,
            }
        )
    return rows


register(
    "comm_messages", "Messages sent", "Messages", "Every SMS and email sent, with whether it was delivered. Message text is not included.",
    [
        dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("channel", "Channel"), dim("status", "Status"),
        dim("sender", "Sent by"), dim("recipient", "Recipient"), dim("subject", "Subject"),
        measure("messages", "Messages"), measure("sent", "Sent"), measure("failed", "Failed"), measure("blocked", "Blocked"),
        measure("failure_pct", "Failure %", "percent", ratio=("failed", "messages")),
        measure("recipients", "People reached", agg="distinct", of="recipient"),
    ],
    load_messages,
    default_columns=["channel", "messages", "sent", "failed", "blocked", "failure_pct"], default_group="channel",
    module="communicator", right=RIGHT,
)
register(
    "comm_replies", "SMS replies", "Messages", "Texts people sent back, with the keyword (STOP, START, HELP and so on).",
    [
        dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("keyword", "Keyword"), dim("recipient", "From"),
        measure("replies", "Replies"), measure("people", "People", agg="distinct", of="recipient"),
    ],
    load_replies,
    default_columns=["keyword", "replies", "people"], default_group="keyword",
    module="communicator", right=RIGHT,
)
register(
    "comm_contacts", "Contacts", "Contacts", "One row per contact, with SMS opt-out status. Not limited by date.",
    [
        dim("name", "Name"), dim("sms_status", "SMS status"), dim("opt_out_date", "Opted out on", "date"),
        dim("opt_out_method", "Opted out by"), dim("has_phone", "Has a phone"), dim("has_email", "Has an email"),
        dim("uploaded_by", "Added by"), dim("added", "Added on", "date"), measure("contacts", "Contacts"),
    ],
    load_contacts, dated=False,
    default_columns=["sms_status", "contacts"], default_group="sms_status",
    module="communicator", right=RIGHT,
)
