"""
Organization access: the plan (user limit), status and modules of an organization.

Everyone may read the module catalog (the sign-up page needs it). A system administrator reads and edits
any organization; an organization administrator reads their own, read-only. Every change is logged and the
Stripe subscription is brought in line (from the next bill).
"""
from rest_framework import status as http
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Organization, OrganizationAccessChange
from .module_billing import sync_module_billing
from .modules import (
    EXTRA_MODULE_PRICE, MODULE_CODES, MODULE_LABELS, PLAN_BASE_PRICE, PLAN_INCLUDED_MODULES, PLAN_LABELS,
    PLAN_USER_LIMITS, QUOTED_PLANS, catalog, enabled_codes, extra_module_count, monthly_total, normalize_codes,
    plan_key, priced_modules,
)

STATUSES = [s for s, _ in Organization._meta.get_field("subscription_status").choices]


def pricing_summary(codes, plan="basic"):
    key = plan_key(plan)
    priced = priced_modules(codes)
    return {
        "plan": key,
        "base": PLAN_BASE_PRICE[key],
        "included_count": PLAN_INCLUDED_MODULES[key],
        "per_extra_module": EXTRA_MODULE_PRICE,
        "extra_count": extra_module_count(codes, key),
        "monthly_total": monthly_total(codes, key),
        "quoted": key in QUOTED_PLANS,
        "included_module": priced[0] if priced else None,
        "included_modules": priced[:PLAN_INCLUDED_MODULES[key]],
    }


def messaging_terms():
    """Text and email rates and the free monthly amounts per plan (the same numbers the usage billing uses)."""
    from .messaging_billing import MESSAGING_ALLOWANCES, MESSAGING_OVERAGE_RATES

    return {"rates": dict(MESSAGING_OVERAGE_RATES), "allowances": {k: dict(v) for k, v in MESSAGING_ALLOWANCES.items()}}


def assistant_terms_payload():
    """Free AI assistant questions per plan and the price of each question past that."""
    from .assistant_billing import assistant_terms

    return assistant_terms()


def plan_pricing():
    """Per-plan price, included services and user limit, for the pricing and sign-up pages."""
    return {
        k: {
            "label": PLAN_LABELS[k],
            "user_limit": PLAN_USER_LIMITS[k],
            "base": PLAN_BASE_PRICE[k],
            "included_count": PLAN_INCLUDED_MODULES[k],
            "quoted": k in QUOTED_PLANS,
        }
        for k in PLAN_USER_LIMITS
    }


def appointments_this_month(org):
    """Appointments dated in the current calendar month. Text messages are not counted anywhere yet."""
    from django.utils import timezone

    from appointments.models import Appointment

    now = timezone.now()
    try:
        return Appointment.objects.filter(
            organization=org, appointment_datetime__year=now.year, appointment_datetime__month=now.month
        ).count()
    except Exception:
        return None


def plans_payload():
    return [{"key": k, "label": PLAN_LABELS[k], "user_limit": PLAN_USER_LIMITS[k]} for k in PLAN_USER_LIMITS]


@api_view(["GET"])
@permission_classes([AllowAny])
def module_catalog(request):
    """Plans and modules with their prices, for the sign-up page."""
    return Response({
        "plans": plans_payload(), "modules": catalog(),
        "pricing": {**pricing_summary([]), "plans": plan_pricing(), "messaging": messaging_terms(), "assistants": assistant_terms_payload()},
    })


def _target_org(request):
    user = request.user
    if user.role == "system_admin":
        org_id = request.query_params.get("organization") or request.data.get("organization")
        if org_id:
            return Organization.objects.filter(pk=org_id).first()
    return user.organization


def _assistant_usage(org):
    from .assistant_billing import compute_assistant_usage

    u = compute_assistant_usage(org)
    return {k: u[k] for k in ("questions", "included", "billable", "rate", "cost", "by_assistant")}


def _payload(org, can_edit, billing_note=None):
    codes = enabled_codes(org)
    on = set(codes)
    changes = [
        {"summary": c.summary, "by": (c.changed_by.get_full_name() or c.changed_by.username) if c.changed_by else "",
         "at": c.created_at}
        for c in org.access_changes.select_related("changed_by")[:15]
    ]
    data = {
        "organization": {"id": org.id, "name": org.name},
        "can_edit": can_edit,
        "plan": {"key": plan_key(org.subscription_tier), "label": PLAN_LABELS[plan_key(org.subscription_tier)]},
        "plans": plans_payload(),
        "status": org.subscription_status,
        "statuses": STATUSES,
        "trial_end_date": org.trial_end_date,
        "user_limit": org.max_users,
        "user_count": org.current_user_count,
        "usage": {"appointments_this_month": appointments_this_month(org), "assistant": _assistant_usage(org)},
        "configured": org.enabled_modules is not None,
        "modules": [{**m, "enabled": m["code"] in on} for m in catalog()],
        "enabled_order": codes,
        "pricing": {**pricing_summary(codes, org.subscription_tier), "plans": plan_pricing()},
        "history": changes,
    }
    if billing_note is not None:
        data["billing_note"] = billing_note
    return data


def _record(org, user, summary):
    OrganizationAccessChange.objects.create(organization=org, changed_by=user, summary=summary[:300])


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def organization_access(request):
    user = request.user
    if user.role not in ("admin", "system_admin"):
        return Response({"detail": "Only an administrator can open Organization access."}, status=403)
    org = _target_org(request)
    if org is None:
        return Response({"detail": "Choose an organization."}, status=404)
    if request.method == "GET":
        return Response(_payload(org, can_edit=user.role == "system_admin"))

    if user.role != "system_admin":
        return Response({"detail": "Only a system administrator can change plans, limits and modules."}, status=403)

    data = request.data
    changed = False
    modules_changed = False

    if "plan" in data:
        new_plan = data["plan"]
        if new_plan not in PLAN_USER_LIMITS:
            return Response({"plan": ["Choose Professional, Clinic or Group."]}, status=400)
        old_plan = plan_key(org.subscription_tier)
        if new_plan != old_plan:
            org.subscription_tier = new_plan
            org.max_users = PLAN_USER_LIMITS[new_plan]  # an explicit user_limit below can still override
            _record(org, user, f"Plan changed from {PLAN_LABELS[old_plan]} to {PLAN_LABELS[new_plan]} (user limit {org.max_users})")
            changed = True

    if "status" in data and data["status"] != org.subscription_status:
        if data["status"] not in STATUSES:
            return Response({"status": ["Not a valid status."]}, status=400)
        _record(org, user, f"Status changed from {org.subscription_status} to {data['status']}")
        org.subscription_status = data["status"]
        changed = True

    if "user_limit" in data:
        try:
            limit = int(data["user_limit"])
        except (TypeError, ValueError):
            return Response({"user_limit": ["Enter a whole number."]}, status=400)
        if limit < 1:
            return Response({"user_limit": ["The limit must be at least 1."]}, status=400)
        if limit < org.current_user_count:
            return Response(
                {"user_limit": [f"{org.current_user_count} people already use this organization. Remove some first, or choose a higher limit."]},
                status=400,
            )
        if limit != org.max_users:
            _record(org, user, f"User limit changed from {org.max_users} to {limit}")
            org.max_users = limit
            changed = True

    if "modules" in data:
        wanted = data["modules"]
        if not isinstance(wanted, list) or any(c not in MODULE_CODES for c in wanted):
            return Response({"modules": ["Unknown module."]}, status=400)
        ordered = list(dict.fromkeys(wanted))
        before = enabled_codes(org)
        if org.enabled_modules is None or ordered != before:
            if org.enabled_modules is None:
                _record(org, user, "Modules set for the first time: " + (", ".join(MODULE_LABELS[c] for c in ordered) or "none"))
            for c in ordered:
                if c not in before:
                    _record(org, user, f"{MODULE_LABELS[c]} turned on")
            for c in before:
                if c not in ordered and org.enabled_modules is not None:
                    _record(org, user, f"{MODULE_LABELS[c]} turned off")
            org.enabled_modules = ordered
            # Existing switches elsewhere in the app follow the module, so there is one source of truth.
            org.dictation_enabled = "dictation" in ordered
            org.lab_interface_enabled = "lab_interface" in ordered
            changed = True
            modules_changed = True

    note = None
    if changed:
        org.save()
        if modules_changed:
            _, note = sync_module_billing(org)
    return Response(_payload(org, can_edit=True, billing_note=note), status=http.HTTP_200_OK)
