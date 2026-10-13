"""
Tools for the in-app staffing assistant (see staffing/assistant.py).

HOW PERMISSIONS WORK
--------------------
The assistant never queries the database itself and never uses a service
account. Every tool runs one of the EXISTING staffing views as the signed-in
user, through DRF's request factory (APIRequestFactory + force_authenticate).
So each view's own permission class, organization scoping and system-admin
organization switching apply exactly as they do for the app's own screens.

Three things the existing views do NOT enforce, which the assistant adds on
purpose:

  1. A role-'staff' login may read every coworker's shift through the shared
     calendar (a deliberate app decision). In the assistant, staff may only ask
     about THEIR OWN schedule: staff are only offered own-data tools, and
     run_tool() re-checks every call (allowed()) so a model that asks for a
     manager tool on behalf of a staff user is refused server-side.
  2. Coverage status contains coworker names (the `critical` list). The staff
     version of "my coverage" reports status and head-counts only, no names and
     no reasons.
  3. Data minimisation: free-text fields (a staff member's reason for time off,
     admin notes on other people's requests, shift notes) are not passed to the
     model unless the answer needs them.

THREADING: tools must run in the request's own thread, never a thread pool. The
tenant context (poehr_scheduling_backend.tenancy) is thread-local and fails
closed (empty results) in any other thread. Run them one after another.
"""

import datetime
import json
import logging
import re

from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from . import org_scope
from .compliance_views import CoverageStatusView
from .coverage_core import AT_RISK, MET, NOT_MET
from .coverage_status import MAX_RANGE_DAYS, NONE, UNKNOWN
from .models import SHIFT_TYPE_CHOICES
from .timeoff_views import MyTimeOffView, TimeOffCoverCandidatesView, TimeOffListCreateView
from .views import (
    ADMIN_ROLES,
    MANAGER_ROLES,
    STAFF_LOGIN_ROLE,
    CoverageComplianceReportView,
    LaborHoursReportView,
    MyShiftsView,
    StaffShiftViewSet,
    StaffViewSet,
    UnscheduledStaffReportView,
)

logger = logging.getLogger(__name__)

MODE_MANAGER = "manager"
MODE_STAFF = "staff"

SHIFT_CODES = [code for code, _label in SHIFT_TYPE_CHOICES]
MAX_RESULT_CHARS = 14000   # what one tool result may weigh before we ask for a narrower question
MAX_ROWS = 40              # rows of any list handed to the model
_NEEDS_ATTENTION = {NOT_MET, AT_RISK, UNKNOWN}
_STATUS_RANK = {NOT_MET: 0, AT_RISK: 1, UNKNOWN: 2, MET: 3, NONE: 4}

_factory = APIRequestFactory()


class ToolError(Exception):
    """A problem the model can read and explain to the user (never a stack trace)."""


# --------------------------------------------------------------------------
# Who may use the assistant, and which tools they get
# --------------------------------------------------------------------------
def mode_for(user):
    """'manager', 'staff', or None (no assistant for this account)."""
    role = getattr(user, "role", None)
    if role in MANAGER_ROLES:  # same list the whole Staffing module uses
        return MODE_MANAGER
    if role == STAFF_LOGIN_ROLE and getattr(user, "staff_profile", None) is not None:
        return MODE_STAFF
    return None


TOOLS = {}


def tool(name, description, properties=None, required=None, modes=(MODE_MANAGER,), admin_only=False):
    def wrap(fn):
        TOOLS[name] = {
            "fn": fn,
            "modes": frozenset(modes),
            "admin_only": admin_only,
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
    mode = mode_for(user)
    if spec is None or mode is None or mode not in spec["modes"]:
        return False
    if spec["admin_only"] and getattr(user, "role", None) not in ADMIN_ROLES:
        return False
    return True


def tools_for(user):
    """The tool definitions this user's assistant is offered."""
    return [spec["definition"] for name, spec in TOOLS.items() if allowed(user, name)]


def run_tool(user, name, args, org_id=None):
    """Run one tool. Returns (result_dict, is_error). Never raises."""
    if not allowed(user, name):
        return {"error": "That isn't available with this account."}, True
    if not isinstance(args, dict):
        args = {}
    try:
        result = TOOLS[name]["fn"](user, args, org_id)
        if len(json.dumps(result, default=str)) > MAX_RESULT_CHARS:
            raise ToolError("That is too much data to read at once. Ask for a shorter date range or one unit.")
        return result, False
    except ToolError as e:
        return {"error": str(e)}, True
    except Exception:  # noqa: BLE001 - the model gets a safe message, the log gets the trace
        logger.exception("assistant tool %s failed", name)
        return {"error": "Something went wrong looking that up."}, True


# --------------------------------------------------------------------------
# Calling the existing views as the user
# --------------------------------------------------------------------------
def _call(view, user, params=None, org_id=None, **url_kwargs):
    """Run an existing view as `user` and return its data (raises ToolError on refusal)."""
    query = {k: v for k, v in (params or {}).items() if v not in (None, "")}
    if org_id and org_scope.is_system_admin(user):
        query["organization"] = org_id  # system admin acting on another organization
    request = _factory.get("/api/staffing/", query)
    force_authenticate(request, user=user)
    response = view(request, **url_kwargs)
    data = getattr(response, "data", None)
    code = response.status_code
    if code >= 400:
        if code in (401, 403):
            raise ToolError("You don't have access to that information.")
        message = data.get("error") if isinstance(data, dict) else None
        if code == 404:
            raise ToolError(message or "That record was not found.")
        raise ToolError(message or f"The request could not be completed ({code}).")
    return data


def _as_list(data):
    if isinstance(data, dict):
        for key in ("results", "rows", "staff"):
            if isinstance(data.get(key), list):
                return list(data[key])
        return []
    return list(data or [])


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def _parse_date(raw, label):
    if raw in (None, ""):
        return None
    try:
        return datetime.date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        raise ToolError(f"{label} must be a date like 2026-10-14.")


def _range(args, default_days=0, max_days=MAX_RANGE_DAYS):
    today = timezone.localdate()
    start = _parse_date(args.get("start"), "start") or today
    end = _parse_date(args.get("end"), "end") or (start + datetime.timedelta(days=default_days))
    if end < start:
        raise ToolError("end must be on or after start.")
    if (end - start).days > max_days:
        raise ToolError(f"Please ask for {max_days} days or fewer at a time.")
    return start, end


def _week_range(args):
    """Monday-Sunday of the current week unless start/end are given (matches the app's reports)."""
    today = timezone.localdate()
    if args.get("start") or args.get("end"):
        return _range(args, default_days=6)
    monday = today - datetime.timedelta(days=today.weekday())
    return monday, monday + datetime.timedelta(days=6)


def _span(start, end):
    return {"start": start.isoformat(), "end": end.isoformat()}


def _weekday(iso):
    try:
        return datetime.date.fromisoformat(iso).strftime("%A")
    except (TypeError, ValueError):
        return None


def _hhmm(value):
    return value[:5] if isinstance(value, str) and len(value) >= 5 else value


def _norm(text):
    return re.sub(r"[,\s]+", " ", (text or "").strip().lower()).strip()


def _shift_row(s, include_staff=True):
    row = {
        "date": s.get("date"),
        "weekday": _weekday(s.get("date")),
        "shift": s.get("shift_type_display") or s.get("shift_type"),
        "start": _hhmm(s.get("start_time")),
        "end": _hhmm(s.get("end_time")),
        "unit": s.get("unit_name"),
    }
    if include_staff:
        row["staff"] = s.get("staff_name")
        row["profession"] = s.get("profession")
    return row


def _staff_brief(s):
    return {
        "id": s.get("id"),
        "name": s.get("full_name"),
        "profession": s.get("profession"),
        "nursing_role": s.get("nursing_role_display") or s.get("nursing_role"),
        "phone": s.get("phone_number"),
        "email": s.get("email"),
        "active": s.get("is_active"),
        "has_app_login": s.get("has_login"),
    }


def _hours(shift):
    st, en = shift.get("start_time"), shift.get("end_time")
    if not st or not en or not shift.get("date"):
        return None
    day = datetime.date.fromisoformat(shift["date"])
    a = datetime.datetime.combine(day, datetime.time.fromisoformat(st))
    b = datetime.datetime.combine(day, datetime.time.fromisoformat(en))
    if b <= a:  # crosses midnight (same convention as the app)
        b += datetime.timedelta(days=1)
    return (b - a).total_seconds() / 3600.0


# ---- roster lookup ---------------------------------------------------------
def _roster(user, org_id):
    return _as_list(_call(StaffViewSet.as_view({"get": "list"}), user, {}, org_id))


def _match(roster, query, include_profession=True):
    tokens = [t for t in _norm(query).split(" ") if t]
    found = []
    for s in roster:
        hay = _norm(f'{s.get("first_name", "")} {s.get("last_name", "")}')
        if include_profession:
            hay += " " + _norm(s.get("profession"))
        if all(t in hay for t in tokens):
            found.append(s)
    return found


def _resolve_staff(user, args, org_id):
    """Returns (staff_dict, None) or (None, tool_result_to_return_to_the_model)."""
    roster = _roster(user, org_id)
    staff_id = args.get("staff_id")
    if staff_id not in (None, ""):
        for s in roster:
            if str(s.get("id")) == str(staff_id):
                return s, None
        return None, {"found": False, "message": "No staff member with that id is on this roster."}
    name = (args.get("staff_name") or "").strip()
    if not name:
        raise ToolError("Which staff member? I need a name.")
    matches = _match(roster, name, include_profession=False)
    if not matches:
        return None, {"found": False, "message": f'No staff member matches "{name}".'}
    exact = [s for s in matches if _norm(s.get("full_name")) == _norm(name)]
    if len(exact) == 1:
        return exact[0], None
    if len(matches) == 1:
        return matches[0], None
    active = [s for s in matches if s.get("is_active")]
    if len(active) == 1:
        return active[0], None
    return None, {
        "found": False,
        "needs_clarification": True,
        "message": "More than one staff member matches. Ask the user which one they mean.",
        "matches": [_staff_brief(s) for s in matches[:8]],
    }


# ---- who is out ---------------------------------------------------------------
def _time_off_for(user, org_id, start, end, staff_id=None):
    data = _call(
        TimeOffListCreateView.as_view(),
        user,
        {"start": start.isoformat(), "end": end.isoformat(), "staff": staff_id},
        org_id,
    )
    return _as_list(data)


def _takes_out(r):
    """Same rule the coverage engine uses (StaffTimeOffRequest.takes_staff_out)."""
    if r.get("kind") == "emergency":
        return r.get("status") in ("open", "resolved")
    return r.get("status") == "approved"


def _out_reason(shift, requests):
    for r in requests:
        if r.get("staff_id") != shift.get("staff") or not _takes_out(r):
            continue
        if r.get("shift_id"):
            if r["shift_id"] != shift.get("id"):
                continue
        elif not (r["start_date"] <= shift["date"] <= r["end_date"]):
            continue
        if r.get("kind") == "emergency":
            return "call-out, needs cover" if r.get("status") == "open" else "call-out, cover arranged"
        return "approved time off"
    return None


# --------------------------------------------------------------------------
# Shared schema pieces
# --------------------------------------------------------------------------
_START = {"type": "string", "description": "First date, YYYY-MM-DD. Defaults to today."}
_END = {"type": "string", "description": "Last date, YYYY-MM-DD. Defaults to the start date."}
_DATE = {"type": "string", "description": "A single date, YYYY-MM-DD. Defaults to today."}
_UNIT = {"type": "integer", "description": "Optional unit id to limit the result to one unit."}
_SHIFT = {
    "type": "string",
    "enum": SHIFT_CODES,
    "description": "Optional shift type.",
}


# ==========================================================================
# MANAGER TOOLS  (admin, system_admin, doctor, nurse, registrar accounts)
# ==========================================================================
@tool(
    "get_coverage_status",
    "Staffing coverage for the whole organization over a date or date range: for each day whether "
    "required staffing is met, at risk or not met, and which units/shifts are short and why. "
    "Use for questions like 'what is our coverage today / next week'.",
    {"start": _START, "end": _END, "unit_id": _UNIT},
)
def get_coverage_status(user, args, org_id):
    start, end = _range(args)
    data = _call(
        CoverageStatusView.as_view(),
        user,
        {"start": start.isoformat(), "end": end.isoformat(), "unit": args.get("unit_id")},
        org_id,
    )
    single = start == end
    days = {}
    for iso, info in sorted(data["days"].items()):
        items = info.get("items", [])
        quiet = (
            info["status"] in (MET, NONE)
            and not info.get("open_emergencies")
            and not info.get("pending_requests")
        )
        if not single and quiet:
            continue  # on a range, only report days that need attention
        shown = items if single else [i for i in items if i.get("status") in _NEEDS_ATTENTION]
        days[iso] = {
            "weekday": _weekday(iso),
            "status": info["status"],
            "open_call_outs": info.get("open_emergencies", 0),
            "pending_time_off_requests": info.get("pending_requests", 0),
            "shifts": [_item_brief(i) for i in shown][:MAX_ROWS],
        }
    return {
        "range": _span(start, end),
        "days_checked": (end - start).days + 1,
        "summary": data.get("summary"),
        "standard": data.get("state_name") or None,
        "warnings": (data.get("warnings") or [])[:5],
        "days": days,
        "note": "On a range, days that are fully met with nothing pending are left out.",
    }


def _item_brief(i):
    out = {
        "unit": i.get("unit_name"),
        "shift": i.get("shift_label"),
        "status": i.get("status"),
        "required_staff": i.get("required"),
        "assigned_staff": i.get("assigned"),
    }
    if i.get("required_hours") is not None:
        out["required_hours"] = i.get("required_hours")
        out["hours_scheduled"] = i.get("hours_scheduled")
    if i.get("required_rn") is not None:
        out["required_rn"] = i.get("required_rn")
        out["rn_scheduled"] = i.get("rn_scheduled")
    if i.get("reasons"):
        out["reasons"] = i["reasons"]
    if i.get("critical"):
        out["critical_staff"] = i["critical"]
    if i.get("callouts_open"):
        out["open_call_outs"] = i["callouts_open"]
    if i.get("note"):
        out["note"] = i["note"]
    return out


@tool(
    "get_staff_shifts",
    "The schedule (shifts) of ONE staff member over a date range, including any approved time off or "
    "call-out that takes them off a shift. Give the staff member's name (or id from search_roster).",
    {
        "staff_name": {"type": "string", "description": "Full or partial name, e.g. 'Maria Santos'."},
        "staff_id": {"type": "integer", "description": "Roster id, if known from search_roster."},
        "start": _START,
        "end": _END,
    },
)
def get_staff_shifts(user, args, org_id):
    start, end = _range(args, default_days=6)
    staff, problem = _resolve_staff(user, args, org_id)
    if problem:
        return problem
    shifts = _as_list(
        _call(
            StaffShiftViewSet.as_view({"get": "list"}),
            user,
            {"staff": staff["id"], "start": start.isoformat(), "end": end.isoformat()},
            org_id,
        )
    )
    requests = _time_off_for(user, org_id, start, end, staff_id=staff["id"])
    rows = []
    for s in sorted(shifts, key=lambda s: (s.get("date") or "", s.get("start_time") or "")):
        row = _shift_row(s, include_staff=False)
        reason = _out_reason(s, requests)
        if reason:
            row["out"] = reason
        rows.append(row)
    result = {
        "staff": staff.get("full_name"),
        "profession": staff.get("profession"),
        "range": _span(start, end),
        "count": len(rows),
        "shifts": rows[:MAX_ROWS],
    }
    pending = [
        {"type": r.get("kind_display"), "from": r.get("start_date"), "to": r.get("end_date")}
        for r in requests
        if r.get("status") == "pending"
    ]
    if pending:
        result["pending_time_off_requests"] = pending
    return result


@tool(
    "get_who_is_working",
    "Who is scheduled to work on a given date, grouped by shift, optionally limited to one shift type or "
    "unit. People on approved time off or a call-out are listed separately as not working.",
    {"date": _DATE, "shift_type": _SHIFT, "unit_id": _UNIT},
)
def get_who_is_working(user, args, org_id):
    day = _parse_date(args.get("date"), "date") or timezone.localdate()
    shift_type = (args.get("shift_type") or "").strip().lower() or None
    if shift_type and shift_type not in SHIFT_CODES:
        raise ToolError(f"shift_type must be one of: {', '.join(SHIFT_CODES)}.")
    shifts = _as_list(
        _call(
            StaffShiftViewSet.as_view({"get": "list"}),
            user,
            {"start": day.isoformat(), "end": day.isoformat(), "unit": args.get("unit_id")},
            org_id,
        )
    )
    if shift_type:
        shifts = [s for s in shifts if s.get("shift_type") == shift_type]
    requests = _time_off_for(user, org_id, day, day)
    groups, out = {}, []
    for s in sorted(shifts, key=lambda s: (s.get("start_time") or "", s.get("staff_name") or "")):
        row = _shift_row(s)
        reason = _out_reason(s, requests)
        if reason:
            row["why_not_working"] = reason
            out.append(row)
        else:
            groups.setdefault(s.get("shift_type_display") or s.get("shift_type"), []).append(row)
    return {
        "date": day.isoformat(),
        "weekday": _weekday(day.isoformat()),
        "total_working": sum(len(v) for v in groups.values()),
        "working_by_shift": {k: {"count": len(v), "staff": v[:MAX_ROWS]} for k, v in groups.items()},
        "scheduled_but_not_working": out[:MAX_ROWS],
    }


@tool(
    "search_roster",
    "Find staff on the roster by name or profession and get their contact details (phone, email) and role. "
    "Use for 'what is Maria's phone number' or 'list our CNAs'.",
    {
        "query": {"type": "string", "description": "Part of a name or profession. Leave empty to list everyone."},
        "include_inactive": {"type": "boolean", "description": "Also include inactive staff. Default false."},
    },
)
def search_roster(user, args, org_id):
    roster = _roster(user, org_id)
    if not args.get("include_inactive"):
        roster = [s for s in roster if s.get("is_active")]
    query = (args.get("query") or "").strip()
    matches = _match(roster, query) if query else roster
    return {
        "count": len(matches),
        "staff": [_staff_brief(s) for s in matches[:25]],
        "truncated": len(matches) > 25,
    }


@tool(
    "get_pending_time_off",
    "Time-off requests waiting for a decision and open same-day call-outs that still need cover, with the "
    "shifts affected. Each has a request_id (needed by find_cover_candidates). Use for 'any call-outs I need to cover?'.",
    {
        "kind": {
            "type": "string",
            "enum": ["off_request", "emergency"],
            "description": "off_request = planned time off, emergency = same-day call-out. Omit for both.",
        }
    },
)
def get_pending_time_off(user, args, org_id):
    kind = (args.get("kind") or "").strip() or None
    if kind and kind not in ("off_request", "emergency"):
        raise ToolError("kind must be off_request or emergency.")
    data = _call(TimeOffListCreateView.as_view(), user, {"status": "pending,open", "kind": kind}, org_id)
    rows = _as_list(data)
    out = []
    for r in rows[:MAX_ROWS]:
        item = {
            "request_id": r.get("id"),
            "staff": r.get("staff_name"),
            "role": r.get("nursing_role"),
            "type": r.get("kind_display"),
            "status": r.get("status_display"),
            "from": r.get("start_date"),
            "to": r.get("end_date"),
            "submitted": (r.get("created_at") or "")[:10],
        }
        if r.get("affected_shifts"):
            item["shifts_affected"] = [
                {"date": s.get("date"), "shift": s.get("shift_type_display"), "unit": s.get("unit_name")}
                for s in r["affected_shifts"]
            ]
        out.append(item)
    return {
        "open_call_outs": data.get("open_emergencies", 0) if isinstance(data, dict) else 0,
        "pending_requests": data.get("pending_requests", 0) if isinstance(data, dict) else 0,
        "requests": out,
        "truncated": len(rows) > MAX_ROWS,
    }


@tool(
    "find_cover_candidates",
    "Who could cover a call-out or time-off request: active staff not already working or off on the affected "
    "dates, best match first, with phone numbers. Needs the request_id from get_pending_time_off. Administrators only.",
    {"request_id": {"type": "integer", "description": "The request_id from get_pending_time_off."}},
    required=["request_id"],
    admin_only=True,
)
def find_cover_candidates(user, args, org_id):
    try:
        request_id = int(args.get("request_id"))
    except (TypeError, ValueError):
        raise ToolError("I need the request_id. Look up pending call-outs first.")
    data = _call(TimeOffCoverCandidatesView.as_view(), user, {}, org_id, pk=request_id)
    req = data.get("request", {})
    return {
        "request": {
            "request_id": req.get("id"),
            "staff": req.get("staff_name"),
            "role": req.get("nursing_role"),
            "type": req.get("kind_display"),
            "status": req.get("status_display"),
            "from": req.get("start_date"),
            "to": req.get("end_date"),
            "shifts_affected": [
                {"date": s.get("date"), "shift": s.get("shift_type_display"), "unit": s.get("unit_name")}
                for s in req.get("affected_shifts", [])
            ],
        },
        "candidates": [
            {
                "name": c.get("name"),
                "profession": c.get("profession"),
                "nursing_role": c.get("nursing_role"),
                "phone": c.get("phone_number"),
                "email": c.get("email"),
                "hours_scheduled_that_week": c.get("week_hours"),
            }
            for c in data.get("candidates", [])[:10]
        ],
    }


@tool(
    "get_unscheduled_staff",
    "Active staff who have no shifts at all in a date range ('who isn't scheduled next week?'). "
    "Defaults to the current week (Monday to Sunday).",
    {"start": _START, "end": _END},
)
def get_unscheduled_staff(user, args, org_id):
    start, end = _week_range(args)
    data = _call(
        UnscheduledStaffReportView.as_view(), user, {"start": start.isoformat(), "end": end.isoformat()}, org_id
    )
    rows = _as_list(data)
    return {
        "range": _span(start, end),
        "count": data.get("count", len(rows)) if isinstance(data, dict) else len(rows),
        "staff": [
            {
                "name": s.get("full_name"),
                "profession": s.get("profession"),
                "nursing_role": s.get("nursing_role_display"),
            }
            for s in rows[:MAX_ROWS]
        ],
        "truncated": len(rows) > MAX_ROWS,
    }


@tool(
    "get_labor_hours",
    "Scheduled hours worked by each staff member over a date range, with totals. Optionally limited to one shift "
    "type ('total hours for night shift this week') or a profession. Defaults to the current week.",
    {
        "start": _START,
        "end": _END,
        "shift_type": _SHIFT,
        "profession": {"type": "string", "description": "Optional profession filter, e.g. 'CNA'."},
    },
)
def get_labor_hours(user, args, org_id):
    start, end = _week_range(args)
    shift_type = (args.get("shift_type") or "").strip().lower() or None
    if shift_type and shift_type not in SHIFT_CODES:
        raise ToolError(f"shift_type must be one of: {', '.join(SHIFT_CODES)}.")
    profession = _norm(args.get("profession"))
    params = {"start": start.isoformat(), "end": end.isoformat()}

    if shift_type:
        # The report has no shift filter, so total the scheduled shifts directly.
        shifts = _as_list(_call(StaffShiftViewSet.as_view({"get": "list"}), user, params, org_id))
        totals = {}
        for s in shifts:
            if s.get("shift_type") != shift_type:
                continue
            if profession and profession not in _norm(s.get("profession")):
                continue
            h = _hours(s)
            if h is None:
                continue
            row = totals.setdefault(
                s["staff"],
                {"name": s.get("staff_name"), "profession": s.get("profession"), "shifts": 0, "hours": 0.0},
            )
            row["shifts"] += 1
            row["hours"] += h
        rows = sorted(totals.values(), key=lambda r: r["hours"], reverse=True)
        basis = f"{shift_type} shifts only, from scheduled shifts that have start and end times"
    else:
        data = _call(LaborHoursReportView.as_view(), user, params, org_id)
        rows = [
            {
                "name": r.get("full_name"),
                "profession": r.get("profession"),
                "shifts": r.get("shift_count"),
                "hours": r.get("total_hours"),
            }
            for r in _as_list(data)
            if not profession or profession in _norm(r.get("profession"))
        ]
        basis = "all scheduled shifts that have start and end times"

    for r in rows:
        r["hours"] = round(r["hours"], 2)
    return {
        "range": _span(start, end),
        "basis": basis,
        "total_hours": round(sum(r["hours"] for r in rows), 2),
        "staff_count": len(rows),
        "shift_count": sum(r["shifts"] for r in rows),
        "top_by_hours": rows[:15],
    }


@tool(
    "get_coverage_compliance",
    "The Coverage Compliance report: every shift in the range that was understaffed or at risk against the "
    "organization's staffing standard, plus counts. Use for 'which days are not met this month'. Max 62 days.",
    {"start": _START, "end": _END},
)
def get_coverage_compliance(user, args, org_id):
    start, end = _range(args, default_days=6)
    data = _call(
        CoverageComplianceReportView.as_view(), user, {"start": start.isoformat(), "end": end.isoformat()}, org_id
    )
    flagged = [r for r in _as_list(data) if r.get("status") in ("Understaffed", "At risk")]
    return {
        "range": _span(start, end),
        "understaffed": data.get("understaffed_count"),
        "at_risk": data.get("at_risk_count"),
        "shifts_checked": data.get("checked_count"),
        "warnings": (data.get("warnings") or [])[:5],
        "problem_shifts": [
            {
                "date": r.get("date"),
                "weekday": _weekday(r.get("date")),
                "unit": r.get("unit_name"),
                "shift": r.get("shift_type_display"),
                "status": r.get("status"),
                "required_staff": r.get("required"),
                "assigned_staff": r.get("assigned"),
                "required_rn": r.get("required_rn"),
                "rn_scheduled": r.get("rn_scheduled"),
                "shortfalls": r.get("shortfalls") or [],
            }
            for r in flagged[:MAX_ROWS]
        ],
        "truncated": len(flagged) > MAX_ROWS,
    }


# ==========================================================================
# STAFF TOOLS  (role 'staff' with a linked roster entry) - OWN DATA ONLY
# ==========================================================================
@tool(
    "get_my_shifts",
    "The signed-in staff member's OWN upcoming shifts for a date or range ('what is my schedule next week'). "
    "This is the only schedule a staff member may see through the assistant.",
    {"start": _START, "end": _END},
    modes=(MODE_STAFF,),
)
def get_my_shifts(user, args, org_id):
    start, end = _range(args, default_days=6, max_days=62)
    shifts = _as_list(
        _call(MyShiftsView.as_view(), user, {"start": start.isoformat(), "end": end.isoformat()}, org_id)
    )
    rows = [
        _shift_row(s, include_staff=False)
        for s in sorted(shifts, key=lambda s: (s.get("date") or "", s.get("start_time") or ""))
    ]
    return {"range": _span(start, end), "count": len(rows), "shifts": rows[:MAX_ROWS]}


@tool(
    "get_my_coverage",
    "Whether the units and shifts the signed-in staff member is scheduled on are adequately staffed (met, at "
    "risk, not met) for a date or range ('what is my coverage today / next week'). Reports status and head-counts "
    "only, never other people's names.",
    {"start": _START, "end": _END},
    modes=(MODE_STAFF,),
)
def get_my_coverage(user, args, org_id):
    start, end = _range(args, default_days=0, max_days=31)
    mine = _as_list(
        _call(MyShiftsView.as_view(), user, {"start": start.isoformat(), "end": end.isoformat()}, org_id)
    )
    if not mine:
        return {"range": _span(start, end), "shifts": [], "message": "You have no scheduled shifts in that range."}
    data = _call(
        CoverageStatusView.as_view(), user, {"start": start.isoformat(), "end": end.isoformat()}, org_id
    )
    days = data.get("days", {})
    out = []
    for s in sorted(mine, key=lambda s: (s.get("date") or "", s.get("start_time") or "")):
        items = [
            i
            for i in days.get(s.get("date"), {}).get("items", [])
            if i.get("shift_type") == s.get("shift_type") and i.get("unit_id") in (None, s.get("unit"))
        ]
        row = _shift_row(s, include_staff=False)
        if items:
            worst = min(items, key=lambda i: _STATUS_RANK.get(i.get("status"), 9))
            row["coverage"] = worst.get("status")
            row["required_staff"] = worst.get("required")
            row["assigned_staff"] = worst.get("assigned")
        else:
            row["coverage"] = "no staffing requirement is set for this shift"
        out.append(row)
    return {"range": _span(start, end), "shifts": out[:MAX_ROWS]}


@tool(
    "get_my_time_off",
    "The signed-in staff member's OWN time-off requests and call-outs with their status (pending, approved, denied, "
    "cancelled, open, resolved) and any note from the manager. Use for 'did my request get approved?'.",
    {},
    modes=(MODE_STAFF,),
)
def get_my_time_off(user, args, org_id):
    rows = _as_list(_call(MyTimeOffView.as_view(), user, {}, org_id))
    rows.sort(key=lambda r: r.get("start_date") or "", reverse=True)
    return {
        "count": len(rows),
        "requests": [
            {
                "type": r.get("kind_display"),
                "status": r.get("status_display"),
                "from": r.get("start_date"),
                "to": r.get("end_date"),
                "decided_on": (r.get("decided_at") or "")[:10] or None,
                "manager_note": r.get("admin_note") or None,
            }
            for r in rows[:15]
        ],
    }
