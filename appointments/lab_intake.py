"""
Receiving lab results electronically: who sent it, which patient it is for, and
filing it as a LabReport.

    process_message(connection, fmt, raw)  ->  Outcome

Safety rules (a wrong match puts one patient's result in another's chart, so
when in doubt the result is kept for a person instead of filed):

  * The connection must be active AND its organization must have the lab
    interface add-on switched on.
  * A patient is matched by our order number (placer number), by MRN, or
    -- only when the lab sent no usable order or MRN -- by last name, first name
    and date of birth with exactly one match. If an order number and an MRN
    point at different patients, or the date of birth in the message disagrees
    with the chart, nothing is filed.
  * Unmatched results are stored and show up for staff (status "unmatched"); the
    sender still gets an acknowledgment so it does not resend forever.
  * The same message (control id) is never processed twice.
  * A later message for the same lab accession updates the report instead of
    creating a second one; a changed result puts a reviewed report back to
    unreviewed (see lab_results.update_report).
"""

import hashlib
import json
from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from . import lab_fhir, lab_hl7, lab_results
from . import orders_workflow as ow
from .models import LabInboundMessage, LabReport, LabReportEvent, LabResultItem, Order

MAX_ITEMS_PER_REPORT = lab_results.MAX_ITEMS


@dataclass
class Outcome:
    http_status: int = 200
    ack: str = "AA"  # HL7 acknowledgment code: AA accepted, AE retry later, AR rejected
    text: str = ""
    control_id: str = ""
    sending_app: str = ""
    sending_facility: str = ""
    message_status: str = ""
    report_ids: list = field(default_factory=list)
    duplicate: bool = False


def hash_key(key):
    return hashlib.sha256(str(key).encode()).hexdigest()


# --------------------------------------------------------------------------
# matching
# --------------------------------------------------------------------------

def _hint(patient):
    if not patient:
        return ""
    name = ", ".join(x for x in (patient.get("last"), patient.get("first")) if x)
    bits = [name, f"DOB {patient['dob'].isoformat()}" if patient.get("dob") else "", f"ID {', '.join(patient['ids'])}" if patient.get("ids") else ""]
    return " | ".join(b for b in bits if b)[:255]


def _profile(user):
    return getattr(user, "patient_profile", None)


def _norm_name(name):
    """Last name for comparison: case, spaces, hyphens and punctuation do not count."""
    return "".join(ch for ch in str(name or "").lower() if ch.isalnum())


def match_patient(organization, patient_info, placer_numbers):
    """
    (patient_user, order, reason). patient_user is None when it should not be
    filed automatically; `reason` then says why (shown to staff).
    """
    User = get_user_model()
    from users.models import Patient

    order = None
    order_patient = None
    for number in placer_numbers:
        if not number:
            continue
        found = Order.objects.filter(organization=organization, placer_order_number=number).select_related("patient").first()
        if found is not None:
            order, order_patient = found, found.patient
            break

    mrn_patient = None
    mrn_matches = set()
    for ident in patient_info.get("ids") or []:
        for profile in Patient.objects.filter(organization=organization, mrn__iexact=ident).select_related("user"):
            mrn_matches.add(profile.user_id)
    if len(mrn_matches) > 1:
        return None, order, "More than one patient has that MRN."
    if mrn_matches:
        mrn_patient = User.objects.get(pk=next(iter(mrn_matches)))

    if order_patient and mrn_patient and order_patient.pk != mrn_patient.pk:
        return None, order, "The order number and the MRN point to different patients."

    patient = order_patient or mrn_patient
    dob = patient_info.get("dob")

    if patient is None:
        # last resort: exact name + date of birth, and only if it is unambiguous
        last, first = (patient_info.get("last") or "").strip(), (patient_info.get("first") or "").strip()
        if not (last and first and dob):
            return None, None, "No matching order number or MRN, and not enough to match by name and date of birth."
        candidates = list(
            Patient.objects.filter(
                organization=organization,
                date_of_birth=dob,
                user__last_name__iexact=last,
                user__first_name__iexact=first,
            ).select_related("user")
        )
        if len(candidates) != 1:
            why = "No patient matches that name and date of birth." if not candidates else "More than one patient matches that name and date of birth."
            return None, None, why
        return candidates[0].user, None, ""

    chart_dob = getattr(_profile(patient), "date_of_birth", None)
    if dob and chart_dob and dob != chart_dob:
        return None, order, "The date of birth in the result does not match the chart."
    if patient.organization_id != organization.pk:
        return None, order, "That patient is not in this organization."
    sent_last, chart_last = _norm_name(patient_info.get("last")), _norm_name(patient.last_name)
    if sent_last and chart_last and sent_last != chart_last:
        return None, order, "The last name in the result does not match the chart."
    return patient, order, ""


# --------------------------------------------------------------------------
# filing
# --------------------------------------------------------------------------

def _clean_items(items):
    cleaned = []
    for item in items[:MAX_ITEMS_PER_REPORT]:
        if not item.get("test_name") or not item.get("value"):
            continue
        flag = item.get("abnormal_flag") or ""
        cleaned.append(
            {
                "test_name": item["test_name"],
                "value": item["value"],
                "units": item.get("units", ""),
                "reference_range": item.get("reference_range", ""),
                "abnormal_flag": flag,
                "loinc_code": item.get("loinc_code", ""),
                "comment": item.get("comment", ""),
            }
        )
    return lab_results.prepare_items(cleaned) if cleaned else []


def _complete_order(order, report_status, filler):
    """Reflect the arrival of results on the order. Never lets an order problem lose the result."""
    if order is None:
        return
    try:
        if report_status == "final" and order.status in ("active", "in_progress"):
            ow.apply_interface_update(
                order, None, filler_order_number=filler or None, interface_status="acknowledged",
                status="completed", result_text="Result received from the lab.",
            )
        elif report_status == "preliminary" and order.status == "active":
            ow.apply_interface_update(
                order, None, filler_order_number=filler or None, interface_status="acknowledged", status="in_progress",
            )
        elif filler and order.filler_order_number != filler and order.status not in ("draft", "pending_cosign"):
            ow.apply_interface_update(order, None, filler_order_number=filler, interface_status="acknowledged")
    except ow.OrderWorkflowError:
        pass


def _file_report(connection, message, patient, order, parsed):
    """Create or update one LabReport from one parsed report. Returns the report or None."""
    organization = connection.organization
    filler = (parsed.get("filler") or "")[:64]
    status = parsed.get("status") or "final"

    existing = None
    if filler:
        existing = (
            LabReport.objects.filter(organization=organization, patient=patient, source="interface", accession_number=filler)
            .exclude(status="entered_in_error")
            .order_by("-created_at")
            .first()
        )

    if status == "cancelled":
        if existing is not None:
            existing.status = "entered_in_error"
            existing.error_reason = "Cancelled by the lab."
            existing.save()
            lab_results.log_event(existing, "entered_in_error", None, source="interface", detail={"reason": "Cancelled by the lab"})
        return existing

    items = _clean_items(parsed.get("items") or [])
    comment = parsed.get("comment", "")
    if parsed.get("has_document"):
        note = "The lab also sent a document with this result; it was not imported."
        comment = (comment + "\n" + note).strip()
    if not items and not comment:
        return None  # an order acknowledgment or status line with no results

    when = parsed.get("resulted_at") or timezone.now()
    if existing is not None:
        return _update_existing(existing, status, items, parsed, comment, when, order, message)

    with transaction.atomic():
        report = LabReport.objects.create(
            organization=organization,
            patient=patient,
            order=order,
            title=(parsed.get("title") or "Lab report")[:255],
            source="interface",
            status=status,
            performing_lab=(connection.lab_name or connection.name)[:120],
            accession_number=filler,
            collected_at=parsed.get("collected_at"),
            resulted_at=when,
            comment=comment,
            entered_by=None,
            inbound_message=message,
        )
        LabResultItem.objects.bulk_create([LabResultItem(report=report, **item) for item in items])
        lab_results.log_event(
            report, "received", None, source="interface",
            detail={"connection": connection.name, "items": len(items), "control_id": message.control_id},
        )
    _complete_order(order, status, filler)
    return report


def _update_existing(report, status, items, parsed, comment, when, order, message):
    """A later message for the same lab accession: preliminary -> final, or a correction."""
    with transaction.atomic():
        report = LabReport.objects.select_for_update().get(pk=report.pk)
        before = lab_results._signature(report.items.all())
        changed = []
        if items and lab_results._signature(items) != before:
            lab_results._write_items(report, items)
            changed.append("items")
        if status != report.status:
            report.status = status
            changed.append("status")
        if comment != report.comment:
            report.comment = comment
            changed.append("comment")
        if parsed.get("collected_at") and parsed["collected_at"] != report.collected_at:
            report.collected_at = parsed["collected_at"]
            changed.append("collected_at")
        if when != report.resulted_at:
            report.resulted_at = when
        if order is not None and report.order_id is None:
            report.order = order
            changed.append("order")
        if not changed:
            return report
        reset = False
        if report.review_status == "reviewed" and ("items" in changed or "status" in changed):
            report.review_status = "unreviewed"
            report.reviewed_by = None
            report.reviewed_at = None
            report.review_comment = ""
            reset = True
        report.inbound_message = message
        report.save()
        lab_results.log_event(report, "updated", None, source="interface", detail={"fields": changed, "review_reset": reset})
        if reset:
            lab_results.log_event(report, "review_reset", None, source="system", detail={"reason": "the lab sent a changed result"})
    _complete_order(order or report.order, status, report.accession_number)
    return report


def _file_all(connection, message, parsed, forced_patient=None):
    """File every report in a parsed message. Returns (report_ids, status, detail)."""
    organization = connection.organization
    placers = [r.get("placer") for r in parsed["reports"]]
    if forced_patient is not None:
        patient, order, reason = forced_patient, None, ""
    else:
        patient, order, reason = match_patient(organization, parsed["patient"], placers)
    if patient is None:
        return [], "unmatched", reason

    report_ids = []
    for parsed_report in parsed["reports"]:
        report_order = order
        placer = parsed_report.get("placer")
        if placer:
            found = Order.objects.filter(organization=organization, placer_order_number=placer, patient=patient).first()
            report_order = found or (order if order and order.patient_id == patient.pk else None)
        report = _file_report(connection, message, patient, report_order, parsed_report)
        if report is not None:
            report_ids.append(report.pk)
    if not report_ids:
        return [], "ignored", "The message held no results to file."
    return report_ids, "processed", f"Filed {len(report_ids)} report(s)."


# --------------------------------------------------------------------------
# entry points
# --------------------------------------------------------------------------

def authenticate(key):
    """The active connection for this key, or None. Marks it as used."""
    from .models import LabInterfaceConnection

    if not key:
        return None
    connection = (
        LabInterfaceConnection.objects.select_related("organization").filter(key_hash=hash_key(key), is_active=True).first()
    )
    if connection is not None:
        LabInterfaceConnection.objects.filter(pk=connection.pk).update(last_used_at=timezone.now())
    return connection


def _parse(fmt, raw):
    if fmt == "hl7":
        return lab_hl7.parse_oru(raw)
    try:
        return lab_fhir.parse_bundle(json.loads(raw))
    except ValueError as exc:
        raise lab_fhir.FhirError("The body is not valid JSON.") from exc


def process_message(connection, fmt, raw):
    """Read, match and file one message from a connection that has already been authenticated."""
    organization = connection.organization
    if not organization.lab_interface_enabled:
        return Outcome(403, "AR", "The lab interface add-on is not enabled for this organization.")

    try:
        parsed = _parse(fmt, raw)
    except (lab_hl7.Hl7Error, lab_fhir.FhirError) as exc:
        return Outcome(400, "AR", str(exc))

    control_id = (parsed.get("control_id") or "").strip() or "sha256:" + hashlib.sha256(raw.encode()).hexdigest()[:48]
    control_id = control_id[:100]
    out = Outcome(control_id=control_id, sending_app=parsed.get("sending_app", ""), sending_facility=parsed.get("sending_facility", ""))

    if LabInboundMessage.objects.filter(connection=connection, control_id=control_id).exists():
        out.duplicate = True
        out.text = "Duplicate message already received."
        return out

    try:
        with transaction.atomic():
            message = LabInboundMessage.objects.create(
                organization=organization,
                connection=connection,
                message_format=fmt,
                control_id=control_id,
                status="rejected",
                patient_hint=_hint(parsed.get("patient")),
                raw=raw,
            )
            report_ids, status, detail = _file_all(connection, message, parsed)
            message.status = status
            message.detail = detail
            message.save(update_fields=["status", "detail"])
    except IntegrityError:
        out.duplicate = True
        out.text = "Duplicate message already received."
        return out
    except lab_results.LabResultError as exc:
        return Outcome(400, "AR", exc.message, control_id, out.sending_app, out.sending_facility)

    out.message_status = status
    out.report_ids = report_ids
    out.text = detail
    return out


@transaction.atomic
def assign_message(message, user, patient):
    """Staff picks the patient for an unmatched message; it is filed as if it had matched."""
    if message.status != "unmatched":
        raise lab_results.LabResultError("This message is not waiting for a patient.", 409)
    parsed = _parse(message.message_format, message.raw)
    report_ids, status, detail = _file_all(message.connection, message, parsed, forced_patient=patient)
    if not report_ids:
        raise lab_results.LabResultError("There was nothing in that message to file.")
    message.status = "assigned"
    message.detail = f"Assigned to {patient.get_full_name() or patient.username} by {user.get_full_name() or user.username}. {detail}"
    message.resolved_by = user
    message.resolved_at = timezone.now()
    message.save()
    for report in LabReport.objects.filter(pk__in=report_ids):
        lab_results.log_event(report, "assigned", user, detail={"message": message.pk})
    return report_ids


@transaction.atomic
def dismiss_message(message, user, reason):
    reason = str(reason or "").strip()
    if not reason:
        raise lab_results.LabResultError("Say why this message is being dismissed.")
    if message.status != "unmatched":
        raise lab_results.LabResultError("This message is not waiting for a patient.", 409)
    message.status = "dismissed"
    message.detail = f"Dismissed: {reason}"
    message.resolved_by = user
    message.resolved_at = timezone.now()
    message.save()
    return message
