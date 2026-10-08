"""Task Manager API: the nurse worklist built from signed orders, its actions, and the clinic's task rules."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Registration

from . import order_tasks as ot
from .models import Order, OrderTask, TaskSettings
from .patient_header import _target_org

PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

QUEUES = [
    ("needs_action", "Due now and overdue"),
    ("overdue", "Overdue"),
    ("upcoming", "Upcoming"),
    ("missed", "Missed"),
    ("completed", "Done (last 24 h)"),
    ("all", "All"),
]


def _name(user):
    if user is None:
        return ""
    return (f"{user.first_name} {user.last_name}".strip()) or user.username


def _iso(value):
    return value.isoformat() if value else None


def _need_view(request):
    if request.user.role not in ot.VIEW_ROLES:
        return Response({"detail": "Not allowed."}, status=403)
    return None


def _scope(request):
    org = _target_org(request, request.query_params.get("org"))
    qs = OrderTask.objects.select_related("patient", "performed_by", "order")
    if org is not None:
        return qs.filter(organization=org), org
    if request.user.role == "system_admin":
        return qs, None
    return qs.none(), None


def queue_q(key, now, cfg):
    grace = timedelta(minutes=cfg["grace_minutes"])
    soon = now + timedelta(minutes=ot.DUE_SOON_MINUTES)
    if key == "needs_action":
        return Q(status="pending", due_at__lte=soon)
    if key == "overdue":
        return Q(status="pending", due_at__lt=now - grace)
    if key == "upcoming":
        return Q(status="pending", due_at__gt=soon)
    if key == "missed":
        return Q(status="missed")
    if key == "completed":
        return Q(status__in=("done", "held", "refused"), performed_at__gte=now - timedelta(hours=24))
    return Q()


def _locations(patient_ids):
    """Current unit / room / bed for each patient who is in a bed."""
    out = {}
    regs = (
        Registration.objects.filter(patient_id__in=patient_ids, discharge_datetime__isnull=True)
        .select_related("unit", "room", "bed", "assigned_nurse")
        .order_by("patient_id", "-id")
    )
    for reg in regs:
        if reg.patient_id in out:
            continue
        out[reg.patient_id] = {
            "unit_name": reg.unit.name if reg.unit_id else "",
            "room_name": reg.room.name if reg.room_id else "",
            "bed_name": reg.bed.name if reg.bed_id else "",
            "assigned_nurse_name": _name(reg.assigned_nurse) if reg.assigned_nurse_id else "",
        }
    return out


def serialize(task, user, cfg, now, loc=None, detail=False):
    late_minutes = 0
    if task.status in ("pending", "missed") and task.due_at < now:
        late_minutes = int((now - task.due_at).total_seconds() // 60)
    data = {
        "id": task.pk,
        "order": task.order_id,
        "order_status": task.order.status,
        "patient": task.patient_id,
        "patient_name": _name(task.patient),
        "title": task.title,
        "task_type": task.task_type,
        "dose": task.dose,
        "route": task.route,
        "instructions": task.instructions,
        "frequency": task.frequency,
        "frequency_label": ot.FREQUENCY_LABELS.get(task.frequency, task.frequency),
        "due_at": _iso(task.due_at),
        "is_prn": task.is_prn,
        "status": task.status,
        "status_label": task.get_status_display(),
        "overdue": ot.is_overdue(task, now, cfg["grace_minutes"]),
        "minutes_late": late_minutes,
        "performed_by_name": _name(task.performed_by),
        "performed_at": _iso(task.performed_at),
        "reason": task.reason,
        "note": task.note,
        "detail": task.detail or {},
        "actions": ot.allowed_actions(user, task),
        **(loc or {}),
    }
    if detail:
        data["events"] = [
            {"id": e.pk, "type": e.event_type, "user": _name(e.user), "detail": e.detail, "at": _iso(e.created_at)}
            for e in task.events.select_related("user")
        ]
    return data


class TaskListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_view(request)
        if denied:
            return denied
        qs, org = _scope(request)
        p = request.query_params
        now = timezone.now()
        patient_id = p.get("patient")
        ot.ensure_tasks(org, patient_id=patient_id, now=now)
        ot.mark_missed(org, now=now)
        cfg = ot.settings_for(org)

        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if p.get("task_type"):
            qs = qs.filter(task_type=p["task_type"])
        if p.get("status") in dict(OrderTask.STATUS_CHOICES):
            qs = qs.filter(status=p["status"])
        if p.get("assigned") == "me":
            mine = Registration.objects.filter(assigned_nurse=request.user, discharge_datetime__isnull=True).values("patient_id")
            qs = qs.filter(patient_id__in=mine)
        if p.get("q"):
            term = p["q"].strip()
            qs = qs.filter(Q(patient__first_name__icontains=term) | Q(patient__last_name__icontains=term) | Q(title__icontains=term))
        queue = p.get("queue") or "needs_action"
        qs = qs.filter(queue_q(queue, now, cfg))
        qs = qs.order_by("-performed_at", "-id") if queue == "completed" else qs.order_by("due_at", "id")

        try:
            size = max(1, min(int(p.get("page_size", PAGE_SIZE)), MAX_PAGE_SIZE))
            page = max(1, int(p.get("page", 1)))
        except (TypeError, ValueError):
            size, page = PAGE_SIZE, 1
        count = qs.count()
        rows = list(qs[(page - 1) * size: page * size])
        locs = _locations({r.patient_id for r in rows})
        return Response(
            {
                "count": count,
                "page": page,
                "page_size": size,
                "results": [serialize(r, request.user, cfg, now, locs.get(r.patient_id)) for r in rows],
            }
        )


class TaskQueuesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_view(request)
        if denied:
            return denied
        qs, org = _scope(request)
        now = timezone.now()
        patient_id = request.query_params.get("patient")
        ot.ensure_tasks(org, patient_id=patient_id, now=now)
        ot.mark_missed(org, now=now)
        cfg = ot.settings_for(org)
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        return Response({"counts": {key: qs.filter(queue_q(key, now, cfg)).count() for key, _label in QUEUES}})


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        denied = _need_view(request)
        if denied:
            return denied
        qs, org = _scope(request)
        task = qs.filter(pk=pk).first()
        if task is None:
            return Response({"detail": "Task not found."}, status=404)
        now = timezone.now()
        return Response(serialize(task, request.user, ot.settings_for(org), now, _locations({task.patient_id}).get(task.patient_id), detail=True))


class TaskActionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        denied = _need_view(request)
        if denied:
            return denied
        qs, org = _scope(request)
        task = qs.filter(pk=pk).first()
        if task is None:
            return Response({"detail": "Task not found."}, status=404)
        try:
            ot.apply_action(task, request.user, request.data.get("action"), request.data)
        except ot.TaskError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        task = qs.get(pk=pk)
        return Response(serialize(task, request.user, ot.settings_for(org), timezone.now(), _locations({task.patient_id}).get(task.patient_id), detail=True))


class PrnOrdersView(APIView):
    """A patient's active as-needed orders, with when each was last given."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_view(request)
        if denied:
            return denied
        patient_id = request.query_params.get("patient")
        if not patient_id:
            return Response({"detail": "Give a patient."}, status=400)
        org = _target_org(request, request.query_params.get("org"))
        orders = Order.objects.filter(patient_id=patient_id, status__in=("active", "in_progress"), schedule__frequency="prn")
        if org is not None:
            orders = orders.filter(organization=org)
        elif request.user.role != "system_admin":
            orders = orders.none()
        out = []
        for order in orders:
            sched = order.schedule or {}
            last = OrderTask.objects.filter(order=order, is_prn=True, status="done").order_by("-performed_at").first()
            out.append(
                {
                    "order": order.pk,
                    "title": order.orderable_name,
                    "dose": sched.get("dose", ""),
                    "route": sched.get("route", ""),
                    "prn_reason": sched.get("prn_reason", ""),
                    "min_interval_hours": sched.get("min_interval_hours"),
                    "instructions": sched.get("instructions", ""),
                    "last_given_at": _iso(last.performed_at) if last else None,
                }
            )
        return Response(out)


class PrnGiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        denied = _need_view(request)
        if denied:
            return denied
        org = _target_org(request, request.query_params.get("org"))
        orders = Order.objects.all()
        if org is not None:
            orders = orders.filter(organization=org)
        elif request.user.role != "system_admin":
            orders = orders.none()
        order = orders.filter(pk=request.data.get("order")).first()
        if order is None:
            return Response({"detail": "Order not found."}, status=404)
        try:
            task = ot.give_prn(order, request.user, request.data)
        except ot.TaskError as exc:
            return Response({"detail": exc.message}, status=exc.status_code)
        task = OrderTask.objects.select_related("patient", "performed_by", "order").get(pk=task.pk)
        return Response(serialize(task, request.user, ot.settings_for(order.organization), timezone.now()), status=201)


class TaskMetaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        denied = _need_view(request)
        if denied:
            return denied
        org = _target_org(request)
        cfg = ot.settings_for(org)
        return Response(
            {
                "frequencies": [
                    {"value": k, "label": v[0], "kind": v[1], "times": cfg["pass_times"].get(k) if v[1] == "clock" else None, "hours": v[2] if v[1] == "interval" else None}
                    for k, v in ot.FREQUENCIES.items()
                ],
                "routes": ot.ROUTES,
                "queues": [{"value": v, "label": l} for v, l in QUEUES],
                "can_perform": request.user.role in ot.PERFORM_ROLES,
                "can_manage": request.user.role in ot.ADMIN_ROLES,
                "grace_minutes": cfg["grace_minutes"],
            }
        )


class TaskSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @staticmethod
    def _json(org, can_edit):
        cfg = ot.settings_for(org)
        return {"organization": org.pk, **cfg, "can_edit": can_edit}

    def get(self, request):
        denied = _need_view(request)
        if denied:
            return denied
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic (?org=ID)."}, status=400)
        return Response(self._json(org, request.user.role in ot.ADMIN_ROLES))

    def put(self, request):
        if request.user.role not in ot.ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change the task rules."}, status=403)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        cfg = ot.settings_for(org)
        values = {}
        for key, low, high, label in (
            ("grace_minutes", 0, 720, "The time window"),
            ("missed_after_hours", 1, 168, "The hours before a task counts as missed"),
            ("look_ahead_hours", 12, 72, "The look-ahead hours"),
        ):
            if key in request.data:
                value = request.data[key]
                if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
                    return Response({"detail": f"{label} must be a whole number from {low} to {high}."}, status=400)
                values[key] = value
        if "pass_times" in request.data:
            try:
                merged = {**{k: v for k, v in cfg["pass_times"].items()}, **ot.clean_pass_times(request.data["pass_times"])}
            except ot.TaskError as exc:
                return Response({"detail": exc.message}, status=400)
            values["pass_times"] = merged
        TaskSettings.objects.update_or_create(organization=org, defaults={**values, "updated_by": request.user})
        return Response(self._json(org, True))
