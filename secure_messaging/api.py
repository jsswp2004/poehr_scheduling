"""Secure staff messaging API (mounted at /api/secure-messages/)."""

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Max, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from users.facility_scope import assigned_facility_ids  # noqa: F401  (re-exported for tests)
from users.models import CustomUser
from users.permissions import HasRight
from users.rights import user_has_right

from . import images, services
from .models import AuditEvent, MessageAttachment, SecureMessage, Thread, ThreadMember

PERMS = [permissions.IsAuthenticated, HasRight("secure_messaging.use")]
AUDIT_PERMS = [permissions.IsAuthenticated, HasRight("secure_messaging.audit")]
MAX_IMAGES = 4
PAGE = 50


def _bad(detail, code=400):
    return Response({"detail": detail}, status=code)


def _org_error(request):
    if request.user.organization_id is None:
        return _bad("Secure messaging needs a user who belongs to an organization.", 403)
    return None


def _member(user, thread_id):
    """The user's active membership in a thread of their own organization, else None."""
    return (
        ThreadMember.objects.select_related("thread", "thread__patient")
        .filter(user=user, thread_id=thread_id, left_at__isnull=True, thread__organization_id=user.organization_id)
        .first()
    )


# --------------------------------------------------------------------------
# serialization
# --------------------------------------------------------------------------

def _message_out(m, viewer, include_retracted_text=False):
    retracted = m.retracted_at is not None
    hidden = retracted and not include_retracted_text
    reply = None
    if m.reply_to_id and m.reply_to is not None:
        r = m.reply_to
        reply = {
            "id": r.pk,
            "sender": services.display_name(r.sender),
            "preview": "Message retracted" if r.retracted_at else r.body[:100],
        }
    return {
        "id": m.pk,
        "thread": m.thread_id,
        "sender": services.user_ref(m.sender),
        "mine": m.sender_id == viewer.pk,
        "kind": m.kind,
        "body": None if hidden else m.body,
        "retracted": retracted,
        "retracted_at": m.retracted_at.isoformat() if retracted else None,
        "retracted_by": services.display_name(m.retracted_by) if retracted and m.retracted_by_id else None,
        "retract_reason": m.retract_reason if (retracted and include_retracted_text) else "",
        "priority": m.priority,
        "reply_to": reply,
        "care_setting": m.care_setting,
        "visit": m.visit_id,
        "created_at": m.created_at.isoformat(),
        "attachments": [] if hidden else [
            {"id": a.pk, "name": a.filename, "width": a.width, "height": a.height, "size": a.size} for a in m.attachments.all()
        ],
    }


def _thread_title(thread, viewer, members):
    if thread.kind == Thread.DIRECT:
        others = [m.user for m in members if m.user_id != viewer.pk]
        return services.display_name(others[0]) if others else "Just you"
    if thread.kind == Thread.PATIENT and thread.patient_id:
        return f"{services.patient_name(thread.patient)} · care team"
    return thread.title or "Conversation"


def _thread_out(thread, viewer, unread=0, urgent_unread=0, last=None, with_members=True):
    members = list(thread.members.select_related("user").filter(left_at__isnull=True))
    out = {
        "id": thread.pk,
        "kind": thread.kind,
        "me": viewer.pk,
        "title": _thread_title(thread, viewer, members),
        "patient": {"id": thread.patient_id, "name": services.patient_name(thread.patient)} if thread.patient_id else None,
        "facility": thread.facility_id,
        "last_message_at": thread.last_message_at.isoformat() if thread.last_message_at else None,
        "unread": unread,
        "urgent_unread": urgent_unread,
        "last_message": None,
    }
    if last is not None:
        out["last_message"] = {
            "sender": services.display_name(last.sender),
            "preview": "Message retracted" if last.retracted_at else (last.body[:100] or "Photo"),
            "at": last.created_at.isoformat(),
            "has_images": last.retracted_at is None and last.attachments.exists(),
        }
    if with_members:
        out["members"] = [
            {**services.user_ref(m.user), "last_read": m.last_read_message_id, "owner": m.role == ThreadMember.OWNER}
            for m in members
        ]
    return out


def _unread_threads(user):
    """The user's threads with unread counts (others' non-system, non-retracted messages past their read mark)."""
    unread_q = Q(messages__id__gt=F("members__last_read_message_id"), messages__retracted_at__isnull=True, messages__kind="text") & ~Q(
        messages__sender=user
    )
    return (
        Thread.objects.filter(
            organization_id=user.organization_id, members__user=user, members__left_at__isnull=True, is_archived=False
        )
        .annotate(
            unread=Count("messages", filter=unread_q, distinct=True),
            urgent_unread=Count("messages", filter=unread_q & Q(messages__priority="urgent"), distinct=True),
        )
    )


# --------------------------------------------------------------------------
# people and threads
# --------------------------------------------------------------------------

class PeopleView(APIView):
    """GET ?q=&all=1: colleagues you can message. By default only people at your own facilities."""

    permission_classes = PERMS

    def get(self, request):
        if (e := _org_error(request)) is not None:
            return e
        q = (request.query_params.get("q") or "").strip()
        people = CustomUser.objects.filter(
            organization_id=request.user.organization_id, is_active=True, role__in=services.MESSAGING_ROLES
        ).exclude(pk=request.user.pk)
        if q:
            people = people.filter(Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(username__icontains=q))
        people = people.prefetch_related("facilities").order_by("last_name", "first_name", "id")
        show_all = request.query_params.get("all") in ("1", "true", "yes")
        out = []
        for p in people:
            if not user_has_right(p, "secure_messaging.use"):
                continue
            if not show_all and not services.shares_facility(request.user, p):
                continue
            out.append({**services.user_ref(p), "facilities": [f.name for f in p.facilities.all() if f.organization_id == p.organization_id]})
            if len(out) >= 100:
                break
        return Response({"people": out, "limited_to_my_facilities": assigned_facility_ids(request.user) is not None and not show_all})


class ThreadListView(APIView):
    """GET ?patient=<id>: your threads, newest first. POST: start one (direct, group, channel or patient)."""

    permission_classes = PERMS

    def get(self, request):
        if (e := _org_error(request)) is not None:
            return e
        threads = _unread_threads(request.user).select_related("patient")
        patient = request.query_params.get("patient")
        if patient:
            if not str(patient).isdigit():
                return _bad("Invalid patient.")
            threads = threads.filter(patient_id=int(patient))
        threads = list(threads.order_by("-last_message_at", "-id")[:100])
        ids = [t.pk for t in threads]
        latest = {}
        if ids:
            newest = SecureMessage.objects.filter(thread_id__in=ids).values("thread_id").annotate(last=Max("id"))
            rows = SecureMessage.objects.filter(pk__in=[n["last"] for n in newest]).select_related("sender")
            latest = {m.thread_id: m for m in rows}
        return Response({"threads": [_thread_out(t, request.user, t.unread, t.urgent_unread, latest.get(t.pk), with_members=False) for t in threads]})

    def post(self, request):
        if (e := _org_error(request)) is not None:
            return e
        kind = request.data.get("kind")
        me = request.user
        if kind == Thread.DIRECT:
            return self._direct(request, me)
        if kind in (Thread.GROUP, Thread.CHANNEL):
            return self._group(request, me, kind)
        if kind == Thread.PATIENT:
            return self._patient(request, me)
        return _bad("kind must be direct, group, channel or patient.")

    def _people(self, request, ids, label="members"):
        if not isinstance(ids, list) or any(isinstance(i, bool) or not str(i).isdigit() for i in ids):
            return None, _bad(f"{label} must be a list of user ids.")
        wanted = {int(i) for i in ids}
        found = list(CustomUser.objects.filter(pk__in=wanted))
        if len(found) != len(wanted) or not all(services.may_message(request.user, u) for u in found):
            return None, _bad("Everyone must be an active colleague in your organization who can use secure messaging.")
        return found, None

    @transaction.atomic
    def _direct(self, request, me):
        raw = request.data.get("user")
        if isinstance(raw, bool) or not str(raw).isdigit():
            return _bad("user is required.")
        people, err = self._people(request, [raw], "user")
        if err:
            return err
        other = people[0]
        if other.pk == me.pk:
            return _bad("Choose someone else to message.")
        key = f"{min(me.pk, other.pk)}:{max(me.pk, other.pk)}"
        thread = Thread.objects.filter(organization_id=me.organization_id, kind=Thread.DIRECT, direct_key=key).first()
        created = False
        if thread is None:
            try:
                with transaction.atomic():
                    thread = Thread.objects.create(organization_id=me.organization_id, kind=Thread.DIRECT, direct_key=key, created_by=me)
                    created = True
            except IntegrityError:
                thread = Thread.objects.get(organization_id=me.organization_id, kind=Thread.DIRECT, direct_key=key)
        services.add_member(thread, me, me, ThreadMember.OWNER)
        services.add_member(thread, other, me)
        if created:
            services.audit(me, "create_thread", thread=thread, detail="direct")
        return Response(_thread_out(thread, me), status=201 if created else 200)

    @transaction.atomic
    def _group(self, request, me, kind):
        title = str(request.data.get("title") or "").strip()
        if not title or len(title) > 120:
            return _bad("Give the conversation a name (up to 120 characters).")
        if kind == Thread.CHANNEL and me.role not in ("admin", "system_admin"):
            return _bad("Only an administrator can create a channel.", 403)
        people, err = self._people(request, request.data.get("members", []))
        if err:
            return err
        if kind == Thread.GROUP and not people:
            return _bad("Add at least one other person.")
        if len(people) > 49:
            return _bad("A conversation can have up to 50 people.")
        facility = None
        if request.data.get("facility"):
            from appointments.models import Facility

            facility = Facility.objects.filter(pk=request.data["facility"], organization_id=me.organization_id).first()
            if facility is None:
                return _bad("That facility is not in your organization.")
        thread = Thread.objects.create(organization_id=me.organization_id, kind=kind, title=title, facility=facility, created_by=me)
        services.add_member(thread, me, me, ThreadMember.OWNER)
        for p in people:
            services.add_member(thread, p, me)
        services.audit(me, "create_thread", thread=thread, detail=kind)
        return Response(_thread_out(thread, me), status=201)

    @transaction.atomic
    def _patient(self, request, me):
        if me.role not in services.PATIENT_THREAD_ROLES:
            return _bad("Your role cannot open a patient care-team thread.", 403)
        raw = request.data.get("patient")
        if isinstance(raw, bool) or not str(raw).isdigit():
            return _bad("patient is required.")
        patient = CustomUser.objects.filter(pk=int(raw), role="patient", organization_id=me.organization_id).first()
        if patient is None:
            return _bad("Patient not found.", 404)
        thread = Thread.objects.filter(organization_id=me.organization_id, kind=Thread.PATIENT, patient=patient).first()
        created = False
        if thread is None:
            try:
                with transaction.atomic():
                    thread = Thread.objects.create(organization_id=me.organization_id, kind=Thread.PATIENT, patient=patient, created_by=me)
                    created = True
            except IntegrityError:
                thread = Thread.objects.get(organization_id=me.organization_id, kind=Thread.PATIENT, patient=patient)
        if created:
            services.seed_care_team(thread, patient, me)
            services.audit(me, "create_thread", thread=thread, patient=patient, detail="patient")
        member, added = services.add_member(thread, me, me, ThreadMember.OWNER if created else ThreadMember.MEMBER)
        if added and not created:
            services.system_message(thread, me, f"{services.display_name(me)} joined the care team")
            services.audit(me, "joined_patient_thread", thread=thread, patient=patient)
        return Response(_thread_out(thread, me), status=201 if created else 200)


class ThreadDetailView(APIView):
    permission_classes = PERMS

    def get(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        member = _member(request.user, pk)
        if member is None:
            return _bad("Conversation not found.", 404)
        return Response(_thread_out(member.thread, request.user))


# --------------------------------------------------------------------------
# messages
# --------------------------------------------------------------------------

class MessageListView(APIView):
    """GET ?after=<id>&before=<id>&limit=: messages, oldest first. POST: send (JSON, or multipart with up to 4 photos)."""

    permission_classes = PERMS
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        member = _member(request.user, pk)
        if member is None:
            return _bad("Conversation not found.", 404)
        thread = member.thread
        qp = request.query_params
        try:
            limit = max(1, min(int(qp.get("limit", PAGE)), 100))
            after = int(qp["after"]) if qp.get("after") else None
            before = int(qp["before"]) if qp.get("before") else None
        except ValueError:
            return _bad("Invalid paging value.")
        rows = SecureMessage.objects.filter(thread=thread).select_related("sender", "reply_to__sender", "retracted_by").prefetch_related("attachments")
        if after is not None:
            batch = list(rows.filter(pk__gt=after).order_by("id")[:limit])
            has_more_older = False
        else:
            if before is not None:
                rows = rows.filter(pk__lt=before)
            batch = list(rows.order_by("-id")[:limit + 1])
            has_more_older = len(batch) > limit
            batch = list(reversed(batch[:limit]))
        if after is None and before is None and thread.kind == Thread.PATIENT:
            services.audit_once(request.user, "open_patient_thread", thread, patient=thread.patient)
        return Response({"messages": [_message_out(m, request.user) for m in batch], "has_more_older": has_more_older})

    @transaction.atomic
    def post(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        member = _member(request.user, pk)
        if member is None:
            return _bad("Conversation not found.", 404)
        thread, me = member.thread, request.user
        if thread.is_archived:
            return _bad("This conversation is archived.")
        body = str(request.data.get("body") or "").strip()
        if len(body) > services.MAX_BODY:
            return _bad(f"A message can be up to {services.MAX_BODY} characters.")
        files = request.FILES.getlist("images") if hasattr(request, "FILES") else []
        if len(files) > MAX_IMAGES:
            return _bad(f"You can send up to {MAX_IMAGES} pictures at a time.")
        if not body and not files:
            return _bad("Write a message or attach a picture.")
        priority = request.data.get("priority") or SecureMessage.ROUTINE
        if priority not in (SecureMessage.ROUTINE, SecureMessage.URGENT):
            return _bad("priority must be routine or urgent.")
        reply_to = None
        if request.data.get("reply_to"):
            reply_to = SecureMessage.objects.filter(pk=request.data["reply_to"], thread=thread).first() if str(request.data["reply_to"]).isdigit() else None
            if reply_to is None:
                return _bad("That message is not in this conversation.")
        processed = []
        for f in files:
            try:
                data, (w, h), thumb = images.shrink(f.read(), MessageAttachment.MAX_BYTES)
            except images.ImageRejected as exc:
                return _bad(str(exc))
            processed.append((str(f.name or "photo")[:120], data, thumb, w, h))
        visit, setting = None, ""
        if thread.kind == Thread.PATIENT and thread.patient_id:
            visit = services.current_visit(thread.patient)
            setting = (visit.care_setting if visit else "") or "ambulatory"
        message = SecureMessage.objects.create(
            thread=thread, sender=me, body=body, priority=priority, reply_to=reply_to, visit=visit, care_setting=setting
        )
        for name, data, thumb, w, h in processed:
            MessageAttachment.objects.create(
                message=message, thread=thread, filename=name, data=data, thumb=thumb, size=len(data), width=w, height=h
            )
        Thread.objects.filter(pk=thread.pk).update(last_message_at=message.created_at)
        ThreadMember.objects.filter(pk=member.pk, last_read_message_id__lt=message.pk).update(last_read_message_id=message.pk)
        services.audit(me, "send", thread=thread, message_id=message.pk, patient=thread.patient, detail=f"{priority}, {len(processed)} image(s)")
        recipients = list(
            ThreadMember.objects.filter(thread=thread, left_at__isnull=True).exclude(user=me).values_list("user_id", flat=True)
        )
        services.nudge(thread, message, recipients)
        message = SecureMessage.objects.select_related("sender", "reply_to__sender").prefetch_related("attachments").get(pk=message.pk)
        return Response(_message_out(message, me), status=201)


class ReadView(APIView):
    """POST {upto?}: mark the conversation read up to a message (default: everything)."""

    permission_classes = PERMS

    def post(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        member = _member(request.user, pk)
        if member is None:
            return _bad("Conversation not found.", 404)
        upto = request.data.get("upto")
        if upto in (None, ""):
            upto = SecureMessage.objects.filter(thread_id=pk).aggregate(m=Max("id"))["m"] or 0
        elif isinstance(upto, bool) or not str(upto).isdigit():
            return _bad("upto must be a message id.")
        ThreadMember.objects.filter(pk=member.pk, last_read_message_id__lt=int(upto)).update(last_read_message_id=int(upto))
        return Response({"last_read": max(member.last_read_message_id, int(upto))})


class RetractView(APIView):
    """POST {reason?}: hide your own message from the conversation. The text is kept for audit."""

    permission_classes = PERMS

    def post(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        message = SecureMessage.objects.select_related("thread").filter(pk=pk, thread__organization_id=request.user.organization_id).first()
        if message is None or _member(request.user, message.thread_id) is None:
            return _bad("Message not found.", 404)
        if message.sender_id != request.user.pk or message.kind != SecureMessage.TEXT:
            return _bad("You can only retract your own messages.", 403)
        if message.retracted_at is None:
            message.retracted_at = timezone.now()
            message.retracted_by = request.user
            message.retract_reason = str(request.data.get("reason") or "")[:200]
            message.save(update_fields=["retracted_at", "retracted_by", "retract_reason"])
            services.audit(request.user, "retract", thread=message.thread, message_id=message.pk, patient=message.thread.patient)
        message = SecureMessage.objects.select_related("sender", "reply_to__sender", "retracted_by").prefetch_related("attachments").get(pk=pk)
        return Response(_message_out(message, request.user))


# --------------------------------------------------------------------------
# members
# --------------------------------------------------------------------------

class MemberListView(APIView):
    """POST {user}: add someone to a group, channel or care-team thread."""

    permission_classes = PERMS

    @transaction.atomic
    def post(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        member = _member(request.user, pk)
        if member is None:
            return _bad("Conversation not found.", 404)
        thread, me = member.thread, request.user
        if thread.kind == Thread.DIRECT:
            return _bad("People cannot be added to a direct conversation. Start a group instead.")
        if thread.kind == Thread.CHANNEL and member.role != ThreadMember.OWNER and me.role not in ("admin", "system_admin"):
            return _bad("Only a channel owner or administrator can add people.", 403)
        raw = request.data.get("user")
        if isinstance(raw, bool) or not str(raw).isdigit():
            return _bad("user is required.")
        target = CustomUser.objects.filter(pk=int(raw)).first()
        if target is None or not services.may_message(me, target):
            return _bad("That person cannot be added.")
        if thread.kind == Thread.PATIENT and target.role not in services.PATIENT_THREAD_ROLES:
            return _bad("That role cannot be on a patient care team.")
        active = ThreadMember.objects.filter(thread=thread, left_at__isnull=True).count()
        if active >= 50:
            return _bad("A conversation can have up to 50 people.")
        _, added = services.add_member(thread, target, me)
        if added:
            services.system_message(thread, me, f"{services.display_name(me)} added {services.display_name(target)}")
            services.audit(me, "add_member", thread=thread, patient=thread.patient, detail=f"user {target.pk}")
        return Response(_thread_out(thread, me))


class MemberDetailView(APIView):
    """DELETE: leave a conversation (yourself), or remove someone (owners and administrators)."""

    permission_classes = PERMS

    @transaction.atomic
    def delete(self, request, pk, user_id):
        if (e := _org_error(request)) is not None:
            return e
        member = _member(request.user, pk)
        if member is None:
            return _bad("Conversation not found.", 404)
        thread, me = member.thread, request.user
        if thread.kind == Thread.DIRECT:
            return _bad("You cannot leave a direct conversation.")
        target = ThreadMember.objects.select_related("user").filter(thread=thread, user_id=user_id, left_at__isnull=True).first()
        if target is None:
            return _bad("That person is not in this conversation.", 404)
        if target.user_id != me.pk and member.role != ThreadMember.OWNER and me.role not in ("admin", "system_admin"):
            return _bad("Only an owner or administrator can remove someone else.", 403)
        target.left_at = timezone.now()
        target.save(update_fields=["left_at"])
        verb = "left" if target.user_id == me.pk else f"was removed by {services.display_name(me)}"
        services.system_message(thread, me, f"{services.display_name(target.user)} {verb}")
        services.audit(me, "leave" if target.user_id == me.pk else "remove_member", thread=thread, patient=thread.patient, detail=f"user {target.user_id}")
        return Response({"ok": True})


# --------------------------------------------------------------------------
# attachments, badge
# --------------------------------------------------------------------------

def _image_response(data, content_type):
    response = HttpResponse(bytes(data), content_type=content_type)
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Disposition"] = "inline"
    return response


class AttachmentView(APIView):
    """GET ?size=thumb|full: a picture, only for members of its conversation and never once retracted."""

    permission_classes = PERMS

    def get(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        att = MessageAttachment.objects.select_related("message", "thread").filter(pk=pk).first()
        if att is None or _member(request.user, att.thread_id) is None or att.message.retracted_at is not None:
            return _bad("Picture not found.", 404)
        thumb = request.query_params.get("size") == "thumb"
        if not thumb:
            services.audit_once(request.user, "view_image", att.thread, patient=att.thread.patient)
        return _image_response(att.thumb if thumb else att.data, att.content_type)


class UnreadCountView(APIView):
    """GET: the badge. `latest` changes whenever any of your conversations gets a new message."""

    permission_classes = PERMS

    def get(self, request):
        if request.user.organization_id is None:
            return Response({"unread": 0, "urgent": 0, "threads": 0, "latest": 0})
        rows = list(_unread_threads(request.user).values_list("unread", "urgent_unread"))
        latest = (
            SecureMessage.objects.filter(
                thread__organization_id=request.user.organization_id,
                thread__members__user=request.user,
                thread__members__left_at__isnull=True,
            ).aggregate(m=Max("id"))["m"]
            or 0
        )
        return Response(
            {
                "unread": sum(r[0] for r in rows),
                "urgent": sum(r[1] for r in rows),
                "threads": sum(1 for r in rows if r[0]),
                "latest": latest,
            }
        )


# --------------------------------------------------------------------------
# audit
# --------------------------------------------------------------------------

class AuditListView(APIView):
    """GET ?user=&patient=&thread=&action=&since=: who did what. Never includes message text."""

    permission_classes = AUDIT_PERMS

    def get(self, request):
        if (e := _org_error(request)) is not None:
            return e
        rows = AuditEvent.objects.filter(organization_id=request.user.organization_id).select_related("user", "patient")
        qp = request.query_params
        for param, field in (("user", "user_id"), ("patient", "patient_id"), ("thread", "thread_id")):
            if qp.get(param):
                if not str(qp[param]).isdigit():
                    return _bad(f"Invalid {param}.")
                rows = rows.filter(**{field: int(qp[param])})
        if qp.get("action"):
            rows = rows.filter(action=qp["action"])
        if qp.get("since"):
            from django.utils.dateparse import parse_datetime

            since = parse_datetime(qp["since"])
            if since is None:
                return _bad("Invalid since.")
            rows = rows.filter(at__gte=since)
        return Response(
            {
                "events": [
                    {
                        "id": r.pk,
                        "at": r.at.isoformat(),
                        "user": services.display_name(r.user) if r.user_id else None,
                        "user_id": r.user_id,
                        "action": r.action,
                        "thread": r.thread_id,
                        "message": r.message_id,
                        "patient": services.patient_name(r.patient) if r.patient_id else None,
                        "patient_id": r.patient_id,
                        "detail": r.detail,
                    }
                    for r in rows[:200]
                ]
            }
        )


class AuditTranscriptView(APIView):
    """GET: the whole conversation including retracted messages, for compliance review. The read is logged."""

    permission_classes = AUDIT_PERMS

    def get(self, request, pk):
        if (e := _org_error(request)) is not None:
            return e
        thread = Thread.objects.select_related("patient").filter(pk=pk, organization_id=request.user.organization_id).first()
        if thread is None:
            return _bad("Conversation not found.", 404)
        services.audit(request.user, "audit_read_transcript", thread=thread, patient=thread.patient)
        rows = SecureMessage.objects.filter(thread=thread).select_related("sender", "reply_to__sender", "retracted_by").prefetch_related("attachments")
        everyone = list(thread.members.select_related("user"))
        data = _thread_out(thread, request.user, with_members=False)
        data["members"] = [{**services.user_ref(m.user), "joined_at": m.joined_at.isoformat(), "left_at": m.left_at.isoformat() if m.left_at else None} for m in everyone]
        return Response({"thread": data, "messages": [_message_out(m, request.user, include_retracted_text=True) for m in rows]})
