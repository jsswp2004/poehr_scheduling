"""
Lab interface usage per clinic per month, for billing the add-on.

Nothing is stored for this: every number is counted from the records the interface
already keeps (reports, inbound and outbound messages), so it can never drift from
what really happened. Months run on the server's time zone.

Per clinic and month:
  orders_sent        orders handed to the lab's engine (new-order messages created; withdrawn ones excluded)
  orders_accepted    of those, confirmed accepted by the lab in the month
  orders_rejected    rejected by the lab in the month
  cancellations_sent order cancellations sent
  results_messages   result messages received from labs
  results_filed      reports created from the lab interface (the usual per-result billing unit)
  results_held       messages held for staff because the patient could not be matched safely
  scans_uploaded / results_entered_manually   base-product use, shown for information only
"""

import csv
import io
from datetime import date

from django.utils import timezone

from users.models import Organization

from .models import LabInboundMessage, LabInterfaceConnection, LabOutboundMessage, LabReport

COLUMNS = [
    "organization_id", "organization", "month", "addon_enabled", "connections_active",
    "orders_sent", "orders_accepted", "orders_rejected", "cancellations_sent",
    "results_messages", "results_filed", "results_held",
    "scans_uploaded", "results_entered_manually",
]


def parse_month(text=None):
    """'2026-10' -> (start, end) aware datetimes; None -> the current month."""
    today = timezone.localdate()
    if text:
        try:
            year, month = (int(x) for x in str(text).split("-"))
            first = date(year, month, 1)
        except (ValueError, TypeError):
            raise ValueError("Month must look like 2026-10.")
    else:
        first = today.replace(day=1)
    nxt = date(first.year + (first.month == 12), first.month % 12 + 1, 1)
    tz = timezone.get_current_timezone()
    make = lambda d: timezone.make_aware(timezone.datetime(d.year, d.month, d.day), tz)
    return first, make(first), make(nxt)


def usage(month=None, organization=None):
    """A list of dicts (one per clinic with the add-on or any activity), in COLUMNS order."""
    first, start, end = parse_month(month)
    in_month = lambda field: {f"{field}__gte": start, f"{field}__lt": end}
    orgs = Organization.objects.all()
    if organization is not None:
        orgs = orgs.filter(pk=organization.pk)
    rows = []
    for org in orgs.order_by("name", "pk"):
        out = LabOutboundMessage.objects.filter(organization=org)
        inbound = LabInboundMessage.objects.filter(organization=org, **in_month("received_at"))
        reports = LabReport.objects.filter(organization=org, **in_month("created_at"))
        row = {
            "organization_id": org.pk,
            "organization": org.name,
            "month": first.strftime("%Y-%m"),
            "addon_enabled": bool(org.lab_interface_enabled),
            "connections_active": LabInterfaceConnection.objects.filter(organization=org, is_active=True).count(),
            "orders_sent": out.filter(action="NW", **in_month("created_at")).exclude(status="cancelled").count(),
            "orders_accepted": out.filter(action="NW", status="acknowledged", **in_month("acknowledged_at")).count(),
            "orders_rejected": out.filter(action="NW", status="rejected", **in_month("acknowledged_at")).count(),
            "cancellations_sent": out.filter(action="CA", **in_month("created_at")).exclude(status="cancelled").count(),
            "results_messages": inbound.count(),
            "results_filed": reports.filter(source="interface").count(),
            "results_held": inbound.filter(status__in=("unmatched", "assigned", "dismissed")).count(),
            "scans_uploaded": reports.filter(source="scan").count(),
            "results_entered_manually": reports.filter(source="manual").count(),
        }
        active = row["addon_enabled"] or any(
            row[k] for k in COLUMNS[5:12]
        )
        if active:
            rows.append(row)
    return rows


def to_csv(rows):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()
