"""
Staffing rules API (state standards + organization custom rules).

  GET    /api/staffing/rules/                 shared rules + this org's custom rules
  POST   /api/staffing/rules/                 create (org admin -> custom; system admin + "shared": true -> shared)
  PATCH  /api/staffing/rules/<id>/            edit  (shared: system admin only; custom: that org's admin)
  DELETE /api/staffing/rules/<id>/            deactivate (never hard-deletes; keeps the audit trail)
  POST   /api/staffing/rules/<id>/duplicate/  copy any visible rule as a custom rule for the org
  PUT    /api/staffing/rules/selection/       {"rule_id": N | null}: org picks its rule (null = use state's)
  GET    /api/staffing/rules/<id>/audit/      who changed what, when

Every change is written to StaffingRuleAudit.
"""

import datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from users.us_states import normalize_state

from . import state_rules
from .compliance_views import _org_for
from .models import OrgStaffingRule, StaffingRule, StaffingRuleAudit
from .views import ADMIN_ROLES, IsStaffingManagerOrStaffReadOnly

NUMERIC_FIELDS = ("hppd_min", "min_licensed_hppd", "min_cna_hppd")
EDITABLE = (
    "name", "state", "facility_type", "hppd_min", "min_licensed_hppd", "min_cna_hppd",
    "max_residents_per_staff", "min_rn_per_shift", "source", "notes",
    "effective_date", "last_verified_date", "needs_verification", "status",
)
STATUSES = {c[0] for c in StaffingRule.STATUS_CHOICES}


class RuleError(Exception):
    pass


def _is_system_admin(user):
    return user.role == "system_admin"


def _is_admin(user):
    return user.role in ADMIN_ROLES


def _can_edit(user, rule, org):
    if rule.organization_id is None:
        return _is_system_admin(user)
    return _is_admin(user) and org is not None and rule.organization_id == org.pk


def _serialize(rule, user, org, selected_id=None):
    d = state_rules.to_state_rule(rule).as_dict()
    d.update({
        "scope": "custom" if rule.organization_id else "shared",
        "organization_id": rule.organization_id,
        "editable": _can_edit(user, rule, org),
        "is_selected": selected_id == rule.pk,
        "is_seed": rule.is_seed,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
        "updated_by": (rule.updated_by.get_username() if rule.updated_by_id else None),
    })
    return d


def _decimal(data, field, required=False, maximum=24):
    raw = data.get(field)
    if raw in (None, ""):
        if required:
            raise RuleError(f"{field} is required.")
        return None
    try:
        value = Decimal(str(raw)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise RuleError(f"{field} must be a number.")
    if value < 0 or value > maximum:
        raise RuleError(f"{field} must be between 0 and {maximum}.")
    if field == "hppd_min" and value <= 0:
        raise RuleError("hppd_min must be greater than 0.")
    return value


def _date(data, field):
    raw = data.get(field)
    if raw in (None, ""):
        return None
    try:
        return datetime.date.fromisoformat(str(raw)[:10])
    except ValueError:
        raise RuleError(f"{field} must be a date (YYYY-MM-DD).")


def _clean(data, partial, existing=None):
    """Validate the editable fields present in `data`; returns {field: value}."""
    out = {}
    for field in EDITABLE:
        if partial and field not in data:
            continue
        if field in NUMERIC_FIELDS:
            out[field] = _decimal(data, field, required=(field == "hppd_min"))
        elif field in ("max_residents_per_staff", "min_rn_per_shift"):
            raw = data.get(field)
            if raw in (None, ""):
                out[field] = None if field == "max_residents_per_staff" else 0
            else:
                try:
                    n = int(raw)
                except (TypeError, ValueError):
                    raise RuleError(f"{field} must be a whole number.")
                if n < 0 or n > 100:
                    raise RuleError(f"{field} must be between 0 and 100.")
                out[field] = n
        elif field == "state":
            raw = (data.get("state") or "").strip()
            code = normalize_state(raw) if raw else ""
            if raw and not code:
                raise RuleError(f"'{raw}' is not a valid US state.")
            out[field] = code
        elif field in ("effective_date", "last_verified_date"):
            out[field] = _date(data, field)
        elif field == "needs_verification":
            out[field] = bool(data.get(field))
        elif field == "status":
            if data.get("status") in (None, "") and not partial:
                out[field] = StaffingRule.STATUS_ACTIVE
            elif data.get("status") not in STATUSES:
                raise RuleError("status must be active, draft or inactive.")
            else:
                out[field] = data.get("status")
        elif field == "name":
            name = (data.get("name") or "").strip()
            if not name:
                raise RuleError("name is required.")
            out[field] = name[:120]
        else:
            out[field] = (data.get(field) or "").strip() if isinstance(data.get(field), str) or data.get(field) is None else str(data.get(field))
    return out


def _jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    return v


def _audit(rule, action, user, org, changes=None):
    StaffingRuleAudit.objects.create(
        rule=rule, rule_name=rule.name if rule else "", organization=org,
        action=action, changes=changes or {}, changed_by=user,
    )


def _visible_rules(user, org):
    q = Q(organization__isnull=True)
    if org is not None:
        q |= Q(organization=org)
    qs = StaffingRule.objects.filter(q).select_related("updated_by")
    if not _is_system_admin(user):
        # Non-system admins don't see other people's draft/inactive shared rules.
        qs = qs.exclude(organization__isnull=True, status__in=[StaffingRule.STATUS_DRAFT, StaffingRule.STATUS_INACTIVE])
        if not _is_admin(user):
            qs = qs.filter(status=StaffingRule.STATUS_ACTIVE)
    return qs


class RulesListCreateView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def get(self, request):
        org = _org_for(request)
        choice = OrgStaffingRule.objects.filter(organization=org).first() if org else None
        selected_id = choice.rule_id if choice else None
        effective = state_rules.resolve_rule_for_org(org) if org else None
        rules = [_serialize(r, request.user, org, selected_id) for r in _visible_rules(request.user, org)]
        return Response({
            "rules": rules,
            "selected_rule_id": selected_id,
            "effective_rule_id": effective.rule.rule_id if effective and effective.rule else None,
            "can_edit_shared": _is_system_admin(request.user),
            "can_edit_custom": _is_admin(request.user),
        })

    def post(self, request):
        user = request.user
        if not _is_admin(user):
            return Response({"error": "Only admins can add staffing rules."}, status=403)
        org = _org_for(request)
        shared = bool(request.data.get("shared"))
        if shared and not _is_system_admin(user):
            return Response({"error": "Only system admins can add shared state rules."}, status=403)
        if not shared and org is None:
            return Response({"error": "No organization for this user."}, status=400)
        try:
            values = _clean(request.data, partial=False)
        except RuleError as e:
            return Response({"error": str(e)}, status=400)
        if shared and not values.get("state"):
            return Response({"error": "A shared rule needs a state."}, status=400)
        values.setdefault("status", StaffingRule.STATUS_ACTIVE)
        with transaction.atomic():
            rule = StaffingRule.objects.create(
                organization=None if shared else org, created_by=user, updated_by=user, **values
            )
            _audit(rule, "created", user, org, {k: _jsonable(v) for k, v in values.items()})
        return Response(_serialize(rule, user, org), status=201)


def _get_rule(request, pk):
    org = _org_for(request)
    rule = _visible_rules(request.user, org).filter(pk=pk).first()
    return rule, org


class RuleDetailView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def get(self, request, pk):
        rule, org = _get_rule(request, pk)
        if rule is None:
            return Response({"error": "Rule not found."}, status=404)
        return Response(_serialize(rule, request.user, org))

    def patch(self, request, pk):
        rule, org = _get_rule(request, pk)
        if rule is None:
            return Response({"error": "Rule not found."}, status=404)
        if not _can_edit(request.user, rule, org):
            who = "system admins" if rule.organization_id is None else "admins of this organization"
            return Response({"error": f"Only {who} can edit this rule."}, status=403)
        try:
            values = _clean(request.data, partial=True)
        except RuleError as e:
            return Response({"error": str(e)}, status=400)
        if rule.organization_id is None and values.get("state") == "":
            return Response({"error": "A shared rule needs a state."}, status=400)

        today = datetime.date.today()
        # Clearing the "verify" flag stamps the verification date.
        marking_verified = (
            rule.needs_verification and values.get("needs_verification") is False
        )
        if marking_verified and "last_verified_date" not in values:
            values["last_verified_date"] = today

        changes = {}
        for k, new in values.items():
            old = getattr(rule, k)
            if old != new:
                changes[k] = [_jsonable(old), _jsonable(new)]
        if not changes:
            return Response(_serialize(rule, request.user, org))
        with transaction.atomic():
            for k, new in values.items():
                setattr(rule, k, new)
            rule.updated_by = request.user
            rule.save()
            action = "verified" if marking_verified and set(changes) <= {"needs_verification", "last_verified_date"} else "updated"
            _audit(rule, action, request.user, org, changes)
        return Response(_serialize(rule, request.user, org))

    def delete(self, request, pk):
        rule, org = _get_rule(request, pk)
        if rule is None:
            return Response({"error": "Rule not found."}, status=404)
        if not _can_edit(request.user, rule, org):
            who = "system admins" if rule.organization_id is None else "admins of this organization"
            return Response({"error": f"Only {who} can deactivate this rule."}, status=403)
        if rule.status == StaffingRule.STATUS_INACTIVE:
            return Response(_serialize(rule, request.user, org))
        with transaction.atomic():
            rule.status = StaffingRule.STATUS_INACTIVE
            rule.updated_by = request.user
            rule.save()
            _audit(rule, "deactivated", request.user, org, {"status": ["active", "inactive"]})
        return Response(_serialize(rule, request.user, org))


class RuleDuplicateView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def post(self, request, pk):
        user = request.user
        if not _is_admin(user):
            return Response({"error": "Only admins can duplicate staffing rules."}, status=403)
        rule, org = _get_rule(request, pk)
        if rule is None:
            return Response({"error": "Rule not found."}, status=404)
        if org is None:
            return Response({"error": "No organization for this user."}, status=400)
        name = (request.data.get("name") or "").strip() or f"{rule.name} (custom)"
        with transaction.atomic():
            copy = StaffingRule.objects.create(
                organization=org, state="", name=name[:120], facility_type=rule.facility_type,
                hppd_min=rule.hppd_min, min_licensed_hppd=rule.min_licensed_hppd,
                min_cna_hppd=rule.min_cna_hppd, max_residents_per_staff=rule.max_residents_per_staff,
                min_rn_per_shift=rule.min_rn_per_shift,
                source=f"Custom copy of {rule.name}" + (f" -- {rule.source}" if rule.source else ""),
                notes=rule.notes, status=StaffingRule.STATUS_ACTIVE,
                created_by=user, updated_by=user,
            )
            _audit(copy, "duplicated", user, org, {"from_rule_id": rule.pk, "from_rule_name": rule.name})
        return Response(_serialize(copy, user, org), status=201)


class RuleSelectionView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def put(self, request):
        user = request.user
        if not _is_admin(user):
            return Response({"error": "Only admins can choose the organization's rule."}, status=403)
        org = _org_for(request)
        if org is None:
            return Response({"error": "No organization for this user."}, status=400)
        raw = request.data.get("rule_id")
        existing = OrgStaffingRule.objects.filter(organization=org).first()
        old_id = existing.rule_id if existing else None

        if raw in (None, ""):
            with transaction.atomic():
                if existing:
                    existing.delete()
                    _audit(None, "selected", user, org, {"rule_id": [old_id, None], "note": "Back to the state's rule"})
            return Response({"selected_rule_id": None})

        try:
            rule_id = int(raw)
        except (TypeError, ValueError):
            return Response({"error": "rule_id must be a number or null."}, status=400)
        rule = StaffingRule.objects.filter(
            Q(organization__isnull=True) | Q(organization=org), pk=rule_id,
            status=StaffingRule.STATUS_ACTIVE,
        ).first()
        if rule is None:
            return Response({"error": "That rule is not available to this organization."}, status=400)
        with transaction.atomic():
            OrgStaffingRule.objects.update_or_create(
                organization=org, defaults={"rule": rule, "updated_by": user}
            )
            _audit(rule, "selected", user, org, {"rule_id": [old_id, rule.pk]})
        return Response({"selected_rule_id": rule.pk})


class RuleAuditView(APIView):
    permission_classes = [IsStaffingManagerOrStaffReadOnly]

    def get(self, request, pk):
        if not _is_admin(request.user):
            return Response({"error": "Only admins can view the rule history."}, status=403)
        rule, org = _get_rule(request, pk)
        if rule is None:
            return Response({"error": "Rule not found."}, status=404)
        entries = StaffingRuleAudit.objects.filter(rule=rule).select_related("changed_by")[:100]
        return Response([
            {
                "id": e.id,
                "action": e.action,
                "changes": e.changes,
                "changed_by": e.changed_by.get_username() if e.changed_by_id else None,
                "changed_at": e.changed_at.isoformat(),
            }
            for e in entries
        ])
