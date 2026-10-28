"""
Vaccine and screening data source for custom reports (one row per dose given, or per decision not to give one).

Patient names and the free-text notes are fields that Hide PHI masks. Access follows the "immunizations.view"
right. Immunization records are not tied to a facility, so they are not narrowed by a user's facility
assignment. Each run is audit-logged.
"""

import datetime

from django.utils import timezone

from .custom_reports import dim, measure, register

RIGHT = "immunizations.view"
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
STATUS = {"done": "Done", "not_done": "Not done", "entered_in_error": "Entered in error"}
SOURCE = {"given_here": "Given here", "historical": "Historical entry", "registry": "Registry"}
REASON = {
    "declined": "Patient or parent declined", "medical": "Medical reason", "illness": "Temporary illness",
    "immune": "Evidence of immunity", "given_elsewhere": "Given elsewhere", "unavailable": "Vaccine not available",
    "other": "Other",
}
KIND = {"vaccine": "Vaccine", "screening": "Screening"}


def _person(user, blank="Unknown"):
    if not user:
        return blank
    return (user.get_full_name() or user.get_username() or blank).strip() or blank


def load_vaccines(org, start, end, user=None):
    from django.db.models import Q

    from appointments.models import PatientImmunization

    qs = (
        PatientImmunization.all_objects.filter(organization=org)
        .filter(
            Q(given_on__gte=start, given_on__lte=end)
            | Q(given_on__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )
        .select_related("patient", "item", "product", "given_by")
        .order_by("id")
    )
    rows = []
    for r in qs:
        day = r.given_on or timezone.localtime(r.created_at).date()
        name = (r.item.display_name or r.item.name) if r.item_id else "Unknown"
        done = r.status == "done"
        rows.append(
            {
                "date": day.isoformat(),
                "week": (day - datetime.timedelta(days=day.weekday())).isoformat(),
                "month": day.strftime("%Y-%m"),
                "weekday": WEEKDAYS[day.weekday()],
                "item": name,
                "kind": KIND.get(r.item.kind, r.item.kind) if r.item_id else "Unknown",
                "product": (r.product.short_name if r.product_id and r.product.short_name else "Not set"),
                "dose": f"Dose {r.dose_number}",
                "status": STATUS.get(r.status, r.status),
                "source": SOURCE.get(r.source, r.source),
                "reason": REASON.get(r.not_done_reason, "None") if r.not_done_reason else "None",
                "given_by": _person(r.given_by, "Not recorded"),
                "route": (r.route or "").strip() or "Not set",
                "site": (r.site or "").strip() or "Not set",
                "lot": (r.lot_number or "").strip() or "Not set",
                "patient": _person(r.patient, "Unknown patient"),
                "notes": (r.notes or "").strip() or None,
                "_patient": r.patient_id,
                "records": 1,
                "given": 1 if done else 0,
                "not_done": 1 if r.status == "not_done" else 0,
                "declined": 1 if r.status == "not_done" and r.not_done_reason == "declined" else 0,
                "in_error": 1 if r.status == "entered_in_error" else 0,
                "historical": 1 if r.source == "historical" else 0,
                "vis_given": 1 if done and r.vis_given else 0,
                "screened": 1 if done and r.screening_reviewed else 0,
            }
        )
    return rows


register(
    "vaccines", "Vaccines and screenings", "Vaccines",
    "One row per dose given or decision not to give one: vaccine, product, status, reason, who gave it. "
    "Each run is audit-logged.",
    [
        dim("date", "Date", "date"), dim("week", "Week of", "date"), dim("month", "Month"), dim("weekday", "Day of week"),
        dim("item", "Vaccine or screening"), dim("kind", "Type"), dim("product", "Product"), dim("dose", "Dose"),
        dim("status", "Status"), dim("source", "Source"), dim("reason", "Reason not done"), dim("given_by", "Given by"),
        dim("route", "Route"), dim("site", "Site"), dim("lot", "Lot number"),
        dim("patient", "Patient", phi="name"), dim("notes", "Notes", phi="text"),
        measure("records", "Records"), measure("given", "Given"), measure("not_done", "Not done"),
        measure("declined", "Declined"), measure("in_error", "Entered in error"), measure("historical", "Historical entries"),
        measure("given_pct", "Given %", "percent", ratio=("given", "records")),
        measure("declined_pct", "Declined %", "percent", ratio=("declined", "records")),
        measure("vis_pct", "Information sheet given %", "percent", ratio=("vis_given", "given")),
        measure("screened_pct", "Screening reviewed %", "percent", ratio=("screened", "given")),
        measure("patients", "Patients", agg="distinct", of="_patient"),
    ],
    load_vaccines,
    default_columns=["item", "records", "given", "not_done", "declined", "declined_pct"],
    default_group="item",
    module="vaccines", right=RIGHT, patient_data=True,
)
