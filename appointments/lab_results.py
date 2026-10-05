"""
Lab results -- the rules for entering, changing and reviewing a LabReport.

Views and serializers call these functions; they never change a report's
review state themselves. Everything that happens to a report is written to
LabReportEvent (who, when, from which source), so the history can always be
reconstructed. A future Quest/Labcorp interface drives the same functions
with source="interface".

    entered --review--> reviewed        (any user with lab_results.review:
                                         the ordering provider, a covering
                                         provider or a nurse)
    reviewed --edit--> unreviewed       (a changed result must be seen again)
    any --mark in error--> entered_in_error   (never deleted)

Result lines carry value, units, a reference range and an abnormal flag. If
the flag is not given and both the value and the range are numbers, the flag
is worked out (below the low end = L, above the high end = H). Critical
flags (LL / HH) are never guessed -- the lab or the person entering the
result has to say so.
"""

import hashlib
import os
import re
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .models import LabReport, LabReportEvent, LabReportFileData, LabResultItem, Order

MAX_ITEMS = 100

VALID_FLAGS = {code for code, _ in LabResultItem.FLAG_CHOICES}

# What people type or labs send -> our flag code.
FLAG_ALIASES = {
    "": "",
    "N": "",
    "NORMAL": "",
    "L": "L",
    "LOW": "L",
    "H": "H",
    "HIGH": "H",
    "LL": "LL",
    "CL": "LL",
    "CRITICAL LOW": "LL",
    "HH": "HH",
    "CH": "HH",
    "CRITICAL HIGH": "HH",
    "A": "A",
    "ABNORMAL": "A",
    "AA": "A",
}

CRITICAL_FLAGS = ("LL", "HH")

# Scanned documents: what browsers can show inline, and a size cap that fits a
# multi-page scan at normal resolution.
MAX_FILE_BYTES = 10 * 1024 * 1024
FILE_SIGNATURES = (
    (b"%PDF-", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
)


class LabResultError(Exception):
    """A rule was broken. ``status_code`` is the HTTP status the API returns."""

    def __init__(self, message, status_code=400, errors=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.errors = errors or []


# --------------------------------------------------------------------------
# reading numbers, ranges and flags
# --------------------------------------------------------------------------

_NUMBER = r"[+-]?\d+(?:\.\d+)?"


def parse_number(text):
    """'5.4' -> Decimal('5.4'); '1,200' -> 1200; '<5', 'Negative', '' -> None."""
    if text is None:
        return None
    cleaned = str(text).strip().replace(",", "")
    if not re.fullmatch(_NUMBER, cleaned):
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def parse_reference_range(text):
    """
    Returns (low, high) as Decimals or None.
        '3.5-5.0', '3.5 - 5.0', '3.5 to 5.0' -> (3.5, 5.0)
        '<5.7', '<=5.7', '≤ 5.7'             -> (None, 5.7)
        '>40', '>=40', '≥ 40'                -> (40, None)
    Anything else ('Negative', 'See comment') -> (None, None).
    """
    if not text:
        return None, None
    s = str(text).strip().replace(",", "")
    m = re.fullmatch(rf"({_NUMBER})\s*(?:-|–|—|to)\s*({_NUMBER})", s, flags=re.I)
    if m:
        low, high = Decimal(m.group(1)), Decimal(m.group(2))
        if low <= high:
            return low, high
        return None, None
    m = re.fullmatch(rf"(?:<|<=|≤)\s*({_NUMBER})", s)
    if m:
        return None, Decimal(m.group(1))
    m = re.fullmatch(rf"(?:>|>=|≥)\s*({_NUMBER})", s)
    if m:
        return Decimal(m.group(1)), None
    return None, None


def normalize_flag(raw):
    """Our flag code for what was typed, or None if it isn't a flag we know."""
    key = str(raw or "").strip().upper()
    return FLAG_ALIASES.get(key)


def derive_flag(value_numeric, low, high, supplied=""):
    """A flag that was given wins; otherwise compare the value to the range."""
    if supplied:
        return supplied
    if value_numeric is None:
        return ""
    if low is not None and value_numeric < low:
        return "L"
    if high is not None and value_numeric > high:
        return "H"
    return ""


def prepare_item(raw, index=0):
    """
    Turn one submitted result line into the values stored on LabResultItem
    (numeric value, parsed range, flag). Raises LabResultError for a line
    that is missing its name or value or has an unknown flag.
    """
    name = str(raw.get("test_name") or "").strip()
    value = str(raw.get("value") if raw.get("value") is not None else "").strip()
    row = index + 1
    if not name:
        raise LabResultError(f"Result line {row}: the test name is required.")
    if not value:
        raise LabResultError(f"Result line {row} ({name}): the value is required.")

    supplied = normalize_flag(raw.get("abnormal_flag"))
    if supplied is None:
        raise LabResultError(
            f"Result line {row} ({name}): unknown flag {raw.get('abnormal_flag')!r}. "
            "Use H, L, HH, LL, A or leave it blank."
        )

    reference_range = str(raw.get("reference_range") or "").strip()
    low, high = parse_reference_range(reference_range)
    numeric = parse_number(value)
    return {
        "sort_order": index,
        "test_name": name[:255],
        "loinc_code": str(raw.get("loinc_code") or "").strip()[:20],
        "value": value[:255],
        "value_numeric": numeric,
        "units": str(raw.get("units") or "").strip()[:50],
        "reference_range": reference_range[:100],
        "ref_low": low,
        "ref_high": high,
        "abnormal_flag": derive_flag(numeric, low, high, supplied),
        "comment": str(raw.get("comment") or "").strip(),
    }


def prepare_items(raw_items):
    if not isinstance(raw_items, (list, tuple)) or not raw_items:
        raise LabResultError("Add at least one result line.")
    if len(raw_items) > MAX_ITEMS:
        raise LabResultError(f"A report can have at most {MAX_ITEMS} result lines.")
    return [prepare_item(item, i) for i, item in enumerate(raw_items)]


def report_flags(report):
    """(has_abnormal, has_critical) for a report, from its result lines."""
    flags = [i.abnormal_flag for i in report.items.all()]
    return any(flags), any(f in CRITICAL_FLAGS for f in flags)


# --------------------------------------------------------------------------
# events
# --------------------------------------------------------------------------

def log_event(report, event_type, user=None, *, source="user", detail=None):
    return LabReportEvent.objects.create(
        report=report,
        event_type=event_type,
        user=user if getattr(user, "pk", None) else None,
        source=source,
        detail=detail or {},
    )


# --------------------------------------------------------------------------
# who and what a report may be attached to
# --------------------------------------------------------------------------

def _is_system_admin(user):
    return getattr(user, "role", None) == "system_admin"


def _find_patient(user, patient_id):
    User = get_user_model()
    patient = User.objects.filter(pk=patient_id, role="patient").first()
    if patient is None:
        raise LabResultError("Patient not found.", 404)
    if not _is_system_admin(user) and patient.organization_id != user.organization_id:
        raise LabResultError("Patient not found.", 404)
    return patient


def _find_order(patient, order_id):
    if not order_id:
        return None
    order = Order.objects.filter(pk=order_id).first()
    if order is None or order.patient_id != patient.pk:
        raise LabResultError("That order was not found for this patient.", 404)
    return order


# --------------------------------------------------------------------------
# actions
# --------------------------------------------------------------------------

_SIGNATURE_FIELDS = (
    "test_name",
    "loinc_code",
    "value",
    "units",
    "reference_range",
    "abnormal_flag",
    "comment",
)


def _signature(items):
    """What a person would call 'the same results': names, values, units, ranges, flags, in order."""
    rows = []
    for item in items:
        get = item.get if isinstance(item, dict) else lambda name, i=item: getattr(i, name)
        rows.append(tuple(get(name) for name in _SIGNATURE_FIELDS))
    return rows


def _write_items(report, items):
    report.items.all().delete()
    LabResultItem.objects.bulk_create([LabResultItem(report=report, **item) for item in items])


@transaction.atomic
def create_report(user, data, *, source="manual"):
    """
    Enter a report. ``data`` holds patient, optional order, title, status,
    performing_lab, accession_number, collected_at, resulted_at, comment and
    items (a list of result lines).
    """
    title = str(data.get("title") or "").strip()
    if not title:
        raise LabResultError("The report needs a title (the panel or test name).")
    status = data.get("status") or "final"
    if status not in ("preliminary", "final", "corrected"):
        raise LabResultError("Status must be preliminary, final or corrected.")

    patient = _find_patient(user, data.get("patient"))
    order = _find_order(patient, data.get("order"))
    items = prepare_items(data.get("items"))

    report = LabReport.objects.create(
        organization=patient.organization,
        patient=patient,
        order=order,
        title=title[:255],
        source=source,
        status=status,
        performing_lab=str(data.get("performing_lab") or "").strip()[:120],
        accession_number=str(data.get("accession_number") or "").strip()[:64],
        collected_at=data.get("collected_at"),
        resulted_at=data.get("resulted_at") or timezone.now(),
        comment=str(data.get("comment") or "").strip(),
        entered_by=user,
    )
    _write_items(report, items)
    log_event(
        report,
        "entered",
        user,
        source="user" if source != "interface" else "interface",
        detail={"source": source, "items": len(items), "order": order.pk if order else None},
    )
    return report


@transaction.atomic
def update_report(report, user, data):
    """
    Change a report. If result lines are sent they replace the old ones, and
    a final report whose results changed becomes "corrected". A reviewed
    report goes back to unreviewed so someone looks at the change.
    """
    report = LabReport.objects.select_for_update().get(pk=report.pk)
    if report.status == "entered_in_error":
        raise LabResultError("This report was marked entered in error and can't be changed.", 409)

    changed = []
    for field, limit in (("title", 255), ("performing_lab", 120), ("accession_number", 64)):
        if field in data:
            new = str(data.get(field) or "").strip()[:limit]
            if field == "title" and not new:
                raise LabResultError("The report needs a title (the panel or test name).")
            if new != getattr(report, field):
                setattr(report, field, new)
                changed.append(field)
    if "comment" in data:
        new = str(data.get("comment") or "").strip()
        if new != report.comment:
            report.comment = new
            changed.append("comment")
    for field in ("collected_at", "resulted_at"):
        if field in data and data[field] != getattr(report, field):
            setattr(report, field, data[field])
            changed.append(field)
    if "order" in data:
        order = _find_order(report.patient, data.get("order"))
        if (order.pk if order else None) != report.order_id:
            report.order = order
            changed.append("order")

    results_changed = False
    had_items = report.items.exists()
    if "items" in data:
        items = prepare_items(data.get("items"))
        # An edit form sends every line back; only a real difference counts as a change.
        if _signature(items) != _signature(report.items.all()):
            _write_items(report, items)
            results_changed = True
            changed.append("items")

    requested = data.get("status")
    if requested and requested != report.status:
        if requested not in ("preliminary", "final", "corrected"):
            raise LabResultError("Status must be preliminary, final or corrected.")
        report.status = requested
        changed.append("status")
    elif results_changed and had_items and report.status == "final":
        report.status = "corrected"
        changed.append("status")

    if not changed:
        return report

    reset = False
    if report.review_status == "reviewed" and (results_changed or "status" in changed):
        report.review_status = "unreviewed"
        report.reviewed_by = None
        report.reviewed_at = None
        report.review_comment = ""
        reset = True
    report.save()
    log_event(report, "updated", user, detail={"fields": changed, "review_reset": reset})
    if reset:
        log_event(report, "review_reset", user, source="system", detail={"reason": "result changed"})
    return report


@transaction.atomic
def review_report(report, user, comment=""):
    """Acknowledge a report. Reviewing twice is harmless and logs nothing new."""
    report = LabReport.objects.select_for_update().get(pk=report.pk)
    if report.status == "entered_in_error":
        raise LabResultError("This report was marked entered in error.", 409)
    if report.review_status == "reviewed":
        return report
    report.review_status = "reviewed"
    report.reviewed_by = user
    report.reviewed_at = timezone.now()
    report.review_comment = str(comment or "").strip()
    report.save()
    log_event(report, "reviewed", user, detail={"comment": bool(report.review_comment)})
    return report


@transaction.atomic
def mark_entered_in_error(report, user, reason):
    reason = str(reason or "").strip()
    if not reason:
        raise LabResultError("Say why this report is being marked entered in error.")
    report = LabReport.objects.select_for_update().get(pk=report.pk)
    if report.status == "entered_in_error":
        return report
    previous = report.status
    report.status = "entered_in_error"
    report.error_reason = reason
    report.save()
    log_event(report, "entered_in_error", user, detail={"from_status": previous, "reason": reason})
    return report


# --------------------------------------------------------------------------
# scanned documents
# --------------------------------------------------------------------------

def sniff_content_type(head):
    """The real type of a file from its first bytes (never from its name), or None."""
    for signature, content_type in FILE_SIGNATURES:
        if head.startswith(signature):
            return content_type
    return None


def safe_filename(name):
    """Just the file's own name: no folders, no control characters, not too long."""
    base = os.path.basename(str(name or "").replace("\\", "/"))
    base = re.sub(r"[\x00-\x1f\x7f\"<>|:*?]", "", base).strip()
    return base[:150] or "scan"


@transaction.atomic
def create_scanned_report(user, data, upload, *, allow_duplicate=False):
    """
    Store a scanned lab document as a report (source "scan") with no result
    lines yet. It joins the same unreviewed pile as typed results, and values
    can be typed in later from the document. The same file for the same
    patient is refused unless ``allow_duplicate`` says it is intentional.
    """
    if upload is None:
        raise LabResultError("Choose a file to upload.")
    content = upload.read()
    if not content:
        raise LabResultError("That file is empty.")
    if len(content) > MAX_FILE_BYTES:
        raise LabResultError(f"That file is too large. The limit is {MAX_FILE_BYTES // (1024 * 1024)} MB.")
    content_type = sniff_content_type(content[:16])
    if content_type is None:
        raise LabResultError("Only PDF, JPEG or PNG files can be uploaded. Scan to PDF if you can.")

    patient = _find_patient(user, data.get("patient"))
    order = _find_order(patient, data.get("order"))
    digest = hashlib.sha256(content).hexdigest()

    if not allow_duplicate:
        twin = (
            LabReport.objects.filter(patient=patient, file_sha256=digest)
            .exclude(status="entered_in_error")
            .order_by("-created_at")
            .first()
        )
        if twin is not None:
            raise LabResultError(
                "This exact file was already uploaded for this patient.",
                409,
                errors=[{"duplicate_of": twin.pk, "title": twin.title, "uploaded_at": twin.created_at.isoformat()}],
            )

    filename = safe_filename(getattr(upload, "name", ""))
    title = str(data.get("title") or "").strip() or os.path.splitext(filename)[0] or "Scanned lab result"
    report = LabReport.objects.create(
        organization=patient.organization,
        patient=patient,
        order=order,
        title=title[:255],
        source="scan",
        status="final",
        performing_lab=str(data.get("performing_lab") or "").strip()[:120],
        collected_at=data.get("collected_at"),
        resulted_at=data.get("resulted_at") or timezone.now(),
        comment=str(data.get("comment") or "").strip(),
        entered_by=user,
        file_name=filename,
        file_content_type=content_type,
        file_size=len(content),
        file_sha256=digest,
    )
    LabReportFileData.objects.create(report=report, data=content)
    log_event(
        report,
        "uploaded",
        user,
        detail={"file_name": filename, "size": len(content), "duplicate_allowed": bool(allow_duplicate)},
    )
    return report


def read_report_file(report, user):
    """(bytes, content_type, filename) of a report's scan, recording who opened it."""
    row = LabReportFileData.objects.filter(report=report).first()
    if row is None or not report.file_name:
        raise LabResultError("This report has no scanned document.", 404)
    log_event(report, "file_viewed", user)
    return bytes(row.data), report.file_content_type, report.file_name
