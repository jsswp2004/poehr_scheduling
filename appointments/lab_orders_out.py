"""
Sending lab orders to a lab: building the message (HL7 ORM^O01 or a FHIR
ServiceRequest bundle), deciding which orders are due, and recording the lab's
confirmation.

Render cannot open a connection to a lab, so this is a pull model: the lab's
interface engine asks for what is waiting (GET) and confirms each message (POST).
A message that is not confirmed is offered again.
"""

import json
import re

from django.db import transaction
from django.utils import timezone

from . import lab_hl7
from . import orders_workflow as ow
from .models import LabOutboundMessage, Order

_esc = lab_hl7._esc

# our code system -> (HL7 table 0396 name, FHIR system URI)
CODE_SYSTEMS = {
    "loinc": ("LN", "http://loinc.org"),
    "cpt": ("C4", "http://www.ama-assn.org/go/cpt"),
    "hcpcs": ("HCPCS", "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets"),
    "snomed": ("SCT", "http://snomed.info/sct"),
}
LOCAL = ("L", "urn:power:orderable")
HL7_PRIORITY = {"routine": "R", "urgent": "A", "stat": "S"}
MAX_PER_PULL = 100


def _ts(value=None):
    return (value or timezone.now()).astimezone(timezone.get_current_timezone()).strftime("%Y%m%d%H%M%S")


def _name(user):
    return (user.last_name or user.username or "", user.first_name or "")


def _provider_xcn(user):
    last, first = _name(user)
    ident = user.npi or str(user.pk)
    return f"{_esc(ident)}^{_esc(last)}^{_esc(first)}^^^^^^{'NPI' if user.npi else 'POWER'}"


def _code(order):
    system, uri = CODE_SYSTEMS.get(order.code_system, LOCAL)
    code = order.external_code or order.orderable.code
    if system == "L" or not order.external_code:
        system, uri = LOCAL
    return code, system, uri


def _profile(patient):
    return getattr(patient, "patient_profile", None)


def build_hl7(order, connection, action, control_id):
    patient = order.patient
    prof = _profile(patient)
    mrn = (prof.mrn if prof else "") or ""
    last, first = _name(patient)
    dob = prof.date_of_birth.strftime("%Y%m%d") if prof and prof.date_of_birth else ""
    sex = (prof.legal_sex if prof and prof.legal_sex else "U")
    now = _ts()
    code, system, _uri = _code(order)
    lab = connection.lab_name or connection.name
    facility = order.organization.name if order.organization else ""
    segs = [
        f"MSH|^~\\&|POWER|{_esc(facility)}|{_esc(lab)}|{_esc(lab)}|{now}||ORM^O01|{control_id}|P|2.5.1",
        f"PID|1||{_esc(mrn)}^^^POWER^MR||{_esc(last)}^{_esc(first)}||{dob}|{sex}|||{_esc(prof.address if prof else '')}||{_esc(prof.phone_number if prof else '')}",
        f"ORC|{action}|{_esc(order.placer_order_number)}|{_esc(order.filler_order_number)}|||||||||{_provider_xcn(order.ordering_provider)}|||{now}",
        f"OBR|1|{_esc(order.placer_order_number)}|{_esc(order.filler_order_number)}|{_esc(code)}^{_esc(order.orderable_name)}^{system}||||||||||||{_provider_xcn(order.ordering_provider)}",
        f"TQ1|1||||||||{HL7_PRIORITY.get(order.priority, 'R')}",
    ]
    n = 0
    for dx in order.diagnosis_codes or []:
        if isinstance(dx, dict) and dx.get("code"):
            n += 1
            segs.append(f"DG1|{n}||{_esc(dx['code'])}^{_esc(dx.get('description', ''))}^I10")
    notes = []
    if order.indication:
        notes.append(f"Indication: {order.indication}")
    for key, value in (order.detail or {}).items():
        if value not in (None, "", [], {}):
            notes.append(f"{key}: {value}")
    for i, note in enumerate(notes[:20], 1):
        segs.append(f"NTE|{i}||{_esc(note)[:500]}")
    return "\r".join(segs) + "\r"


def build_fhir(order, connection, action, control_id):
    patient = order.patient
    prof = _profile(patient)
    _sys, uri = CODE_SYSTEMS.get(order.code_system, LOCAL)
    code, system, uri = _code(order)
    provider = order.ordering_provider
    pat = {
        "resourceType": "Patient",
        "id": "patient",
        "identifier": [{"system": "urn:power:mrn", "value": (prof.mrn if prof else "") or ""}],
        "name": [{"family": patient.last_name, "given": [patient.first_name]}],
    }
    if prof and prof.date_of_birth:
        pat["birthDate"] = prof.date_of_birth.isoformat()
    if prof and prof.legal_sex:
        pat["gender"] = {"M": "male", "F": "female"}.get(prof.legal_sex, "other")
    prac = {
        "resourceType": "Practitioner",
        "id": "requester",
        "identifier": [
            {"system": "http://hl7.org/fhir/sid/us-npi", "value": provider.npi} if provider.npi
            else {"system": "urn:power:user", "value": str(provider.pk)}
        ],
        "name": [{"family": provider.last_name, "given": [provider.first_name]}],
    }
    sr = {
        "resourceType": "ServiceRequest",
        "id": "order",
        "identifier": [{"system": "urn:power:placer-order", "value": order.placer_order_number}],
        "status": "revoked" if action == "CA" else "active",
        "intent": "order",
        "priority": order.priority if order.priority in ("routine", "urgent", "stat") else "routine",
        "code": {"coding": [{"system": uri, "code": code, "display": order.orderable_name}], "text": order.orderable_name},
        "subject": {"reference": "Patient/patient"},
        "requester": {"reference": "Practitioner/requester"},
        "authoredOn": (order.signed_at or order.created_at).isoformat(),
    }
    if order.filler_order_number:
        sr["identifier"].append({"system": "urn:power:filler-order", "value": order.filler_order_number})
    dx = [d for d in (order.diagnosis_codes or []) if isinstance(d, dict) and d.get("code")]
    if dx:
        sr["reasonCode"] = [
            {"coding": [{"system": "http://hl7.org/fhir/sid/icd-10-cm", "code": d["code"], "display": d.get("description", "")}]}
            for d in dx
        ]
    if order.indication:
        sr["note"] = [{"text": order.indication}]
    return json.dumps(
        {
            "resourceType": "Bundle",
            "id": control_id,
            "type": "collection",
            "timestamp": timezone.now().isoformat(),
            "entry": [{"resource": pat}, {"resource": prac}, {"resource": sr}],
        }
    )


def order_connection(organization):
    """The single connection this clinic sends orders through, or None."""
    from .models import LabInterfaceConnection

    return LabInterfaceConnection.objects.filter(organization=organization, is_active=True, send_orders=True).first()


def _due_new_orders(connection):
    return (
        Order.objects.filter(
            organization=connection.organization,
            orderable_category="laboratory",
            status__in=("active", "in_progress"),
            interface_status="not_sent",
        )
        .exclude(lab_outbound_messages__action="NW")
        .select_related("patient", "ordering_provider", "orderable", "organization")
        .order_by("id")
    )


def refresh_queue(connection):
    """Create messages for newly signed lab orders and for cancellations of sent ones."""
    org = connection.organization
    for order in _due_new_orders(connection)[:MAX_PER_PULL]:
        msg = LabOutboundMessage.objects.create(
            organization=org, connection=connection, order=order, action="NW", control_id="tmp"
        )
        msg.control_id = f"OUT-{msg.pk:010d}"
        msg.save(update_fields=["control_id"])
        Order.objects.filter(pk=order.pk).update(interface_status="queued", interface_updated_at=timezone.now())
        ow.log_event(order, "interface_queued", None, source="interface", detail={"message": msg.control_id})

    # An order stopped before the lab ever picked it up is simply withdrawn; one the lab has been given is cancelled with the lab.
    stopped = LabOutboundMessage.objects.filter(
        connection=connection, action="NW", order__status__in=("discontinued", "completed", "draft")
    ).select_related("order")
    for msg in stopped:
        if msg.status == "pending":
            msg.status, msg.detail = "cancelled", "The order was stopped before it was sent."
            msg.save(update_fields=["status", "detail"])
        elif msg.status in ("delivered", "acknowledged") and msg.order.status == "discontinued":
            cancel, created = LabOutboundMessage.objects.get_or_create(
                order=msg.order, action="CA",
                defaults={"organization": org, "connection": connection, "control_id": "tmp"},
            )
            if created:
                cancel.control_id = f"OUT-{cancel.pk:010d}"
                cancel.save(update_fields=["control_id"])


@transaction.atomic
def pull(connection, fmt="hl7", limit=MAX_PER_PULL):
    """Everything waiting for this lab, as messages. Marks them picked up."""
    if not connection.organization.lab_interface_enabled or not connection.send_orders:
        return []
    refresh_queue(connection)
    builder = build_hl7 if fmt == "hl7" else build_fhir
    out = []
    qs = LabOutboundMessage.objects.select_for_update(of=("self",)).filter(
        connection=connection, status__in=("pending", "delivered")
    ).select_related(
        "order__patient__patient_profile", "order__ordering_provider", "order__orderable", "order__organization"
    )[: max(1, min(int(limit or MAX_PER_PULL), MAX_PER_PULL))]
    for msg in qs:
        body = builder(msg.order, connection, msg.action, msg.control_id)
        first = msg.status == "pending"
        msg.last_body, msg.status = body, "delivered"
        msg.delivery_count += 1
        msg.delivered_at = timezone.now()
        msg.save(update_fields=["last_body", "status", "delivery_count", "delivered_at"])
        if first and msg.action == "NW":
            Order.objects.filter(pk=msg.order_id).update(interface_status="sent", interface_updated_at=timezone.now())
            ow.log_event(msg.order, "interface_sent", None, source="interface", detail={"message": msg.control_id})
        out.append({"control_id": msg.control_id, "action": msg.action, "order": msg.order_id,
                    "placer_order_number": msg.order.placer_order_number, "format": fmt, "body": body})
    return out


def parse_ack(text):
    """(control_id, ok, detail) from a raw HL7 ACK."""
    for line in re.split(r"[\r\n]+", (text or "").replace("\x0b", "").replace("\x1c", "")):
        if line.startswith("MSA"):
            f = line.split("|")
            code = f[1] if len(f) > 1 else ""
            return (f[2] if len(f) > 2 else "").strip(), code in ("AA", "CA"), (f[3] if len(f) > 3 else "")
    return "", False, "No MSA segment in the acknowledgment."


@transaction.atomic
def acknowledge(connection, control_id, ok, detail=""):
    """The lab accepted or rejected a message. Returns the message, or None if unknown."""
    msg = (
        LabOutboundMessage.objects.select_for_update(of=("self",))
        .filter(connection=connection, control_id=control_id)
        .select_related("order")
        .first()
    )
    if msg is None:
        return None
    if msg.status in ("acknowledged", "rejected", "cancelled"):
        return msg  # repeated confirmation: nothing more to do
    msg.status = "acknowledged" if ok else "rejected"
    msg.detail = (detail or "")[:500]
    msg.acknowledged_at = timezone.now()
    msg.save(update_fields=["status", "detail", "acknowledged_at"])
    if msg.action == "NW":
        Order.objects.filter(pk=msg.order_id).update(
            interface_status="acknowledged" if ok else "error",
            interface_message="" if ok else (msg.detail or "Rejected by the lab.")[:500],
            interface_updated_at=timezone.now(),
        )
    ow.log_event(msg.order, "interface_acknowledged" if ok else "interface_error", None, source="interface",
                 detail={"message": msg.control_id, "action": msg.action, "detail": msg.detail})
    return msg
