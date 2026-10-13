"""
Tools for the in-app Scheduler assistant (see appointments/scheduler_assistant.py).

HOW PERMISSIONS WORK
--------------------
The assistant never queries appointments itself and never uses a service account. Every read tool runs the
EXISTING AppointmentViewSet (or the availability view) as the signed-in user, through DRF's request factory
(APIRequestFactory + force_authenticate). So the app's own scoping applies exactly as it does for the app's own
screens: a doctor sees their own appointments, staff see their organization's.

Data minimisation, on purpose:
  1. Only what a schedule needs is handed to the model: time, patient name, provider, visit type, status.
     Descriptions, phone numbers, emails and clinical data never reach it.
  2. A system admin's assistant only ever reads their OWN organization's schedule, even though the app's list
     endpoint would let them see every organization.

THREADING: tools run one after another in the request's own thread.
"""

import datetime
import json
import logging

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework.test import APIRequestFactory, force_authenticate

from users.rights import user_has_right

from .views import AppointmentViewSet, doctor_available_slots

logger = logging.getLogger(__name__)

# Same roles that may open the Scheduler (the Patients page, Appointments tab) in the web app.
ROLES = ("admin", "system_admin", "doctor", "nurse", "registrar")

MAX_RESULT_CHARS = 12000   # what one tool result may weigh before we ask for a narrower question
MAX_ROWS = 25              # rows of any list handed to the model
MAX_DAYS = 60              # longest look-back / look-ahead for a search

_factory = APIRequestFactory()


class ToolError(Exception):
    """A problem the model can read and explain to the user (never a stack trace)."""


# --------------------------------------------------------------------------
# Who may use the assistant, and which tools they get
# --------------------------------------------------------------------------
def can_use(user):
    return bool(getattr(user, "is_authenticated", False)) and getattr(user, "role", None) in ROLES


TOOLS = {}


def tool(name, description, properties=None, required=None, right=None):
    """Register a tool. `right` = a users.rights code the user must also hold."""

    def wrap(fn):
        TOOLS[name] = {
            "fn": fn,
            "right": right,
            "definition": {
                "name": name,
                "description": description,
                "input_schema": {
                    "type": "object",
                    "properties": properties or {},
                    "required": required or [],
                },
            },
        }
        return fn

    return wrap


def allowed(user, name):
    spec = TOOLS.get(name)
    if spec is None or not can_use(user):
        return False
    if spec["right"] and not user_has_right(user, spec["right"]):
        return False
    return True


def tools_for(user):
    """The tool definitions this user's assistant is offered."""
    return [spec["definition"] for name, spec in TOOLS.items() if allowed(user, name)]


def run_tool(user, name, args):
    """Run one tool. Returns (result_dict, is_error). Never raises."""
    if not allowed(user, name):
        return {"error": "That isn't available with this account."}, True
    if not isinstance(args, dict):
        args = {}
    try:
        result = TOOLS[name]["fn"](user, args)
        if len(json.dumps(result, default=str)) > MAX_RESULT_CHARS:
            raise ToolError("That is too much data to read at once. Ask for one day or a narrower search.")
        return result, False
    except ToolError as e:
        return {"error": str(e)}, True
    except Exception:  # noqa: BLE001 - the model gets a safe message, the log gets the trace
        logger.exception("scheduler assistant tool %s failed", name)
        return {"error": "Something went wrong looking that up."}, True


# --------------------------------------------------------------------------
# Calling the existing views as the user
# --------------------------------------------------------------------------
def _call(view, user, params=None, **kwargs):
    """Run an existing GET view as `user` and return its data (raises ToolError on refusal)."""
    query = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    request = _factory.get("/api/appointments/", query)
    force_authenticate(request, user=user)
    response = view(request, **kwargs)
    data = getattr(response, "data", None)
    code = response.status_code
    if code >= 400:
        if code in (401, 403):
            raise ToolError("You don't have access to that information.")
        if code == 404:
            raise ToolError("That appointment wasn't found.")
        raise ToolError(f"The request could not be completed ({code}).")
    return data


def _as_list(data):
    if isinstance(data, dict):
        return list(data.get("results") or [])
    return list(data or [])


def _own_org(user, rows):
    """A system admin's list endpoint spans every organization; the assistant stays in their own."""
    if getattr(user, "role", None) == "system_admin":
        org_id = getattr(user, "organization_id", None)
        return [r for r in rows if r.get("organization") == org_id]
    return rows


def _appointments(user, params=None):
    rows = _as_list(_call(AppointmentViewSet.as_view({"get": "list"}), user, params))
    return _own_org(user, rows)


def get_appointment(user, appointment_id):
    """One appointment the user is allowed to see, as the serializer's dict."""
    try:
        pk = int(appointment_id)
    except (TypeError, ValueError):
        raise ToolError("appointment_id must be a number from a previous lookup.")
    data = _call(AppointmentViewSet.as_view({"get": "retrieve"}), user, None, pk=pk)
    if not isinstance(data, dict):
        raise ToolError("That appointment wasn't found.")
    if getattr(user, "role", None) == "system_admin" and data.get("organization") != getattr(user, "organization_id", None):
        raise ToolError("That appointment wasn't found.")
    return data


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def _local(dt_text):
    dt = parse_datetime(str(dt_text or ""))
    if dt is None:
        return None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return timezone.localtime(dt)


def when_text(dt_text):
    dt = _local(dt_text)
    return dt.strftime("%a %b %d, %I:%M %p").replace(" 0", " ") if dt else str(dt_text or "")


def visit_state(row):
    if row.get("no_show"):
        return "no-show"
    if row.get("arrived"):
        return "arrived"
    return row.get("status") or "scheduled"


def brief(row):
    return {
        "id": row.get("id"),
        "when": when_text(row.get("appointment_datetime")),
        "patient": row.get("patient_name") or "Unknown",
        "provider": row.get("provider_name") or "Unassigned",
        "visit": str(row.get("title") or "")[:60],
        "minutes": row.get("duration_minutes"),
        "status": visit_state(row),
    }


def _parse_day(raw, default):
    if raw in (None, ""):
        return default
    day = parse_date(str(raw))
    if day is None:
        raise ToolError("Dates must look like 2026-10-14.")
    return day


def _clamp(raw, default):
    try:
        n = int(raw) if raw not in (None, "") else default
    except (TypeError, ValueError):
        raise ToolError("That must be a number.")
    return max(0, min(n, MAX_DAYS))


def _provider_ok(row, provider_id):
    if provider_id in (None, ""):
        return True
    try:
        return row.get("provider") == int(provider_id)
    except (TypeError, ValueError):
        raise ToolError("provider_id must be a number from find_provider.")


# --------------------------------------------------------------------------
# Read tools
# --------------------------------------------------------------------------
@tool(
    "get_schedule",
    "The appointments on ONE day (default today) that the signed-in user can see, in time order, with counts by "
    "state (scheduled, arrived, no-show, completed, cancelled, pending). Optionally for one provider.",
    {
        "date": {"type": "string", "description": "YYYY-MM-DD. Defaults to today."},
        "provider_id": {"type": "integer", "description": "Only this provider's appointments (from find_provider)."},
    },
)
def get_schedule(user, args):
    day = _parse_day(args.get("date"), timezone.localdate())
    rows = [
        r
        for r in _appointments(user, {"date": day.isoformat()})
        if (_local(r.get("appointment_datetime")) or timezone.localtime()).date() == day and _provider_ok(r, args.get("provider_id"))
    ]
    rows.sort(key=lambda r: str(r.get("appointment_datetime")))
    counts = {}
    for r in rows:
        key = visit_state(r)
        counts[key] = counts.get(key, 0) + 1
    result = {"date": day.isoformat(), "total": len(rows), "counts": counts, "appointments": [brief(r) for r in rows[:MAX_ROWS]]}
    if len(rows) > MAX_ROWS:
        result["note"] = f"Showing the first {MAX_ROWS} of {len(rows)}."
    return result


@tool(
    "search_appointments",
    "Find appointments by patient name, provider name, visit type or status, within a window around today. "
    "Returns the appointment id (needed to approve, deny or mark one), time, patient, provider and state.",
    {
        "query": {"type": "string", "description": "Part of a patient name, provider name, visit type or status."},
        "days_back": {"type": "integer", "description": f"How many days into the past to include (default 0, at most {MAX_DAYS})."},
        "days_ahead": {"type": "integer", "description": f"How many days ahead to include (default 30, at most {MAX_DAYS})."},
        "limit": {"type": "integer", "description": f"How many to return (default 10, at most {MAX_ROWS})."},
    },
    required=["query"],
)
def search_appointments(user, args):
    query = str(args.get("query") or "").strip()
    if len(query) < 2:
        raise ToolError("Give at least two characters to search for.")
    back, ahead = _clamp(args.get("days_back"), 0), _clamp(args.get("days_ahead"), 30)
    try:
        limit = max(1, min(int(args.get("limit") or 10), MAX_ROWS))
    except (TypeError, ValueError):
        limit = 10
    today = timezone.localdate()
    lo, hi = today - datetime.timedelta(days=back), today + datetime.timedelta(days=ahead)
    hits = []
    for r in _appointments(user, {"search": query}):
        d = _local(r.get("appointment_datetime"))
        if d and lo <= d.date() <= hi:
            hits.append(r)
    hits.sort(key=lambda r: str(r.get("appointment_datetime")))
    return {
        "from": lo.isoformat(),
        "to": hi.isoformat(),
        "total_matches": len(hits),
        "matches": [brief(r) for r in hits[:limit]],
        "note": "If more than one patient matches a name, ask the user which one they mean.",
    }


@tool(
    "get_pending_requests",
    "Appointment requests patients submitted that are still waiting for approval, oldest appointment first.",
)
def get_pending_requests(user, args):
    rows = [r for r in _appointments(user, {"search": "pending"}) if r.get("status") == "pending"]
    rows.sort(key=lambda r: str(r.get("appointment_datetime")))
    result = {"total": len(rows), "requests": [brief(r) for r in rows[:MAX_ROWS]]}
    if len(rows) > MAX_ROWS:
        result["note"] = f"Showing the first {MAX_ROWS} of {len(rows)}."
    return result


@tool(
    "find_provider",
    "Find a provider (doctor) in the user's organization by name. Returns the provider id needed for "
    "get_schedule and get_open_slots.",
    {"query": {"type": "string", "description": "Part of the provider's first or last name."}},
    required=["query"],
)
def find_provider(user, args):
    query = str(args.get("query") or "").strip().lower()
    if len(query) < 2:
        raise ToolError("Give at least two characters of the provider's name.")
    org_id = getattr(user, "organization_id", None)
    if not org_id:
        raise ToolError("This account isn't tied to an organization.")
    User = get_user_model()
    found = []
    for u in User.objects.filter(role="doctor", organization_id=org_id).order_by("last_name", "first_name")[:200]:
        full = f"{u.first_name} {u.last_name}".strip()
        if query in full.lower():
            found.append({"id": u.id, "name": f"Dr. {full}" if full else str(u.id)})
    return {"matches": found[:10], "total_matches": len(found)}


@tool(
    "get_open_slots",
    "The next open appointment times for one provider (weekdays 8 am to 5 pm, skipping booked and blocked times).",
    {"provider_id": {"type": "integer", "description": "From find_provider."}},
    required=["provider_id"],
)
def get_open_slots(user, args):
    try:
        provider_id = int(args.get("provider_id"))
    except (TypeError, ValueError):
        raise ToolError("provider_id must be a number from find_provider.")
    if not get_user_model().objects.filter(id=provider_id, role="doctor", organization_id=getattr(user, "organization_id", None)).exists():
        raise ToolError("That provider isn't in this organization.")
    request = _factory.get("/api/doctors/")
    force_authenticate(request, user=user)
    response = doctor_available_slots(request, doctor_id=provider_id)
    if response.status_code >= 400:
        raise ToolError("Could not read that provider's availability.")
    slots = [when_text(s) for s in (response.data or [])]
    return {"provider_id": provider_id, "next_open_slots": slots, "note": "These are the next few openings, not every opening."}
