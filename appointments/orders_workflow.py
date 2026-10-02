"""
Order lifecycle rules -- the one place that decides what may happen to an
Order and in what order. Views and serializers call these functions; they
never change ``Order.status`` themselves.

    draft --sign--> active                 (physician / admin signs)
    draft --sign--> pending_cosign --cosign--> active
                                           (a nurse signs, or the orderable
                                            requires_cosign: a physician or
                                            admin who is NOT the signer cosigns)
    active --> in_progress --> completed   (manually, or by the interface)
    active --> completed
    pending_cosign / active / in_progress --> discontinued   (with a reason)

A signed order is never edited. To change one, ``replace_order`` discontinues
it and creates a new DRAFT (``replaces`` points back at the old one) -- the
same idea as addenda for signed notes.

Every transition is logged to OrderEvent with its source ("user",
"interface" or "system"), so the history of an order can always be
reconstructed and an HL7/FHIR interface can later drive the same functions
(see apply_interface_update).
"""

from django.db import transaction
from django.utils import timezone

from users.rights import user_has_right

from .models import Order, OrderEvent

OPEN_STATUSES = ("pending_cosign", "active", "in_progress")
ADMIN_ROLES = ("admin", "system_admin")
INTERFACE_STATUSES = {value for value, _ in Order.INTERFACE_STATUS_CHOICES}


class OrderWorkflowError(Exception):
    """A rule was broken. ``status_code`` is the HTTP status the API returns."""

    def __init__(self, message, status_code=400, errors=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.errors = errors or []


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def log_event(order, event_type, user=None, *, from_status="", to_status="", source="user", detail=None):
    return OrderEvent.objects.create(
        order=order,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        user=user if getattr(user, "pk", None) else None,
        source=source,
        detail=detail or {},
    )


def _lock(order):
    """Re-read the order under a row lock so two requests can't both transition it."""
    return Order.objects.select_for_update().get(pk=order.pk)


def _is_admin(user):
    return getattr(user, "role", None) in ADMIN_ROLES


def _same_org(user, organization_id):
    return getattr(user, "role", None) == "system_admin" or user.organization_id == organization_id


def orderable_available_to(orderable, user):
    """Active, and either global or belonging to the user's organization."""
    if not orderable.is_active:
        return False
    if orderable.organization_id is None:
        return True
    return _same_org(user, orderable.organization_id)


def needs_cosign(user, orderable):
    """Nurses' orders, and orderables flagged requires_cosign, wait for a cosign."""
    return bool(orderable.requires_cosign or getattr(user, "role", None) == "nurse")


def freeze_orderable(order):
    """Copy the orderable's current name/codes/detail form onto the order."""
    o = order.orderable
    order.orderable_name = o.name
    order.orderable_category = o.category
    order.code_system = o.code_system
    order.external_code = o.external_code
    template = o.detail_template
    if template is not None:
        from .serializers import NoteTemplateSerializer  # avoid a circular import

        order.detail_template = template
        order.detail_template_version = template.version
        order.detail_template_snapshot = NoteTemplateSerializer(template).data
    else:
        order.detail_template = None
        order.detail_template_version = None
        order.detail_template_snapshot = {}


def _is_empty(field, value):
    if field.get("field_type") == "checkbox":
        return value is not True
    return value is None or value == "" or value == []


def missing_required_detail(order):
    """Labels of required, currently-visible detail fields that have no answer."""
    fields = (order.detail_template_snapshot or {}).get("fields") or []
    by_key = {f.get("key"): f for f in fields}
    detail = order.detail or {}

    def visible(field, depth=0):
        parent_key = field.get("depends_on_key")
        if not parent_key:
            return True
        parent = by_key.get(parent_key)
        if parent is None or depth > 20 or not visible(parent, depth + 1):
            return False
        value = detail.get(parent_key)
        expected = field.get("depends_on_value")
        return expected in value if isinstance(value, list) else value == expected

    return [
        f.get("label") or f.get("key")
        for f in fields
        if f.get("required") and visible(f) and _is_empty(f, detail.get(f.get("key")))
    ]


def _clean_diagnosis_codes(value):
    out = []
    for item in value or []:
        if isinstance(item, str):
            item = {"code": item}
        if not isinstance(item, dict) or not str(item.get("code", "")).strip():
            raise OrderWorkflowError("Each diagnosis needs a code.")
        out.append(
            {
                "code": str(item["code"]).strip()[:20],
                "description": str(item.get("description", "")).strip()[:255],
            }
        )
    if len(out) > 20:
        raise OrderWorkflowError("At most 20 diagnoses per order.")
    return out


# --------------------------------------------------------------------------
# create / replace
# --------------------------------------------------------------------------

@transaction.atomic
def create_draft_order(
    user,
    appointment,
    orderable,
    *,
    priority=None,
    detail=None,
    indication="",
    diagnosis_codes=None,
    order_set=None,
    clinical_note=None,
    replaces=None,
):
    if not _same_org(user, appointment.organization_id):
        raise OrderWorkflowError("That visit belongs to a different organization.", 403)
    if not orderable_available_to(orderable, user):
        raise OrderWorkflowError(f"'{orderable.name}' is not available to order.")
    if clinical_note is not None and clinical_note.patient_id != appointment.patient_id:
        raise OrderWorkflowError("That note belongs to a different patient.")
    if detail is not None and not isinstance(detail, dict):
        raise OrderWorkflowError("Order detail must be an object keyed by field key.")

    order = Order(
        organization=appointment.organization,
        appointment=appointment,
        patient=appointment.patient,
        ordering_provider=user,
        orderable=orderable,
        priority=priority or orderable.default_priority,
        detail=detail or {},
        indication=(indication or "").strip(),
        diagnosis_codes=_clean_diagnosis_codes(diagnosis_codes),
        order_set=order_set,
        clinical_note=clinical_note,
        replaces=replaces,
    )
    freeze_orderable(order)
    order.save()
    log_event(
        order,
        "created",
        user,
        to_status="draft",
        detail={"order_set": order_set.code} if order_set else ({"replaces": replaces.pk} if replaces else {}),
    )
    return order


@transaction.atomic
def place_order_set(user, order_set, appointment, *, clinical_note=None, item_ids=None):
    """Create one draft order per item of the set (optionally only some of them)."""
    if not order_set.is_active:
        raise OrderWorkflowError("This order set is not active.")
    if order_set.organization_id is not None and not _same_org(user, order_set.organization_id):
        raise OrderWorkflowError("This order set is not available to your organization.", 403)
    items = list(order_set.items.select_related("orderable", "orderable__detail_template").order_by("sort_order"))
    if item_ids is not None:
        wanted = set(item_ids)
        items = [i for i in items if i.pk in wanted]
    if not items:
        raise OrderWorkflowError("There is nothing to place from this order set.")
    return [
        create_draft_order(
            user,
            appointment,
            item.orderable,
            priority=item.default_priority or None,
            detail=dict(item.default_detail or {}),
            order_set=order_set,
            clinical_note=clinical_note,
        )
        for item in items
    ]


@transaction.atomic
def update_draft_order(order, user, **changes):
    """Edit a DRAFT: priority, indication, diagnosis_codes and detail only."""
    order = _lock(order)
    if order.status != "draft":
        raise OrderWorkflowError(
            "A signed order can't be edited. Discontinue it and place a replacement instead."
        )
    if order.ordering_provider_id != user.pk and not _is_admin(user):
        raise OrderWorkflowError("Only the ordering provider can edit this draft.", 403)

    changed = []
    if "priority" in changes and changes["priority"] and changes["priority"] != order.priority:
        order.priority = changes["priority"]
        changed.append("priority")
    if "indication" in changes:
        order.indication = (changes["indication"] or "").strip()
        changed.append("indication")
    if "diagnosis_codes" in changes:
        order.diagnosis_codes = _clean_diagnosis_codes(changes["diagnosis_codes"])
        changed.append("diagnosis_codes")
    if "detail" in changes:
        if not isinstance(changes["detail"], dict):
            raise OrderWorkflowError("Order detail must be an object keyed by field key.")
        order.detail = changes["detail"]
        changed.append("detail")
    order.save()
    log_event(order, "updated", user, from_status="draft", to_status="draft", detail={"fields": changed})
    return order


# --------------------------------------------------------------------------
# sign / cosign
# --------------------------------------------------------------------------

@transaction.atomic
def sign_order(order, user):
    order = _lock(order)
    if order.status != "draft":
        raise OrderWorkflowError("Only a draft order can be signed.")
    if order.ordering_provider_id != user.pk and not _is_admin(user):
        raise OrderWorkflowError("Only the ordering provider can sign this order.", 403)
    if not orderable_available_to(order.orderable, user):
        raise OrderWorkflowError(f"'{order.orderable_name}' is no longer available to order.")

    # Take the catalog's current definition at the moment of signing, then
    # check the answers against THAT form.
    freeze_orderable(order)
    missing = missing_required_detail(order)
    if missing:
        raise OrderWorkflowError(
            f"'{order.orderable_name}' is missing required answers: {', '.join(missing)}.",
            errors=missing,
        )

    from_status = order.status
    order.cosign_required = needs_cosign(user, order.orderable)
    order.status = "pending_cosign" if order.cosign_required else "active"
    order.signed_by = user
    order.signed_at = timezone.now()
    order.save()
    log_event(order, "signed", user, from_status=from_status, to_status=order.status,
              detail={"cosign_required": order.cosign_required})
    return order


@transaction.atomic
def sign_orders(orders, user):
    """Sign several drafts together -- all or nothing."""
    signed, problems = [], []
    for order in orders:
        try:
            signed.append(sign_order(order, user))
        except OrderWorkflowError as exc:
            problems.append({"order": order.pk, "name": order.orderable_name, "detail": exc.message})
    if problems:
        raise OrderWorkflowError(
            "Nothing was signed: " + "; ".join(f"{p['name']}: {p['detail']}" for p in problems),
            errors=problems,
        )
    return signed


@transaction.atomic
def cosign_order(order, user):
    order = _lock(order)
    if order.status != "pending_cosign":
        raise OrderWorkflowError("This order is not waiting for a cosign.")
    if order.signed_by_id == user.pk:
        raise OrderWorkflowError("You can't cosign an order you signed yourself.", 403)
    order.status = "active"
    order.cosigned_by = user
    order.cosigned_at = timezone.now()
    order.save()
    log_event(order, "cosigned", user, from_status="pending_cosign", to_status="active")
    return order


# --------------------------------------------------------------------------
# progress / completion / discontinue
# --------------------------------------------------------------------------

def _finish(order, user, result_text, result_data, source, from_status):
    order.status = "completed"
    order.completed_by = user if getattr(user, "pk", None) else None
    order.completed_at = timezone.now()
    if result_text:
        order.result_text = result_text
    if result_data:
        order.result_data = result_data
    order.save()
    log_event(order, "completed", user, from_status=from_status, to_status="completed", source=source)


@transaction.atomic
def complete_order(order, user, *, result_text="", result_data=None):
    order = _lock(order)
    if order.status not in ("active", "in_progress"):
        raise OrderWorkflowError("Only an active order can be completed.")
    _finish(order, user, (result_text or "").strip(), result_data, "user", order.status)
    return order


def can_discontinue(order, user):
    return (
        order.ordering_provider_id == user.pk
        or _is_admin(user)
        or user_has_right(user, "orders.cosign")
    )


@transaction.atomic
def discontinue_order(order, user, reason, *, source="user"):
    order = _lock(order)
    reason = (reason or "").strip()
    if order.status not in OPEN_STATUSES:
        raise OrderWorkflowError("Only a signed order that is not yet completed can be discontinued.")
    if not reason:
        raise OrderWorkflowError("A reason is required to discontinue an order.")
    if source == "user" and not can_discontinue(order, user):
        raise OrderWorkflowError("Only the ordering provider, a physician or an admin can discontinue this order.", 403)
    from_status = order.status
    order.status = "discontinued"
    order.discontinued_by = user if getattr(user, "pk", None) else None
    order.discontinued_at = timezone.now()
    order.discontinue_reason = reason
    order.save()
    log_event(order, "discontinued", user, from_status=from_status, to_status="discontinued",
              source=source, detail={"reason": reason})
    return order


@transaction.atomic
def replace_order(order, user, reason):
    """Discontinue a signed order and start a draft replacement carrying its answers."""
    old = discontinue_order(order, user, reason or "Replaced")
    new = create_draft_order(
        user,
        old.appointment,
        old.orderable,
        priority=old.priority,
        detail=dict(old.detail or {}),
        indication=old.indication,
        diagnosis_codes=list(old.diagnosis_codes or []),
        order_set=old.order_set,
        clinical_note=old.clinical_note,
        replaces=old,
    )
    log_event(old, "replaced", user, to_status=old.status, detail={"new_order": new.pk})
    return old, new


# --------------------------------------------------------------------------
# interface
# --------------------------------------------------------------------------

@transaction.atomic
def apply_interface_update(
    order,
    user,
    *,
    filler_order_number=None,
    interface_status=None,
    status=None,
    result_text=None,
    result_data=None,
    message="",
):
    """
    What an HL7/FHIR interface calls (through the interface-update endpoint)
    to report back on an order it received: the filler's order number, the
    transmission state, progress ("in_progress", "completed" with results) or
    a cancellation ("discontinued"). Everything is logged with source
    "interface".
    """
    order = _lock(order)
    if order.status in ("draft", "pending_cosign"):
        raise OrderWorkflowError("The interface can only update signed, active orders.")
    if interface_status is not None and interface_status not in INTERFACE_STATUSES:
        raise OrderWorkflowError(f"Unknown interface_status '{interface_status}'.")
    if status not in (None, "in_progress", "completed", "discontinued"):
        raise OrderWorkflowError(f"The interface can't set status '{status}'.")

    changed = {}
    if filler_order_number is not None and filler_order_number != order.filler_order_number:
        order.filler_order_number = filler_order_number[:64]
        changed["filler_order_number"] = order.filler_order_number
    if interface_status is not None and interface_status != order.interface_status:
        order.interface_status = interface_status
        changed["interface_status"] = interface_status
    if message:
        order.interface_message = message
        changed["message"] = message
    order.interface_updated_at = timezone.now()

    from_status = order.status
    if status == "in_progress":
        if order.status != "active":
            raise OrderWorkflowError("Only an active order can move to in progress.")
        order.status = "in_progress"
        order.save()
        log_event(order, "in_progress", user, from_status=from_status, to_status="in_progress", source="interface")
    elif status == "completed":
        if order.status not in ("active", "in_progress"):
            raise OrderWorkflowError("Only an active order can be completed.")
        _finish(order, user, (result_text or "").strip(), result_data, "interface", from_status)
    elif status == "discontinued":
        if order.status not in OPEN_STATUSES:
            raise OrderWorkflowError("This order can no longer be cancelled.")
        order.status = "discontinued"
        order.discontinued_by = None
        order.discontinued_at = timezone.now()
        order.discontinue_reason = (message or "Cancelled by interface").strip()
        order.save()
        log_event(order, "discontinued", user, from_status=from_status, to_status="discontinued",
                  source="interface", detail={"reason": order.discontinue_reason})
    else:
        # No status change: results may still be filed on an in-progress or
        # completed order (e.g. a corrected report).
        if result_text or result_data:
            if order.status not in ("in_progress", "completed", "active"):
                raise OrderWorkflowError("Results can't be filed on this order.")
            if result_text:
                order.result_text = result_text
            if result_data:
                order.result_data = result_data
            changed["results"] = True
        order.save()

    log_event(order, "interface_update", user, from_status=from_status, to_status=order.status,
              source="interface", detail=changed)
    return order
