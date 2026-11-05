"""API for the staff Inbox (see inbox.py)."""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import inbox


class IsStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, "role", None) in inbox.STAFF_ROLES)


def _fail(exc):
    return Response({"detail": str(exc)}, status=exc.status)


def _out(item):
    """JSON-ready copy of a list item (drops the helper fields)."""
    skip = {"patient_id", "received", "done_at"}
    row = {k: v for k, v in item.items() if k not in skip}
    for key in ("at", "due_at"):
        if row.get(key) is not None:
            row[key] = row[key].isoformat()
    return row


class _Base(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaff]


class InboxListView(_Base):
    def get(self, request):
        q = request.query_params
        folder = q.get("folder", "all")
        patient = q.get("patient") if str(q.get("patient", "")).isdigit() else None
        items = inbox.build(
            request.user, folder, unread=q.get("unread") in ("1", "true"), patient=patient,
            q=(q.get("q") or "").strip(), care=q.get("care") or None,
        )
        return Response({"folder": folder, "items": [_out(i) for i in items], "counts": inbox.counts(request.user)})


class InboxCountsView(_Base):
    def get(self, request):
        return Response(inbox.counts(request.user))


class InboxPeopleView(_Base):
    def get(self, request):
        return Response(inbox.people_for(request.user))


class InboxItemView(_Base):
    def get(self, request):
        try:
            return Response(_serialise(inbox.detail(request.user, request.query_params.get("key", ""))))
        except inbox.InboxError as exc:
            return _fail(exc)
        except (ValueError, IndexError):
            return Response({"detail": "That item was not found."}, status=status.HTTP_404_NOT_FOUND)


def _serialise(value):
    if isinstance(value, dict):
        return {k: _serialise(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_serialise(v) for v in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


class InboxReadView(_Base):
    def post(self, request):
        try:
            inbox.mark_read(request.user, request.data.get("key", ""), request.data.get("read", True) not in (False, "false", 0))
        except inbox.InboxError as exc:
            return _fail(exc)
        except (ValueError, IndexError):
            return Response({"detail": "That item was not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"ok": True, "counts": inbox.counts(request.user)})


class InboxDoneView(_Base):
    def post(self, request):
        try:
            inbox.set_done(request.user, request.data.get("key", ""), request.data.get("done", True) not in (False, "false", 0))
        except inbox.InboxError as exc:
            return _fail(exc)
        except (ValueError, IndexError):
            return Response({"detail": "That item was not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"ok": True, "counts": inbox.counts(request.user)})


class InboxMessagesView(_Base):
    def post(self, request):
        d = request.data
        try:
            thread = inbox.send_message(request.user, d.get("to"), d.get("subject"), d.get("body"), d.get("patient") or None)
        except inbox.InboxError as exc:
            return _fail(exc)
        return Response({"key": f"msg:{thread.pk}"}, status=status.HTTP_201_CREATED)


class InboxReplyView(_Base):
    def post(self, request, pk):
        try:
            thread = inbox.reply(request.user, pk, request.data.get("body"))
        except inbox.InboxError as exc:
            return _fail(exc)
        return Response({"key": f"msg:{thread.pk}"})


class InboxForwardView(_Base):
    def post(self, request, pk):
        try:
            thread = inbox.forward(request.user, pk, request.data.get("to"), request.data.get("note", ""))
        except inbox.InboxError as exc:
            return _fail(exc)
        return Response({"key": f"msg:{thread.pk}"}, status=status.HTTP_201_CREATED)
