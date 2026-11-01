"""The staff Inbox: one list for everything addressed to a person.

* messages: internal threads (like email, not chat) with replies, forward, read/done per person
* alerts: stored notices (critical / abnormal / new results for their patients, co-sign outcomes)
* to sign: the person's draft notes and draft orders (worked out, not stored)
* co-sign requests: notes asked of them and orders waiting for a co-sign (worked out)
* sent: threads they started and co-signature requests they made
* done: anything handled, kept for DONE_DAYS days

Items are plain dicts with a `key` ("msg:3", "alert:9", "sign:note:12", ...). Items that are worked
out from other records are done when the record is; only their read time is stored (InboxState).
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.models import Registration
from users.rights import user_has_right

from .models import (
    ClinicalNote,
    InboxAlert,
    InboxState,
    MessageThread,
    NoteCosign,
    Order,
    ThreadMessage,
    ThreadParticipant,
)

User = get_user_model()
STAFF_ROLES = ("doctor", "nurse", "registrar", "admin", "system_admin")
DONE_DAYS = 30
LIMIT = 300
FOLDERS = ("all", "messages", "alerts", "sign", "cosign", "sent", "done")


class InboxError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def name_of(user):
    return (f"{user.first_name} {user.last_name}".strip() or user.username) if user else ""


def _org_filter(user):
    return {} if sees_all_orgs(user) or user.organization_id is None else {"organization_id": user.organization_id}


# --- people and patients ------------------------------------------------------

def people_for(user):
    """Staff of the person's clinic they can write to (never themselves)."""
    qs = User.objects.filter(is_active=True, role__in=STAFF_ROLES).exclude(pk=user.pk)
    if not sees_all_orgs(user) and user.organization_id is not None:
        qs = qs.filter(organization_id=user.organization_id)
    return [{"id": u.pk, "name": name_of(u), "role": u.role} for u in qs.order_by("last_name", "first_name", "username")]


def _patients(ids):
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {u.pk: {"id": u.pk, "name": name_of(u)} for u in User.objects.filter(pk__in=ids)}


def _care(ids):
    """{patient user id: care setting} from the open visit, else the latest one."""
    ids = {i for i in ids if i}
    out, open_seen = {}, set()
    if not ids:
        return out
    rows = Registration.objects.filter(patient__user_id__in=ids).order_by("-id").values_list(
        "patient__user_id", "care_setting", "discharge_datetime"
    )
    for uid, care, discharged in rows:
        if uid not in out:
            out[uid] = care or ""  # the latest visit, until an open one is found
        if discharged is None and uid not in open_seen:
            open_seen.add(uid)
            out[uid] = care or ""
    return out


def _preview(text, n=140):
    text = " ".join((text or "").split())
    return text if len(text) <= n else text[: n - 1] + "…"


# --- messages -----------------------------------------------------------------

def _recipients(user, ids):
    ids = {int(i) for i in (ids or []) if str(i).isdigit()} - {user.pk}
    if not ids:
        raise InboxError("Choose who to send this to.")
    allowed = {p["id"] for p in people_for(user)}
    if not ids <= allowed:
        raise InboxError("You can only write to staff at your clinic.")
    return list(User.objects.filter(pk__in=ids))


@transaction.atomic
def send_message(user, to, subject, body, patient_id=None):
    subject, body = (subject or "").strip(), (body or "").strip()
    if not subject:
        raise InboxError("Add a subject.")
    if not body:
        raise InboxError("Write a message.")
    people = _recipients(user, to)
    patient = None
    if patient_id:
        patient = User.objects.filter(pk=patient_id, role="patient").first()
        if patient is None or (not sees_all_orgs(user) and user.organization_id and patient.organization_id not in (None, user.organization_id)):
            raise InboxError("That patient was not found.")
    now = timezone.now()
    thread = MessageThread.objects.create(
        organization=user.organization, subject=subject[:200], patient=patient, created_by=user, last_message_at=now
    )
    ThreadMessage.objects.create(thread=thread, sender=user, body=body)
    ThreadParticipant.objects.create(thread=thread, user=user, last_read_at=now)
    ThreadParticipant.objects.bulk_create([ThreadParticipant(thread=thread, user=p) for p in people])
    return thread


def _my_thread(user, thread_id):
    part = ThreadParticipant.objects.select_related("thread").filter(thread_id=thread_id, user=user).first()
    if part is None:
        raise InboxError("That message was not found.", 404)
    return part


@transaction.atomic
def reply(user, thread_id, body):
    body = (body or "").strip()
    if not body:
        raise InboxError("Write a reply.")
    part = _my_thread(user, thread_id)
    thread = part.thread
    now = timezone.now()
    ThreadMessage.objects.create(thread=thread, sender=user, body=body)
    thread.last_message_at = now
    thread.save(update_fields=["last_message_at"])
    # A reply brings the thread back for everyone else, and reads as read for the sender.
    ThreadParticipant.objects.filter(thread=thread).exclude(user=user).update(done_at=None)
    part.last_read_at, part.done_at = now, None
    part.save(update_fields=["last_read_at", "done_at"])
    return thread


@transaction.atomic
def forward(user, thread_id, to, note=""):
    part = _my_thread(user, thread_id)
    thread = part.thread
    quoted = "\n\n".join(
        f"--- {name_of(m.sender)}, {m.created_at:%b %d %Y %H:%M} ---\n{m.body}" for m in thread.messages.select_related("sender")
    )
    body = ((note or "").strip() + "\n\n" if (note or "").strip() else "") + "Forwarded message:\n" + quoted
    return send_message(user, to, f"Fwd: {thread.subject}"[:200], body, thread.patient_id)


# --- stored-alert helpers -----------------------------------------------------

def notify(recipient, title, body="", *, kind="notice", patient=None, source_type="", source_id=None, organization=None):
    """Put an alert in someone's Inbox. The same source and kind is only ever sent once."""
    if recipient is None:
        return None
    fields = dict(
        organization=organization or recipient.organization, patient=patient, title=title[:200], body=body, created_at=timezone.now()
    )
    if source_id is not None:
        alert, _ = InboxAlert.objects.get_or_create(
            recipient=recipient, source_type=source_type, source_id=source_id, kind=kind, defaults=fields
        )
        return alert
    return InboxAlert.objects.create(recipient=recipient, kind=kind, source_type=source_type, **fields)


# --- building the list ---------------------------------------------------------

def _states(user):
    return set(InboxState.objects.filter(user=user, read_at__isnull=False).values_list("key", flat=True))


def _message_items(user, now):
    parts = (
        ThreadParticipant.objects.filter(user=user)
        .select_related("thread__patient", "thread__created_by")
        .prefetch_related("thread__messages__sender")
        .order_by("-thread__last_message_at")[:LIMIT]
    )
    out = []
    for part in parts:
        t = part.thread
        msgs = list(t.messages.all())
        if not msgs:
            continue
        last = msgs[-1]
        others = any(m.sender_id != user.pk for m in msgs)
        out.append({
            "key": f"msg:{t.pk}", "kind": "message", "subtype": "thread", "title": t.subject,
            "preview": _preview(last.body), "from_name": name_of(last.sender), "from_me": last.sender_id == user.pk,
            "patient_id": t.patient_id, "at": t.last_message_at, "count": len(msgs),
            "unread": last.sender_id != user.pk and (part.last_read_at is None or part.last_read_at < t.last_message_at),
            "done": part.done_at is not None, "done_at": part.done_at, "received": others, "sent": t.created_by_id == user.pk,
            "severity": "", "overdue": False, "due_at": None,
        })
    return out


def _alert_items(user, now):
    out = []
    for a in InboxAlert.objects.filter(recipient=user).order_by("-created_at")[:LIMIT]:
        out.append({
            "key": f"alert:{a.pk}", "kind": "alert", "subtype": a.kind, "title": a.title, "preview": _preview(a.body),
            "from_name": "System", "from_me": False, "patient_id": a.patient_id, "at": a.created_at, "count": 1,
            "unread": a.read_at is None, "done": a.done_at is not None, "done_at": a.done_at, "received": True, "sent": False,
            "severity": {"critical": "critical", "abnormal": "abnormal"}.get(a.kind, ""), "overdue": False, "due_at": None,
        })
    return out


def _note_label(note):
    return (note.documentation_type or note.note_type or "note").replace("_", " ").capitalize()


def _sign_items(user, now):
    """Drafts to sign (open), and what they signed in the last DONE_DAYS days (done)."""
    scope = _org_filter(user)
    since = now - timedelta(days=DONE_DAYS)
    out = []
    notes = ClinicalNote.objects.filter(author=user, **scope).filter(Q(status="draft") | Q(status="signed", signed_at__gte=since)).select_related("patient")
    for n in notes.order_by("-updated_at")[:LIMIT]:
        done = n.status == "signed"
        out.append({
            "key": f"sign:note:{n.pk}", "kind": "sign", "subtype": "note", "title": f"{_note_label(n)} to sign" if not done else f"{_note_label(n)} signed",
            "preview": _preview(n.assessment or n.subjective or "Draft note"), "from_name": "You", "from_me": True,
            "patient_id": n.patient_id, "at": n.signed_at if done else n.updated_at, "count": 1, "unread": False,
            "done": done, "done_at": n.signed_at if done else None, "received": True, "sent": False, "severity": "", "overdue": False, "due_at": None,
            "ref": {"note_id": n.pk, "appointment": n.appointment_id},
        })
    orders = Order.objects.filter(ordering_provider=user, **scope).filter(Q(status="draft") | Q(signed_at__gte=since)).select_related("patient")
    for o in orders.order_by("-updated_at")[:LIMIT]:
        done = o.status != "draft"
        out.append({
            "key": f"sign:order:{o.pk}", "kind": "sign", "subtype": "order", "title": f"Order to sign: {o.orderable_name}" if not done else f"Order signed: {o.orderable_name}",
            "preview": _preview(o.indication or o.orderable_category), "from_name": "You", "from_me": True,
            "patient_id": o.patient_id, "at": o.signed_at or o.created_at, "count": 1, "unread": False,
            "done": done, "done_at": o.signed_at if done else None, "received": True, "sent": False, "severity": "", "overdue": False, "due_at": None,
            "ref": {"order_id": o.pk, "appointment": o.appointment_id},
        })
    return out


def _cosign_items(user, now):
    """Co-signatures asked of the person (notes) and orders waiting for one, plus the ones they asked for (sent)."""
    scope = _org_filter(user)
    since = now - timedelta(days=DONE_DAYS)
    out = []
    asked = NoteCosign.objects.filter(cosigner=user).filter(Q(status="pending") | Q(resolved_at__gte=since, status__in=("cosigned", "returned")))
    for r in asked.select_related("note__patient", "requested_by").order_by("-created_at")[:LIMIT]:
        done = r.status != "pending"
        out.append({
            "key": f"cosign:note:{r.pk}", "kind": "cosign", "subtype": "note",
            "title": f"Co-sign: {_note_label(r.note)}" if not done else f"{_note_label(r.note)} {'co-signed' if r.status == 'cosigned' else 'returned'}",
            "preview": _preview(r.message or r.note.assessment or r.note.subjective), "from_name": name_of(r.requested_by), "from_me": False,
            "patient_id": r.note.patient_id, "at": r.created_at, "count": 1, "unread": False, "done": done, "done_at": r.resolved_at,
            "received": True, "sent": False, "severity": "", "overdue": bool(r.status == "pending" and r.due_at and r.due_at < now), "due_at": r.due_at,
            "ref": {"note_id": r.note_id, "request_id": r.pk, "appointment": r.note.appointment_id, "status": r.status},
        })
    if user_has_right(user, "orders.cosign"):
        waiting = Order.objects.filter(status="pending_cosign", **scope).exclude(signed_by=user).select_related("patient", "signed_by")
        for o in waiting.order_by("-signed_at")[:LIMIT]:
            out.append({
                "key": f"cosign:order:{o.pk}", "kind": "cosign", "subtype": "order", "title": f"Co-sign order: {o.orderable_name}",
                "preview": _preview(o.indication or o.orderable_category), "from_name": name_of(o.signed_by), "from_me": False,
                "patient_id": o.patient_id, "at": o.signed_at or o.created_at, "count": 1, "unread": False, "done": False, "done_at": None,
                "received": True, "sent": False, "severity": "", "overdue": False, "due_at": None,
                "ref": {"order_id": o.pk, "appointment": o.appointment_id},
            })
        for o in Order.objects.filter(cosigned_by=user, cosigned_at__gte=since, **scope).select_related("patient", "signed_by")[:LIMIT]:
            out.append({
                "key": f"cosign:order:{o.pk}", "kind": "cosign", "subtype": "order", "title": f"Order co-signed: {o.orderable_name}",
                "preview": _preview(o.indication or o.orderable_category), "from_name": name_of(o.signed_by), "from_me": False,
                "patient_id": o.patient_id, "at": o.cosigned_at, "count": 1, "unread": False, "done": True, "done_at": o.cosigned_at,
                "received": True, "sent": False, "severity": "", "overdue": False, "due_at": None, "ref": {"order_id": o.pk, "appointment": o.appointment_id},
            })
    # What the person asked others to co-sign shows under Sent.
    for r in NoteCosign.objects.filter(requested_by=user).select_related("note__patient", "cosigner").order_by("-created_at")[:LIMIT]:
        out.append({
            "key": f"cosign:sent:{r.pk}", "kind": "cosign", "subtype": "note",
            "title": f"Co-signature requested: {_note_label(r.note)}", "preview": _preview(r.message) or f"To {name_of(r.cosigner)} · {r.get_status_display()}",
            "from_name": "You", "from_me": True, "patient_id": r.note.patient_id, "at": r.created_at, "count": 1, "unread": False,
            "done": r.status in ("cosigned", "cancelled"), "done_at": r.resolved_at, "received": False, "sent": True, "severity": "",
            "overdue": bool(r.status == "pending" and r.due_at and r.due_at < now), "due_at": r.due_at,
            "ref": {"note_id": r.note_id, "request_id": r.pk, "appointment": r.note.appointment_id, "status": r.status, "to": name_of(r.cosigner)},
        })
    return out


def build(user, folder="all", *, unread=False, patient=None, q="", care=None, now=None):
    """The list for one folder. Done is its own folder; every other folder shows what is still open."""
    if folder not in FOLDERS:
        folder = "all"
    now = now or timezone.now()
    send_due_reminders(now, user=user)
    since = now - timedelta(days=DONE_DAYS)
    items = _message_items(user, now) + _alert_items(user, now) + _sign_items(user, now) + _cosign_items(user, now)
    reads = _states(user)
    for it in items:
        if it["kind"] == "cosign" and not it["done"] and not it["sent"]:
            it["unread"] = it["key"] not in reads
    if folder == "done":
        items = [i for i in items if i["done"] and (i["done_at"] or i["at"]) >= since]
    else:
        items = [i for i in items if not i["done"] or (folder == "sent" and i["sent"])]
        if folder == "messages":
            items = [i for i in items if i["kind"] == "message" and i["received"]]
        elif folder == "alerts":
            items = [i for i in items if i["kind"] == "alert"]
        elif folder == "sign":
            items = [i for i in items if i["kind"] == "sign"]
        elif folder == "cosign":
            items = [i for i in items if i["kind"] == "cosign" and not i["sent"]]
        elif folder == "sent":
            items = [i for i in items if i["sent"]]
        else:
            items = [i for i in items if not i["sent"] or (i["kind"] == "message" and i["received"])]
    patients = _patients(i["patient_id"] for i in items)
    careof = _care(i["patient_id"] for i in items)
    for i in items:
        i["patient"] = patients.get(i["patient_id"])
        i["care"] = careof.get(i["patient_id"], "")
    if unread:
        items = [i for i in items if i["unread"]]
    if patient:
        items = [i for i in items if i["patient_id"] == int(patient)]
    if care:
        items = [i for i in items if i["care"] == care]
    if q:
        needle = q.lower()
        items = [i for i in items if needle in " ".join([i["title"], i["preview"], i["from_name"], (i["patient"] or {}).get("name", "")]).lower()]
    items.sort(key=lambda i: i["at"], reverse=True)
    return items


def counts(user, now=None):
    """Unread per folder for the tab badge and the folder list."""
    out = {}
    for folder in ("all", "messages", "alerts", "sign", "cosign"):
        out[folder] = len(build(user, folder, unread=True, now=now))
    out["sign_open"] = len(build(user, "sign", now=now))
    out["cosign_open"] = len(build(user, "cosign", now=now))
    return out


# --- opening and marking -------------------------------------------------------

def _split(key):
    parts = (key or "").split(":")
    return parts[0], parts[1:]


def mark_read(user, key, read=True):
    kind, rest = _split(key)
    now = timezone.now() if read else None
    if kind == "msg":
        part = _my_thread(user, int(rest[0]))
        part.last_read_at = now or (part.thread.created_at - timedelta(seconds=1))
        part.save(update_fields=["last_read_at"])
    elif kind == "alert":
        updated = InboxAlert.objects.filter(pk=int(rest[0]), recipient=user).update(read_at=now)
        if not updated:
            raise InboxError("That item was not found.", 404)
    elif kind in ("sign", "cosign"):
        InboxState.objects.update_or_create(user=user, key=key, defaults={"read_at": now})
    else:
        raise InboxError("That item was not found.", 404)


def set_done(user, key, done=True):
    kind, rest = _split(key)
    now = timezone.now() if done else None
    if kind == "msg":
        part = _my_thread(user, int(rest[0]))
        part.done_at = now
        if done and (part.last_read_at is None or part.last_read_at < part.thread.last_message_at):
            part.last_read_at = timezone.now()
        part.save(update_fields=["done_at", "last_read_at"])
    elif kind == "alert":
        fields = {"done_at": now}
        if done:
            fields["read_at"] = now
        if not InboxAlert.objects.filter(pk=int(rest[0]), recipient=user).update(**fields):
            raise InboxError("That item was not found.", 404)
    else:
        raise InboxError("Sign or co-sign this item and it moves to Done by itself.")


def detail(user, key):
    """Everything the reading pane shows for one item (and marks it read)."""
    kind, rest = _split(key)
    mark_read(user, key, True)
    if kind == "msg":
        part = _my_thread(user, int(rest[0]))
        t = part.thread
        people = [name_of(p.user) for p in t.participants.select_related("user")]
        return {
            "key": key, "kind": "message", "title": t.subject, "patient": _patients([t.patient_id]).get(t.patient_id), "people": people,
            "messages": [
                {"id": m.pk, "from_name": name_of(m.sender), "from_me": m.sender_id == user.pk, "body": m.body, "at": m.created_at}
                for m in t.messages.select_related("sender")
            ],
        }
    if kind == "alert":
        a = InboxAlert.objects.filter(pk=int(rest[0]), recipient=user).first()
        if a is None:
            raise InboxError("That item was not found.", 404)
        return {
            "key": key, "kind": "alert", "subtype": a.kind, "title": a.title, "body": a.body, "at": a.created_at,
            "patient": _patients([a.patient_id]).get(a.patient_id), "source": {"type": a.source_type, "id": a.source_id},
        }
    if kind in ("sign", "cosign") and rest and rest[0] in ("note", "sent"):
        if rest[0] == "note":
            req = NoteCosign.objects.filter(pk=int(rest[1]), cosigner=user).select_related("note__patient", "requested_by").first()
            note = req.note if req else ClinicalNote.objects.filter(pk=int(rest[1]), author=user).select_related("patient").first()
        else:
            req = NoteCosign.objects.filter(pk=int(rest[1]), requested_by=user).select_related("note__patient", "cosigner").first()
            note = req.note if req else None
        if kind == "sign" and rest[0] == "note":
            req = None
        if note is None:
            raise InboxError("That item was not found.", 404)
        return {
            "key": key, "kind": kind, "subtype": "note", "title": _note_label(note), "patient": _patients([note.patient_id]).get(note.patient_id),
            "note": {"id": note.pk, "appointment": note.appointment_id, "status": note.status, "subjective": note.subjective, "objective": note.objective, "assessment": note.assessment, "plan": note.plan, "signed_at": note.signed_at},
            "request": None if req is None else {
                "id": req.pk, "status": req.status, "message": req.message, "due_at": req.due_at, "comment": req.comment,
                "from_name": name_of(req.requested_by), "to_name": name_of(req.cosigner),
            },
        }
    if kind in ("sign", "cosign") and rest and rest[0] == "order":
        o = Order.objects.filter(pk=int(rest[1])).select_related("patient").first()
        if o is None or (o.organization_id != user.organization_id and not sees_all_orgs(user)):
            raise InboxError("That item was not found.", 404)
        return {
            "key": key, "kind": kind, "subtype": "order", "title": o.orderable_name, "patient": _patients([o.patient_id]).get(o.patient_id),
            "order": {"id": o.pk, "appointment": o.appointment_id, "status": o.status, "priority": o.priority, "indication": o.indication},
        }
    raise InboxError("That item was not found.", 404)


# --- reminders and notices -----------------------------------------------------

def send_due_reminders(now=None, user=None):
    """Remind co-signers whose reminder time has come and mark overdue requests for both people.
    Runs when a person opens their Inbox and from the send_cosign_reminders command."""
    now = now or timezone.now()
    pending = NoteCosign.objects.filter(status="pending", due_at__isnull=False).select_related("note__patient", "cosigner", "requested_by")
    if user is not None:
        pending = pending.filter(Q(cosigner=user) | Q(requested_by=user))
    sent = 0
    for r in pending:
        label = _note_label(r.note)
        patient = r.note.patient
        if r.due_at < now:
            for who, text in ((r.cosigner, f"{label} for {name_of(patient)} is overdue for your co-signature."),
                              (r.requested_by, f"{name_of(r.cosigner)} has not co-signed your {label.lower()} for {name_of(patient)}; it is overdue.")):
                if notify(who, "Co-signature overdue", text, kind="notice", patient=patient, source_type="cosign_overdue", source_id=r.pk, organization=r.organization):
                    sent += 1
        elif r.reminder_minutes is not None and r.due_at - timedelta(minutes=r.reminder_minutes) <= now:
            when = f"due {timezone.localtime(r.due_at):%b %d %H:%M}"
            if notify(r.cosigner, "Co-signature reminder", f"{label} for {name_of(patient)} needs your co-signature, {when}.", kind="notice",
                      patient=patient, source_type="cosign_reminder", source_id=r.pk, organization=r.organization):
                sent += 1
    return sent


def notify_cosign_outcome(req):
    """Tell the person who asked that their note was co-signed or returned."""
    note = req.note
    label = _note_label(note)
    if req.status == "cosigned":
        title, body = "Note co-signed", f"{name_of(req.cosigner)} co-signed your {label.lower()} for {name_of(note.patient)}."
    else:
        title = "Note returned with comments"
        body = f"{name_of(req.cosigner)} returned your {label.lower()} for {name_of(note.patient)}: {req.comment} Add an addendum, then request co-signature again."
    notify(req.requested_by, title, body, kind="notice", patient=note.patient, source_type=f"cosign_{req.status}", source_id=req.pk, organization=req.organization)


# --- lab alerts ----------------------------------------------------------------

CRITICAL_FLAGS = ("LL", "HH")


def lab_recipients(report):
    """Whose patient it is: the ordering provider, else the attending of the patient's visits."""
    if report.order_id and report.order.ordering_provider_id:
        return [report.order.ordering_provider]
    seen, out = set(), []
    regs = Registration.objects.filter(patient__user_id=report.patient_id).select_related("attending_provider").order_by("-id")[:5]
    for reg in sorted(regs, key=lambda r: r.discharge_datetime is not None):
        doc = reg.attending_provider
        if doc is not None and doc.pk not in seen and doc.is_active:
            seen.add(doc.pk)
            out.append(doc)
        if out:
            break
    return out


def notify_lab_report(report):
    """Critical, abnormal or plain new-result alert to the patient's provider."""
    if report.status == "entered_in_error":
        return 0
    flags = [i.abnormal_flag for i in report.items.all()]
    if any(f in CRITICAL_FLAGS for f in flags):
        kind = "critical"
    elif any(flags):
        kind = "abnormal"
    else:
        kind = "result"
    flagged = [i for i in report.items.all() if i.abnormal_flag]
    lines = [f"{i.test_name}: {i.value} {i.units}".strip() + (f" ({i.abnormal_flag})" if i.abnormal_flag else "") for i in (flagged or report.items.all())[:8]]
    label = {"critical": "Critical result", "abnormal": "Abnormal result", "result": "New result"}[kind]
    count = 0
    for doc in lab_recipients(report):
        if notify(doc, f"{label}: {report.title}", "\n".join(lines), kind=kind, patient=report.patient,
                  source_type="lab_report", source_id=report.pk, organization=report.organization):
            count += 1
    return count
