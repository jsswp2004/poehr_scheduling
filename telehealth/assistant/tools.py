"""What the assistant can do.

Read tools return de-identified visit facts (reference, time, state, minutes waiting).
There is no tool that changes anything. `propose_action` only builds a proposal the staff
member must confirm in the UI, which then calls the normal endpoints with their own login.
"""
from django.utils import timezone

from .. import billing, services
from ..models import TelehealthParticipant as P
from ..models import TelehealthSession as S
from .refs import todays_visits

KINDS = ("admit", "send_link", "end_visit", "set_location")

TOOL_SPECS = [
    {
        "name": "list_visits",
        "description": "List today's video visits you can see: reference, scheduled time, state and minutes waiting. No names.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_visit",
        "description": "Details for one visit by its reference (like v_1a2b3c4d).",
        "input_schema": {
            "type": "object",
            "properties": {"ref": {"type": "string"}},
            "required": ["ref"],
        },
    },
    {
        "name": "propose_action",
        "description": (
            "Prepare an action for the staff member to confirm. Nothing happens until they confirm it "
            "in the interface. admit: let a waiting patient in. send_link: send the join link. "
            "end_visit: end a visit. set_location: record where the patient is (home or other)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": list(KINDS)},
                "ref": {"type": "string"},
                "location": {"type": "string", "enum": list(billing.LOCATIONS)},
            },
            "required": ["kind", "ref"],
        },
    },
]


def _session(appointment):
    return S.objects.filter(appointment=appointment).prefetch_related("participants").first()


def _patient(session):
    return next((p for p in session.participants.all() if p.role == P.Role.PATIENT), None) if session else None


def visit_state(session) -> str:
    if session is None:
        return "not_started"
    if session.status == S.Status.ENDED:
        return "ended"
    patient = _patient(session)
    if patient is None or patient.arrived_at is None:
        return "link_not_opened"
    if patient.admitted_at is not None:
        return "in_visit"
    return "waiting_room" if patient.consent_at else "reading_notice"


def _clock(moment):
    return timezone.localtime(moment).strftime("%H:%M") if moment else None


def describe(ref, appointment, session=None):
    session = session if session is not None else _session(appointment)
    state = visit_state(session)
    info = {
        "ref": ref,
        "scheduled_time": _clock(services.appointment_summary(appointment)["scheduled_at"]),
        "state": state,
    }
    patient = _patient(session)
    if state in ("waiting_room", "reading_notice") and patient and patient.arrived_at:
        info["minutes_waiting"] = max(0, int((timezone.now() - patient.arrived_at).total_seconds() // 60))
    if state == "ended" and session.started_at:
        record = getattr(session, "visit_record", None)
        info["needs_patient_location"] = not (record and record.location_confirmed)
    return info


def list_visits(user, _args):
    return {"visits": [describe(ref, a) for ref, a in todays_visits(user).items()]}


def get_visit(user, args):
    appointment = todays_visits(user).get(args.get("ref"))
    if appointment is None:
        return {"error": "unknown reference"}
    return describe(args["ref"], appointment)


def propose_action(user, args):
    kind, ref = args.get("kind"), args.get("ref")
    appointment = todays_visits(user).get(ref)
    if kind not in KINDS or appointment is None:
        return {"ok": False, "reason": "unknown action or reference"}
    session = _session(appointment)
    state = visit_state(session)
    is_provider = services.appointment_provider_user_id(appointment) == user.pk
    can_conduct = is_provider and services.can_conduct_right(user)
    can_send = can_conduct or services.can_manage_right(user)

    def refuse(reason):
        return {"ok": False, "reason": reason}

    proposal = {"kind": kind, "ref": ref, "appointment_id": appointment.pk, "session_id": str(session.id) if session else None}
    if kind == "admit":
        if not can_conduct:
            return refuse("only the visit's provider can admit patients")
        if state != "waiting_room":
            return refuse(f"the patient isn't in the waiting room (state: {state})")
    elif kind == "send_link":
        if not can_send:
            return refuse("you don't have permission to send links")
        if state not in ("not_started", "link_not_opened"):
            return refuse(f"a link isn't needed (state: {state})")
    elif kind == "end_visit":
        if not can_send:
            return refuse("you don't have permission to end visits")
        if state in ("not_started", "ended"):
            return refuse(f"there is no open visit to end (state: {state})")
    elif kind == "set_location":
        if not can_conduct:
            return refuse("only the visit's provider can record where the patient is")
        if args.get("location") not in billing.LOCATIONS:
            return refuse("location must be 'home' or 'other'")
        if state not in ("in_visit", "ended"):
            return refuse(f"the visit hasn't started (state: {state})")
        proposal["location"] = args["location"]
    return {
        "ok": True,
        "proposal": proposal,
        "note": "Shown to the staff member for confirmation. It has NOT happened yet.",
    }


HANDLERS = {"list_visits": list_visits, "get_visit": get_visit, "propose_action": propose_action}
