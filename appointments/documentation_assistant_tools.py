"""
Tools for the in-app Documentation assistant (see appointments/documentation_assistant.py).

READ-ONLY. There is no tool that creates, edits, signs or deletes anything.

HOW PERMISSIONS WORK
--------------------
The assistant never uses a service account and never queries a chart on its own authority. Every tool runs the
EXISTING views (patient list, clinical summary, notes, orders, labs, appointments, problem list) AS THE SIGNED-IN
USER, so the app's own role, rights and organization scoping apply exactly as on the app's own screens:

  * viewsets (notes, orders, labs, appointments): the view's own permission classes are run, and its own
    get_queryset() supplies the rows, which this module then filters further and trims;
  * other views (patient list, clinical summary, problem list): called through DRF's request factory with
    force_authenticate, as the Scheduler assistant does.

On top of that:
  * A patient must belong to the user's OWN organization (a system admin's assistant stays in their own clinic).
  * Tools only return what a chart review needs. Phone numbers, addresses, emails, insurance and the SSN digits
    never reach the model.
  * Every chart read is written to DocumentationAssistantAccess (user, patient id, tool), kept apart from the
    chat log and not purged with it.

THREADING: tools run one after another in the request's own thread, which is also what keeps the tenant-scoped
default managers (Model.objects) filtered to the user's organization for the whole request.
"""

import datetime
import json
import logging
import threading
from types import SimpleNamespace

from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import APIException
from rest_framework.test import APIRequestFactory, force_authenticate

from users.rights import user_has_right

logger = logging.getLogger(__name__)

# Roles that may open a patient's chart (same as the Clinical Summary screen).
ROLES = ("admin", "system_admin", "doctor", "nurse")

MAX_RESULT_CHARS = 16000   # what one tool result may weigh before we ask for a narrower question
MAX_ROWS = 25              # rows of any list handed to the model
MAX_DAYS = 3650            # longest look-back for a search
NOTE_WINDOW = 400          # how many of the newest notes a text search reads
NOTE_TEXT_CHARS = 6000     # how much of one note is handed over
LAB_ITEM_CAP = 60          # result lines per lab answer

_factory = APIRequestFactory()
_ctx = threading.local()


class ToolError(Exception):
    """A problem the model can read and explain to the user (never a stack trace)."""


# --------------------------------------------------------------------------
# Who may use the assistant, and which tools they get
# --------------------------------------------------------------------------
def can_use(user):
    return (
        bool(getattr(user, "is_authenticated", False))
        and getattr(user, "role", None) in ROLES
        and getattr(user, "organization_id", None) is not None
    )


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
    _ctx.patients = set()
    try:
        result = TOOLS[name]["fn"](user, args)
        if len(json.dumps(result, default=str)) > MAX_RESULT_CHARS:
            raise ToolError("That is too much data to read at once. Ask for one patient, a shorter date range or a narrower search.")
        _record_access(user, name, _ctx.patients)
        return result, False
    except ToolError as e:
        return {"error": str(e)}, True
    except Exception:  # noqa: BLE001 - the model gets a safe message, the log gets the trace
        logger.exception("documentation assistant tool %s failed", name)
        return {"error": "Something went wrong looking that up."}, True
    finally:
        _ctx.patients = set()


def _touch(patient_id):
    """Note that this tool call read data about this patient (written to the access trail on success)."""
    try:
        _ctx.patients.add(int(patient_id))
    except (AttributeError, TypeError, ValueError):
        pass


def _record_access(user, tool_name, patient_ids):
    if not patient_ids:
        return
    from .models import DocumentationAssistantAccess as Access

    try:
        Access.objects.bulk_create(
            [
                Access(organization_id=getattr(user, "organization_id", None), user=user, patient_id=pid, tool=tool_name)
                for pid in sorted(patient_ids)
            ]
        )
    except Exception:  # noqa: BLE001 - the trail is best-effort here; the loud failure is in the log
        logger.exception("could not write documentation assistant access trail")


# --------------------------------------------------------------------------
# Calling the existing views as the user
# --------------------------------------------------------------------------
def _params(params):
    return {k: v for k, v in (params or {}).items() if v not in (None, "")}


def _call(view, user, params=None, **kwargs):
    """Run an existing GET view as `user` and return its data (raises ToolError on refusal)."""
    request = _factory.get("/api/", _params(params))
    force_authenticate(request, user=user)
    response = view(request, **kwargs)
    code = response.status_code
    if code >= 400:
        if code in (401, 403):
            raise ToolError("You don't have access to that information.")
        if code == 404:
            raise ToolError("That wasn't found.")
        raise ToolError(f"The request could not be completed ({code}).")
    return getattr(response, "data", None)


def _scoped_qs(viewset_class, user, params=None):
    """
    The queryset an existing ViewSet would list for this user, after running that ViewSet's own authentication
    and permission checks. Lets us add our own filters (text, date window) without re-implementing its scoping.
    """
    request = _factory.get("/api/", _params(params))
    force_authenticate(request, user=user)
    view = viewset_class()
    view.action = "list"
    view.action_map = {"get": "list"}  # what ViewSet.as_view({"get": "list"}) would have set
    view.args = ()
    view.kwargs = {}
    view.format_kwarg = None
    drf_request = view.initialize_request(request)
    view.request = drf_request
    try:
        view.initial(drf_request)
    except APIException:
        raise ToolError("You don't have access to that information.")
    return view.get_queryset()


def _as_list(data):
    if isinstance(data, dict):
        return list(data.get("results") or [])
    return list(data or [])


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------
def _name(u):
    if u is None:
        return ""
    full = f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
    return full or getattr(u, "username", "") or ""


def _person(u):
    """'Last, First' for a patient/user object."""
    if u is None:
        return ""
    last, first = getattr(u, "last_name", ""), getattr(u, "first_name", "")
    return f"{last}, {first}".strip(", ") or getattr(u, "username", "")


def _when(value):
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, datetime.datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.strftime("%Y-%m-%d %H:%M")
    return value.isoformat()


def _int(raw, default, low, high, label="That"):
    try:
        n = int(raw) if raw not in (None, "") else default
    except (TypeError, ValueError):
        raise ToolError(f"{label} must be a number.")
    return max(low, min(n, high))


def _limit(args, default=10):
    return _int(args.get("limit"), default, 1, MAX_ROWS, "limit")


def _since(args):
    """A datetime `days_back` days ago, or None when no window was asked for."""
    if args.get("days_back") in (None, ""):
        return None
    days = _int(args.get("days_back"), 0, 0, MAX_DAYS, "days_back")
    return timezone.now() - datetime.timedelta(days=days)


def _clip(text, n):
    text = " ".join(str(text or "").split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _patient(user, patient_id):
    """The patient (a user row) if this user may open their chart; also noted in the access trail."""
    try:
        pid = int(patient_id)
    except (TypeError, ValueError):
        raise ToolError("patient_id must be a number from search_patients.")
    from .patient_header import _patient_for

    patient, error = _patient_for(SimpleNamespace(user=user), pid)
    if error is not None or patient is None or patient.organization_id != user.organization_id:
        raise ToolError("That patient wasn't found.")
    _touch(patient.pk)
    return patient


def open_chart(user, patient_id):
    """For the endpoint: (id, name, mrn) of the chart the user has open, or None. Does not touch the access trail."""
    try:
        pid = int(patient_id)
    except (TypeError, ValueError):
        return None
    from .patient_header import _patient_for

    if not can_use(user):
        return None
    patient, error = _patient_for(SimpleNamespace(user=user), pid)
    if error is not None or patient is None or patient.organization_id != user.organization_id:
        return None
    profile = getattr(patient, "patient_profile", None)
    return {"id": patient.pk, "name": _person(patient), "mrn": getattr(profile, "mrn", "") or ""}


_DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y")


def _as_date(text):
    text = str(text or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


# --------------------------------------------------------------------------
# Finding a patient
# --------------------------------------------------------------------------
@tool(
    "search_patients",
    "Find patients the signed-in user can see, by name (first, last or both), MRN, or date of birth "
    "(YYYY-MM-DD or MM/DD/YYYY). Returns patient_id (needed by every other tool), name, MRN, date of birth, "
    "sex and provider. If more than one patient matches, ask the user which one they mean.",
    {
        "query": {"type": "string", "description": "Name, MRN (like MRN-000123) or date of birth."},
        "care_setting": {
            "type": "string",
            "enum": ["ambulatory", "emergency", "acute"],
            "description": "Only patients whose current visit is in this care setting.",
        },
        "limit": {"type": "integer", "description": f"How many to return (default 10, at most {MAX_ROWS})."},
    },
    required=["query"],
)
def search_patients(user, args):
    from users.views import get_patients

    query = str(args.get("query") or "").strip()
    if len(query) < 2:
        raise ToolError("Give at least two characters to search for.")
    dob = _as_date(query)
    tokens = [t for t in query.replace(",", " ").split() if t]
    params = {"page_size": 100}
    if dob:
        params["dob"] = dob.isoformat()
    else:
        params["search"] = max(tokens, key=len)
    if args.get("care_setting") in ("ambulatory", "emergency", "acute"):
        params["care_setting"] = args["care_setting"]
    rows = _as_list(_call(get_patients, user, params))
    rows = [r for r in rows if r.get("organization") == user.organization_id]
    if not dob and len(tokens) > 1:
        # the patient list matches ONE text; narrow to rows containing every word typed
        def haystack(r):
            return f"{r.get('first_name', '')} {r.get('last_name', '')} {r.get('mrn', '')} {r.get('provider_name', '')}".lower()

        rows = [r for r in rows if all(t.lower() in haystack(r) for t in tokens)]
    limit = _limit(args)
    out = []
    for r in rows[:limit]:
        _touch(r.get("user_id"))
        out.append(
            {
                "patient_id": r.get("user_id"),
                "name": f"{r.get('last_name', '')}, {r.get('first_name', '')}".strip(", "),
                "mrn": r.get("mrn") or "",
                "date_of_birth": r.get("date_of_birth") or "",
                "sex": r.get("legal_sex") or "",
                "provider": r.get("provider_name") or "",
            }
        )
    result = {"total_matches": len(rows), "patients": out}
    if len(rows) > limit:
        result["note"] = f"Showing the first {limit} of {len(rows)}. Add a first name, last name or date of birth to narrow it."
    if len(rows) >= 100:
        result["note"] = "More than 100 patients matched; ask for a fuller name, MRN or date of birth."
    return result


# --------------------------------------------------------------------------
# The whole chart at a glance
# --------------------------------------------------------------------------
def _trim_rows(rows, n, keep):
    return [{k: r.get(k) for k in keep if r.get(k) not in (None, "")} for r in (rows or [])[:n] if isinstance(r, dict)]


@tool(
    "get_patient_overview",
    "A patient's chart at a glance: identity (name, MRN, age, sex, location, attending, care setting), allergies, "
    "open problems, medications, recent results, latest vitals, open orders, pending nurse tasks, last notes, open "
    "referrals and upcoming appointments. Start here for any question about 'this patient'.",
    {"patient_id": {"type": "integer", "description": "From search_patients."}},
    required=["patient_id"],
)
def get_patient_overview(user, args):
    from .clinical_summary import ClinicalSummaryView

    patient = _patient(user, args.get("patient_id"))
    data = _call(ClinicalSummaryView.as_view(), user, {"patient": patient.pk}) or {}

    def section(key):
        value = data.get(key)
        if isinstance(value, dict) and "error" in value and len(value) == 1:
            return {"unavailable": "This section could not be loaded."}
        return value

    out = {}
    header = section("header") or {}
    if "unavailable" in header:
        out["patient"] = header
    else:
        allergies = (header.get("allergies") or {})
        out["patient"] = {
            "patient_id": patient.pk,
            **{k: header.get(k) for k in ("name", "mrn", "age", "sex", "location", "attending", "care_setting") if header.get(k)},
            "allergies": allergies.get("text") or "",
            "allergy_list": _trim_rows(allergies.get("items"), 15, ("substance", "reaction", "severity")),
        }
    problems = section("problems") or {}
    if "unavailable" in problems:
        out["problems"] = problems
    else:
        out["problems"] = {
            "open": _trim_rows(problems.get("items"), 15, ("description", "code", "status", "onset_date")),
            "resolved_count": problems.get("resolved_count"),
            "history_text": _clip(problems.get("history_text"), 300),
        }
    meds = section("medications") or {}
    if "unavailable" in meds:
        out["medications"] = meds
    else:
        out["medications"] = {
            "home": _trim_rows(meds.get("home"), 12, ("drug_name", "strength", "sig")),
            "home_count": meds.get("home_count"),
            "active_prescriptions": _trim_rows(meds.get("prescriptions"), 8, ("drug_name", "strength", "sig", "status")),
            "needs_reconciliation": meds.get("needs_reconciliation"),
        }
    results = section("results") or {}
    if results.get("hidden"):
        out["results"] = {"hidden": "This account cannot view lab results."}
    elif "unavailable" in results:
        out["results"] = results
    else:
        out["results"] = {
            "recent": _trim_rows(results.get("recent"), 6, ("id", "title", "status", "review_status", "at", "abnormal", "critical")),
            "unreviewed": results.get("unreviewed"),
        }
    vitals = section("vitals") or {}
    out["latest_vitals"] = vitals.get("latest") if "unavailable" not in vitals else vitals
    orders = section("orders")
    if orders:
        out["open_orders"] = (
            orders
            if "unavailable" in orders
            else {
                "count": orders.get("count"),
                "awaiting_cosign": orders.get("awaiting_cosign"),
                "items": _trim_rows(orders.get("items"), 6, ("id", "name", "category", "status_label", "priority", "at")),
            }
        )
    tasks = section("tasks")
    if tasks:
        out["nurse_tasks"] = (
            tasks
            if "unavailable" in tasks
            else {"pending": tasks.get("count"), "overdue": tasks.get("overdue")}
        )
    nr = section("notes_referrals") or {}
    if "unavailable" in nr:
        out["notes_and_referrals"] = nr
    else:
        out["notes_and_referrals"] = {
            "latest_notes": _trim_rows(nr.get("notes"), 3, ("id", "type", "documentation_type", "status", "author", "at")),
            "open_referrals": _trim_rows(nr.get("referrals"), 5, ("specialty", "destination", "status_label", "urgency")),
        }
    upcoming = section("upcoming") or {}
    out["upcoming_appointments"] = (
        upcoming if "unavailable" in upcoming else _trim_rows(upcoming.get("items"), 3, ("title", "at", "status", "provider"))
    )
    return out


# --------------------------------------------------------------------------
# Clinical notes
# --------------------------------------------------------------------------
def _note_text(note):
    """All the searchable text of a note: SOAP columns plus the template-driven answers."""
    parts = [note.subjective, note.objective, note.assessment, note.plan]
    data = note.structured_data if isinstance(note.structured_data, dict) else {}
    for value in data.values():
        parts.append(_flat(value))
    return "\n".join(p for p in parts if p)


def _flat(value):
    if value in (None, ""):
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(x for x in (_flat(v) for v in value) if x)
    if isinstance(value, dict):
        return "; ".join(f"{k}: {_flat(v)}" for k, v in value.items() if _flat(v))
    return str(value)


def _snippet(text, needle, width=160):
    text = " ".join(text.split())
    if not needle:
        return _clip(text, width)
    i = text.lower().find(needle.lower())
    if i < 0:
        return _clip(text, width)
    start = max(0, i - width // 3)
    piece = text[start : start + width]
    return ("…" if start else "") + piece + ("…" if start + width < len(text) else "")


def _note_label(note):
    return note.get_note_type_display() if hasattr(note, "get_note_type_display") else note.note_type


@tool(
    "search_notes",
    "Search clinical notes (nursing and doctor assessments, progress notes, admission notes and other documentation "
    "types). Give patient_id for one patient's notes (query optional), or only a query to search across the "
    "clinic's most recent notes. Returns note ids, author, date, status (draft or signed) and a snippet. Use "
    "read_note for the full text.",
    {
        "query": {"type": "string", "description": "Words to look for in the note text, e.g. 'chest pain'."},
        "patient_id": {"type": "integer", "description": "Limit to one patient (from search_patients)."},
        "status": {"type": "string", "enum": ["draft", "signed"], "description": "Only drafts or only signed notes."},
        "days_back": {"type": "integer", "description": "Only notes written in the last N days."},
        "limit": {"type": "integer", "description": f"How many to return (default 10, at most {MAX_ROWS})."},
    },
    right="clinical_notes.view_author",
)
def search_notes(user, args):
    from .views import ClinicalNoteViewSet

    query = str(args.get("query") or "").strip()
    params = {}
    if args.get("patient_id") not in (None, ""):
        params["patient"] = _patient(user, args.get("patient_id")).pk
    elif len(query) < 2:
        raise ToolError("Give a patient_id, or at least two characters to search for.")
    qs = _scoped_qs(ClinicalNoteViewSet, user, params).filter(organization_id=user.organization_id)
    if args.get("status") in ("draft", "signed"):
        qs = qs.filter(status=args["status"])
    since = _since(args)
    if since:
        qs = qs.filter(created_at__gte=since)
    notes = list(qs.order_by("-created_at")[:NOTE_WINDOW])
    hits = []
    for n in notes:
        text = _note_text(n)
        if query and query.lower() not in (text + " " + (n.documentation_type or "")).lower():
            continue
        hits.append((n, text))
    limit = _limit(args)
    out = []
    for n, text in hits[:limit]:
        _touch(n.patient_id)
        out.append(
            {
                "note_id": n.pk,
                "patient_id": n.patient_id,
                "patient": _person(n.patient),
                "type": _note_label(n),
                "documentation_type": n.documentation_type or "",
                "status": n.status,
                "author": _name(n.author),
                "date": _when(n.signed_at or n.created_at),
                "amends_note_id": n.amends_id,
                "snippet": _snippet(text, query),
            }
        )
    result = {"total_matches": len(hits), "notes": out}
    if len(notes) >= NOTE_WINDOW:
        result["note"] = f"Searched the {NOTE_WINDOW} newest notes in scope; older ones were not read. Narrow by patient or days_back."
    elif len(hits) > limit:
        result["note"] = f"Showing the first {limit} of {len(hits)}."
    return result


def _field_labels(snapshot):
    """key -> label, found anywhere inside a note template snapshot (best effort)."""
    labels = {}

    def walk(node):
        if isinstance(node, dict):
            key, label = node.get("key"), node.get("label")
            if isinstance(key, str) and isinstance(label, str):
                labels.setdefault(key, label)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(snapshot)
    return labels


@tool(
    "read_note",
    "The full text of one clinical note, with its author, dates, signed/draft status and any addenda. Use the "
    "note_id from search_notes.",
    {"note_id": {"type": "integer", "description": "From search_notes."}},
    required=["note_id"],
    right="clinical_notes.view_author",
)
def read_note(user, args):
    from .models import ClinicalNote
    from .views import ClinicalNoteViewSet

    try:
        note_id = int(args.get("note_id"))
    except (TypeError, ValueError):
        raise ToolError("note_id must be a number from search_notes.")
    qs = _scoped_qs(ClinicalNoteViewSet, user, {}).filter(organization_id=user.organization_id)
    note = qs.filter(pk=note_id).first()
    if note is None:
        raise ToolError("That note wasn't found.")
    _touch(note.patient_id)
    sections = []
    for label, value in (("Subjective", note.subjective), ("Objective", note.objective), ("Assessment", note.assessment), ("Plan", note.plan)):
        if value and value.strip():
            sections.append({"section": label, "text": value.strip()})
    data = note.structured_data if isinstance(note.structured_data, dict) else {}
    labels = _field_labels(note.template_snapshot)
    for key, value in data.items():
        text = _flat(value)
        if text:
            sections.append({"section": labels.get(key, key.replace("_", " ").capitalize()), "text": text})
    used, trimmed = 0, False
    for s in sections:
        room = NOTE_TEXT_CHARS - used
        if room <= 0:
            s["text"], trimmed = "(not shown: the note is long)", True
            continue
        if len(s["text"]) > room:
            s["text"], trimmed = s["text"][: room - 1] + "…", True
        used += len(s["text"])
    addenda = [
        {"note_id": a.pk, "status": a.status, "author": _name(a.author), "date": _when(a.signed_at or a.created_at)}
        for a in ClinicalNote.objects.filter(amends_id=note.pk, organization_id=user.organization_id).select_related("author")[:10]
    ]
    return {
        "note_id": note.pk,
        "patient_id": note.patient_id,
        "patient": _person(note.patient),
        "type": _note_label(note),
        "documentation_type": note.documentation_type or "",
        "status": note.status,
        "author": _name(note.author),
        "written": _when(note.created_at),
        "signed": _when(note.signed_at),
        "amends_note_id": note.amends_id,
        "addenda": addenda,
        "content": sections or [{"section": "(empty)", "text": "This note has no text yet."}],
        "truncated": trimmed,
    }


# --------------------------------------------------------------------------
# Orders
# --------------------------------------------------------------------------
@tool(
    "search_orders",
    "Orders (medications, labs, imaging, procedures, nursing and other orders) for one patient, or across the "
    "clinic when no patient is given. Filter by status, category or words in the order name or indication.",
    {
        "patient_id": {"type": "integer", "description": "Limit to one patient (from search_patients)."},
        "status": {
            "type": "string",
            "enum": ["draft", "pending_cosign", "active", "in_progress", "completed", "discontinued"],
        },
        "category": {"type": "string", "description": "Order category, e.g. lab, medication, imaging."},
        "query": {"type": "string", "description": "Words in the order name or indication."},
        "days_back": {"type": "integer", "description": "Only orders created in the last N days."},
        "limit": {"type": "integer", "description": f"How many to return (default 10, at most {MAX_ROWS})."},
    },
    right="orders.view",
)
def search_orders(user, args):
    from .models import Order
    from .views import OrderViewSet

    params = {}
    if args.get("patient_id") not in (None, ""):
        params["patient"] = _patient(user, args.get("patient_id")).pk
    if args.get("status") in dict(Order.STATUS_CHOICES):
        params["status"] = args["status"]
    if args.get("category"):
        params["category"] = str(args["category"])[:20]
    qs = _scoped_qs(OrderViewSet, user, params).filter(organization_id=user.organization_id)
    since = _since(args)
    if since:
        qs = qs.filter(created_at__gte=since)
    query = str(args.get("query") or "").strip()
    if query:
        from django.db.models import Q

        qs = qs.filter(Q(orderable_name__icontains=query) | Q(indication__icontains=query))
    total = qs.count()
    limit = _limit(args)
    labels = dict(Order.STATUS_CHOICES)
    out = []
    for o in qs.order_by("-created_at")[:limit]:
        _touch(o.patient_id)
        codes = [d.get("code") for d in (o.diagnosis_codes or []) if isinstance(d, dict) and d.get("code")]
        out.append(
            {
                "order_id": o.pk,
                "patient_id": o.patient_id,
                "patient": _person(o.patient),
                "name": o.orderable_name,
                "category": o.orderable_category,
                "status": labels.get(o.status, o.status),
                "priority": o.priority,
                "ordered_by": _name(o.ordering_provider),
                "date": _when(getattr(o, "signed_at", None) or o.created_at),
                "indication": _clip(o.indication, 140),
                "diagnosis_codes": codes[:5],
                "appointment_id": o.appointment_id,
            }
        )
    result = {"total_matches": total, "orders": out}
    if total > limit:
        result["note"] = f"Showing the newest {limit} of {total}."
    return result


# --------------------------------------------------------------------------
# Lab results
# --------------------------------------------------------------------------
@tool(
    "get_lab_results",
    "A patient's lab reports, newest first, with each result line (test, value, units, reference range, flag). "
    "Flags: L low, H high, LL critical low, HH critical high, A abnormal.",
    {
        "patient_id": {"type": "integer", "description": "From search_patients."},
        "abnormal_only": {"type": "boolean", "description": "Only the result lines that are flagged."},
        "days_back": {"type": "integer", "description": "Only reports from the last N days."},
        "limit": {"type": "integer", "description": "How many reports (default 5, at most 10)."},
    },
    required=["patient_id"],
    right="lab_results.view",
)
def get_lab_results(user, args):
    from .lab_views import LabReportViewSet

    patient = _patient(user, args.get("patient_id"))
    qs = _scoped_qs(LabReportViewSet, user, {"patient": patient.pk}).exclude(status="entered_in_error")
    since = _since(args)
    if since:
        from django.db.models import Q

        qs = qs.filter(Q(resulted_at__gte=since) | Q(resulted_at__isnull=True, collected_at__gte=since))
    limit = _int(args.get("limit"), 5, 1, 10, "limit")
    abnormal_only = args.get("abnormal_only") is True
    reports, lines = [], 0
    ordered = list(qs.order_by("-resulted_at", "-created_at")[:limit])
    for r in ordered:
        items = list(r.items.all())
        if abnormal_only:
            items = [i for i in items if i.abnormal_flag]
        shown = []
        for i in items:
            if lines >= LAB_ITEM_CAP:
                break
            lines += 1
            shown.append(
                {
                    k: v
                    for k, v in (
                        ("test", i.test_name),
                        ("value", i.value),
                        ("units", i.units),
                        ("reference", i.reference_range),
                        ("flag", i.abnormal_flag),
                        ("comment", _clip(i.comment, 120)),
                    )
                    if v
                }
            )
        reports.append(
            {
                "report_id": r.pk,
                "title": r.title,
                "status": r.status,
                "review": r.review_status,
                "collected": _when(r.collected_at),
                "resulted": _when(r.resulted_at),
                "lab": r.performing_lab or "",
                "results": shown,
                "results_not_shown": max(0, len(items) - len(shown)),
            }
        )
    result = {"patient_id": patient.pk, "reports": reports}
    if lines >= LAB_ITEM_CAP:
        result["note"] = "Result lines were capped; ask for a shorter range or abnormal_only."
    return result


# --------------------------------------------------------------------------
# Visits and appointments
# --------------------------------------------------------------------------
@tool(
    "get_visits",
    "A patient's visits: registrations/encounters (visit number, care setting, reason, diagnoses, attending, "
    "location, arrival and discharge) and their appointments (past and upcoming).",
    {
        "patient_id": {"type": "integer", "description": "From search_patients."},
        "limit": {"type": "integer", "description": f"How many of each (default 8, at most {MAX_ROWS})."},
    },
    required=["patient_id"],
)
def get_visits(user, args):
    from users.models import Registration

    from .views import AppointmentViewSet

    patient = _patient(user, args.get("patient_id"))
    limit = _limit(args, 8)
    care = dict(Registration.CARE_SETTING_CHOICES)
    visits = []
    regs = (
        Registration.objects.filter(patient__user=patient)
        .select_related("attending_provider")
        .order_by("-created_at", "-pk")[:limit]
    )
    for v in regs:
        visits.append(
            {
                "visit_number": v.visit_number or "",
                "care_setting": care.get(v.care_setting, v.care_setting),
                "admission_type": v.admission_type or "",
                "reason": _clip(v.reason_for_visit or v.presenting_problem, 160),
                "diagnoses": _clip(v.current_diagnoses, 160),
                "attending": _name(v.attending_provider),
                "location": (v.location_path() if hasattr(v, "location_path") else "") or v.assigned_location or "",
                "arrived": _when(v.arrival_time),
                "discharged": _when(v.discharge_datetime),
                "open": v.discharge_datetime is None,
                "appointment_id": v.appointment_id,
            }
        )
    appts = []
    try:
        qs = _scoped_qs(AppointmentViewSet, user, {"patient": patient.pk})
        for a in qs.filter(patient_id=patient.pk, organization_id=user.organization_id).select_related("provider").order_by("-appointment_datetime")[:limit]:
            state = "no-show" if getattr(a, "no_show", False) else "arrived" if getattr(a, "arrived", False) else a.status
            appts.append(
                {
                    "appointment_id": a.pk,
                    "when": _when(a.appointment_datetime),
                    "title": _clip(a.title, 60),
                    "provider": _name(a.provider),
                    "status": state,
                }
            )
    except ToolError:
        appts = []
    return {"patient_id": patient.pk, "visits": visits, "appointments": appts}


# --------------------------------------------------------------------------
# Problems, medications, vitals
# --------------------------------------------------------------------------
@tool(
    "get_problem_list",
    "A patient's problem list (diagnoses with ICD-10 codes, status, onset and resolution dates).",
    {
        "patient_id": {"type": "integer", "description": "From search_patients."},
        "show": {"type": "string", "enum": ["open", "resolved", "all"], "description": "Default open."},
    },
    required=["patient_id"],
)
def get_problem_list(user, args):
    from .clinical_summary import ProblemListView

    patient = _patient(user, args.get("patient_id"))
    show = args.get("show") if args.get("show") in ("open", "resolved", "all") else "open"
    data = _call(ProblemListView.as_view(), user, {"patient": patient.pk, "show": show}) or {}
    rows = data.get("results") or []
    return {
        "patient_id": patient.pk,
        "counts": data.get("counts"),
        "problems": [
            {k: p.get(k) for k in ("description", "code", "status", "onset_date", "resolved_date") if p.get(k)}
            | ({"note": _clip(p.get("note"), 160)} if p.get("note") else {})
            for p in rows[:MAX_ROWS]
            if isinstance(p, dict)
        ],
        **({"note": f"Showing the first {MAX_ROWS} of {len(rows)}."} if len(rows) > MAX_ROWS else {}),
    }


@tool(
    "get_medications",
    "A patient's home medications (what they take) and active prescriptions, with dose and directions. Use "
    "status 'stopped' for home medications that were stopped.",
    {
        "patient_id": {"type": "integer", "description": "From search_patients."},
        "status": {"type": "string", "enum": ["active", "stopped"], "description": "Home medication status. Default active."},
    },
    required=["patient_id"],
)
def get_medications(user, args):
    from . import home_meds
    from .models import HomeMedication, Prescription

    patient = _patient(user, args.get("patient_id"))
    status = args.get("status") if args.get("status") in ("active", "stopped") else "active"
    home = HomeMedication.objects.filter(patient=patient, organization_id=user.organization_id, status=status).order_by("drug_name", "pk")
    meds = [
        {
            "drug": m.drug_name,
            "strength": m.strength or "",
            "directions": home_meds.sig_of(m),
            "source": m.source or "",
            "last_taken": _when(m.last_taken),
        }
        for m in home[:30]
    ]
    rx = Prescription.objects.filter(patient=patient, organization_id=user.organization_id, status__in=["signed", "sent"]).order_by("-signed_at", "-pk")[:15]
    return {
        "patient_id": patient.pk,
        "home_medications": [{k: v for k, v in m.items() if v} for m in meds],
        "active_prescriptions": [
            {k: v for k, v in (("drug", p.drug_name), ("strength", p.strength), ("directions", p.sig), ("status", p.status), ("signed", _when(p.signed_at))) if v}
            for p in rx
        ],
    }


@tool(
    "get_vitals",
    "A patient's latest vital signs and recent readings (temperature, heart rate, respiratory rate, blood "
    "pressure, oxygen saturation, weight) from the flowsheets.",
    {"patient_id": {"type": "integer", "description": "From search_patients."}},
    required=["patient_id"],
    right="flowsheets.chart",
)
def get_vitals(user, args):
    from .clinical_summary import ClinicalSummaryView

    patient = _patient(user, args.get("patient_id"))
    data = _call(ClinicalSummaryView.as_view(), user, {"patient": patient.pk}) or {}
    vitals = data.get("vitals") or {}
    if isinstance(vitals, dict) and "error" in vitals and len(vitals) == 1:
        raise ToolError("Vital signs could not be loaded.")
    series = {k: (v or [])[-8:] for k, v in (vitals.get("series") or {}).items()}
    return {"patient_id": patient.pk, "latest": vitals.get("latest") or {}, "recent_readings": series}
