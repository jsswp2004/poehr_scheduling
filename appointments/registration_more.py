"""
Registration, part six: newborns, transportation, payments, ZIP codes and regional settings.

* POST /api/newborn-registration/                  register a baby under the mother's chart
* GET/PUT /api/visit-transport/<visit id>/          transportation arranged for a visit
* GET/POST /api/payments/<patient user id>/         receipts for a patient; POST takes a payment
* POST /api/payment-void/<receipt id>/              void a receipt with a reason (receipts are never edited)
* GET/POST/DELETE /api/zip-codes/                   a clinic's ZIP / postal table: lookup, import with preview, remove
* GET/PUT /api/registration-settings/               country (labels) and whether ZIP codes must be known
"""

import csv
import io
import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from poehr_scheduling_backend.tenancy import sees_all_orgs
from users.models import LEGAL_SEX_CHOICES, Patient, Registration

from .models import (
    PatientGuarantor,
    PaymentReceipt,
    ReceiptSequence,
    RegistrationSettings,
    VisitTransport,
    ZipCode,
)
from .patient_header import ADMIN_ROLES, STAFF_ROLES, _target_org

User = get_user_model()

PAY_ROLES = ("nurse", "registrar", "admin", "system_admin")
VOID_ROLES = ("registrar", "admin", "system_admin")
MAX_ZIP_ROWS = 50000

REGIONAL_LABELS = {
    "US": {"zip_code": "Zip Code", "state": "State", "ssn_last4": "Social Security Number (last 4 digits)"},
    "CA": {"zip_code": "Postal Code", "state": "Province", "ssn_last4": "Social Insurance Number (last 4 digits)"},
}


# --------------------------------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------------------------------
def _patient_for(request, user_id):
    """The patient in the caller's clinic, or (None, error response)."""
    if request.user.role not in STAFF_ROLES:
        return None, Response({"detail": "Not allowed."}, status=403)
    patient = Patient.objects.filter(user_id=user_id).select_related("user", "organization").first()
    if patient is None or (not sees_all_orgs(request.user) and patient.organization_id != request.user.organization_id):
        return None, Response({"detail": "Patient not found."}, status=404)
    return patient, None


def _text(raw, limit, label):
    value = "" if raw is None else str(raw).strip()
    if len(value) > limit:
        raise ValueError(f"{label} is longer than {limit} characters.")
    return value


def _settings_for(org):
    if org is None:
        return None
    return RegistrationSettings.objects.filter(organization=org).first()


def normalize_code(raw):
    return re.sub(r"[\s-]", "", str(raw or "")).upper()


def lookup_keys(raw):
    """Table keys to try for something a person typed: US ZIP (or ZIP+4) first, else a postal code, then its first three."""
    s = normalize_code(raw)
    if len(s) >= 5 and s[:5].isdigit():
        return [s[:5]]
    if len(s) >= 3:
        return [s[:6], s[:3]] if len(s) >= 6 else [s]
    return []


def code_problem(code):
    if code[:5].isdigit() and len(code) == 5:
        return ""
    if re.fullmatch(r"[A-Z][0-9][A-Z]([0-9][A-Z][0-9])?", code):
        return ""
    return f"'{code}' is not a ZIP code or a Canadian postal code."


# --------------------------------------------------------------------------------------------------
# settings
# --------------------------------------------------------------------------------------------------
def settings_row(org):
    s = _settings_for(org)
    country = s.country if s else "US"
    return {
        "country": country,
        "validate_zip": bool(s.validate_zip) if s else False,
        "labels": REGIONAL_LABELS[country],
        "countries": [{"key": k, "label": label} for k, label in RegistrationSettings.COUNTRY_CHOICES],
    }


class RegistrationSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        return Response({**settings_row(org), "can_edit": request.user.role in ADMIN_ROLES})

    def put(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can change registration settings."}, status=403)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        country = request.data.get("country", "US")
        if country not in REGIONAL_LABELS:
            return Response({"detail": "Country must be US or CA."}, status=400)
        validate = request.data.get("validate_zip", False)
        if not isinstance(validate, bool):
            return Response({"detail": "validate_zip must be true or false."}, status=400)
        RegistrationSettings.objects.update_or_create(organization=org, defaults={"country": country, "validate_zip": validate})
        return Response({**settings_row(org), "can_edit": True})


# --------------------------------------------------------------------------------------------------
# ZIP codes
# --------------------------------------------------------------------------------------------------
def parse_zip_csv(text):
    """CSV text to ({code: (city, state)}, errors, header_skipped). Columns: code, city, state."""
    rows, errors = {}, []
    reader = csv.reader(io.StringIO(text))
    skipped = False
    for number, row in enumerate(reader, start=1):
        if not any(c.strip() for c in row):
            continue
        if number == 1 and row[0].strip().lower() in ("zip", "zip code", "zipcode", "postal", "postal code", "code"):
            skipped = True
            continue
        if len(row) < 3:
            errors.append(f"Line {number}: needs a code, a city and a state.")
            continue
        code = normalize_code(row[0])
        if code[:5].isdigit() and len(code) > 5:
            code = code[:5]  # ZIP+4
        city, state = row[1].strip(), row[2].strip()
        problem = code_problem(code)
        if problem:
            errors.append(f"Line {number}: {problem}")
        elif not city or not state:
            errors.append(f"Line {number}: needs a city and a state.")
        elif len(city) > 100 or len(state) > 50:
            errors.append(f"Line {number}: city or state is too long.")
        else:
            rows[code] = (city, state)
    return rows, errors, skipped


class ZipCodesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        qs = ZipCode.objects.filter(organization=org)
        raw = request.query_params.get("zip")
        if raw is not None:
            for key in lookup_keys(raw):
                hit = qs.filter(code=key).first()
                if hit:
                    return Response({"match": {"code": hit.code, "city": hit.city, "state": hit.state}, "total": qs.count()})
            return Response({"match": None, "total": qs.count()})
        q = normalize_code(request.query_params.get("q", ""))
        listed = qs.filter(code__startswith=q) if q else qs
        return Response({"total": qs.count(), "results": [{"code": z.code, "city": z.city, "state": z.state} for z in listed[:50]], "can_edit": request.user.role in ADMIN_ROLES})

    def post(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can import ZIP codes."}, status=403)
        org = _target_org(request, request.data.get("organization"))
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        text = request.data.get("csv")
        if not isinstance(text, str) or not text.strip():
            return Response({"detail": "Paste or choose a file with code, city and state on each line."}, status=400)
        if len(text) > 5_000_000:
            return Response({"detail": "That file is too large."}, status=400)
        rows, errors, skipped = parse_zip_csv(text)
        if len(rows) > MAX_ZIP_ROWS:
            return Response({"detail": f"At most {MAX_ZIP_ROWS} codes per import."}, status=400)
        existing = set(ZipCode.objects.filter(organization=org, code__in=list(rows)).values_list("code", flat=True))
        replace = bool(request.data.get("replace"))
        report = {
            "valid": len(rows),
            "new": len(rows) - len(existing) if not replace else len(rows),
            "updated": len(existing) if not replace else 0,
            "errors": errors[:20],
            "error_count": len(errors),
            "header_skipped": skipped,
        }
        if request.data.get("preview"):
            return Response({**report, "saved": False})
        if not rows:
            return Response({"detail": "No usable rows.", **report}, status=400)
        with transaction.atomic():
            if replace:
                ZipCode.objects.filter(organization=org).delete()
            items = list(rows.items())
            for i in range(0, len(items), 1000):
                ZipCode.objects.bulk_create(
                    [ZipCode(organization=org, code=c, city=v[0], state=v[1]) for c, v in items[i : i + 1000]],
                    update_conflicts=True,
                    unique_fields=["organization", "code"],
                    update_fields=["city", "state"],
                )
        return Response({**report, "saved": True, "total": ZipCode.objects.filter(organization=org).count()})

    def delete(self, request):
        if request.user.role not in ADMIN_ROLES:
            return Response({"detail": "Only an administrator can remove ZIP codes."}, status=403)
        org = _target_org(request)
        if org is None:
            return Response({"detail": "Choose a clinic."}, status=400)
        qs = ZipCode.objects.filter(organization=org)
        if request.query_params.get("all") == "1":
            qs.delete()
        else:
            code = normalize_code(request.query_params.get("code", ""))
            if not code or not qs.filter(code=code).exists():
                return Response({"detail": "That code is not in the table."}, status=404)
            qs.filter(code=code).delete()
        return Response({"total": ZipCode.objects.filter(organization=org).count()})


# --------------------------------------------------------------------------------------------------
# transportation
# --------------------------------------------------------------------------------------------------
TRANSPORT_TEXT = [("reason", 100), ("provider", 100), ("location_type", 100), ("trip_indicator", 100), ("pickup_location", 255), ("destination", 255), ("notes", 500)]


def transport_row(t):
    blank = t is None
    out = {"needed": "" if blank else t.needed, "pickup_time": "" if blank or not t.pickup_time else timezone.localtime(t.pickup_time).strftime("%Y-%m-%dT%H:%M")}
    for key, _ in TRANSPORT_TEXT:
        out[key] = "" if blank else getattr(t, key)
    return out


class VisitTransportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _visit(self, request, visit_id):
        if request.user.role not in STAFF_ROLES:
            return None, Response({"detail": "Not allowed."}, status=403)
        visit = Registration.objects.filter(pk=visit_id).select_related("patient").first()
        if visit is None or (not sees_all_orgs(request.user) and visit.patient.organization_id != request.user.organization_id):
            return None, Response({"detail": "Visit not found."}, status=404)
        return visit, None

    def get(self, request, visit_id):
        visit, error = self._visit(request, visit_id)
        if error:
            return error
        return Response(transport_row(VisitTransport.objects.filter(registration=visit).first()))

    def put(self, request, visit_id):
        visit, error = self._visit(request, visit_id)
        if error:
            return error
        data = request.data
        values = {}
        try:
            needed = _text(data.get("needed"), 3, "Needed").lower()
            if needed not in ("", "yes", "no"):
                raise ValueError("Transportation needed must be Yes or No.")
            values["needed"] = needed
            for key, limit in TRANSPORT_TEXT:
                values[key] = _text(data.get(key), limit, key.replace("_", " ").capitalize())
            raw_time = _text(data.get("pickup_time"), 25, "Pickup time")
            values["pickup_time"] = None
            if raw_time:
                try:
                    parsed = datetime.fromisoformat(raw_time)
                except ValueError:
                    raise ValueError("Pickup time must be a date and time.")
                values["pickup_time"] = timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        if values["needed"] == "no":
            # nothing to arrange; keep only the answer
            values = {**{k: "" for k, _ in TRANSPORT_TEXT}, "needed": "no", "pickup_time": None}
        t, _ = VisitTransport.objects.update_or_create(registration=visit, defaults=values)
        return Response(transport_row(t))


# --------------------------------------------------------------------------------------------------
# payments
# --------------------------------------------------------------------------------------------------
def receipt_row(r):
    by = r.received_by
    return {
        "id": r.pk,
        "number": f"R-{r.receipt_number:06d}",
        "payment_type": r.payment_type,
        "method": r.method,
        "amount": f"{r.amount:.2f}",
        "reference": r.reference,
        "note": r.note,
        "received_at": r.received_at.isoformat(),
        "received_by": (f"{by.first_name} {by.last_name}".strip() or by.username) if by else "",
        "visit": r.registration_id,
        "visit_number": r.registration.visit_number if r.registration_id else "",
        "voided": r.voided,
        "void_reason": r.void_reason,
        "clinic": r.organization.name,
        "patient_name": f"{r.patient.user.first_name} {r.patient.user.last_name}".strip(),
        "mrn": r.patient.mrn,
    }


def next_receipt_number(org):
    seq, _ = ReceiptSequence.objects.select_for_update().get_or_create(organization=org)
    seq.last_number += 1
    seq.save(update_fields=["last_number"])
    return seq.last_number


class PaymentsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _list(self, patient):
        qs = PaymentReceipt.objects.filter(patient=patient).select_related("received_by", "registration", "organization", "patient__user")
        rows = [receipt_row(r) for r in qs]
        total = sum((Decimal(r["amount"]) for r in rows if not r["voided"]), Decimal("0"))
        return {"receipts": rows, "total_collected": f"{total:.2f}"}

    def get(self, request, user_id):
        patient, error = _patient_for(request, user_id)
        if error:
            return error
        return Response(self._list(patient))

    def post(self, request, user_id):
        if request.user.role not in PAY_ROLES:
            return Response({"detail": "Your role cannot take payments."}, status=403)
        patient, error = _patient_for(request, user_id)
        if error:
            return error
        if patient.organization_id is None:
            return Response({"detail": "This patient has no clinic."}, status=400)
        data = request.data
        try:
            payment_type = _text(data.get("payment_type"), 100, "Payment type")
            method = _text(data.get("method"), 100, "Method")
            reference = _text(data.get("reference"), 100, "Reference")
            note = _text(data.get("note"), 255, "Note")
            if not payment_type:
                raise ValueError("Choose a payment type.")
            if not method:
                raise ValueError("Choose how it was paid.")
            try:
                amount = Decimal(str(data.get("amount")).strip())
            except (InvalidOperation, AttributeError):
                raise ValueError("Enter the amount as a number.")
            if not amount.is_finite() or amount <= 0:
                raise ValueError("The amount must be more than zero.")
            if amount != amount.quantize(Decimal("0.01")):
                raise ValueError("The amount can have at most two decimal places.")
            if amount > Decimal("99999.99"):
                raise ValueError("The amount is too large.")
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        visit = None
        if data.get("visit"):
            visit = Registration.objects.filter(pk=data.get("visit"), patient=patient).first()
            if visit is None:
                return Response({"detail": "Visit not found."}, status=404)
        with transaction.atomic():
            receipt = PaymentReceipt.objects.create(
                organization=patient.organization,
                patient=patient,
                registration=visit,
                receipt_number=next_receipt_number(patient.organization),
                payment_type=payment_type,
                method=method,
                amount=amount,
                reference=reference,
                note=note,
                received_by=request.user,
            )
        receipt = PaymentReceipt.objects.select_related("received_by", "registration", "organization", "patient__user").get(pk=receipt.pk)
        return Response({"receipt": receipt_row(receipt), **self._list(patient)}, status=201)


class PaymentVoidView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, receipt_id):
        if request.user.role not in VOID_ROLES:
            return Response({"detail": "Only a registrar or administrator can void a receipt."}, status=403)
        r = PaymentReceipt.objects.filter(pk=receipt_id).select_related("patient").first()
        if r is None or (not sees_all_orgs(request.user) and r.organization_id != request.user.organization_id):
            return Response({"detail": "Receipt not found."}, status=404)
        if r.voided:
            return Response({"detail": "This receipt is already void."}, status=400)
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            return Response({"detail": "Give a reason for voiding the receipt."}, status=400)
        if len(reason) > 255:
            return Response({"detail": "The reason is longer than 255 characters."}, status=400)
        r.voided, r.void_reason, r.voided_by, r.voided_at = True, reason, request.user, timezone.now()
        r.save(update_fields=["voided", "void_reason", "voided_by", "voided_at"])
        r = PaymentReceipt.objects.select_related("received_by", "registration", "organization", "patient__user").get(pk=r.pk)
        return Response({"receipt": receipt_row(r), **PaymentsView()._list(r.patient)})


# --------------------------------------------------------------------------------------------------
# newborn
# --------------------------------------------------------------------------------------------------
class NewbornView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if request.user.role not in STAFF_ROLES:
            return Response({"detail": "Not allowed."}, status=403)
        data = request.data
        mother = Patient.objects.filter(pk=data.get("mother")).select_related("user", "organization").first()
        if mother is None or (not sees_all_orgs(request.user) and mother.organization_id != request.user.organization_id):
            return Response({"detail": "Find the mother first."}, status=404)
        if mother.mother_id:
            return Response({"detail": "The mother chosen is herself a newborn record."}, status=400)
        try:
            first = _text(data.get("first_name"), 150, "First name")
            last = _text(data.get("last_name"), 150, "Last name") or mother.user.last_name
            if not first:
                raise ValueError("Enter the baby's first name.")
            try:
                dob = date.fromisoformat(str(data.get("date_of_birth") or ""))
            except ValueError:
                raise ValueError("Enter the date of birth.")
            if dob > timezone.localdate():
                raise ValueError("The date of birth cannot be in the future.")
            sex = _text(data.get("legal_sex"), 1, "Sex").upper()
            if sex and sex not in [k for k, _ in LEGAL_SEX_CHOICES]:
                raise ValueError("Sex must be M, F or X.")
            weeks = data.get("gestational_age_weeks")
            weeks = None if weeks in (None, "") else int(weeks)
            if weeks is not None and not 20 <= weeks <= 45:
                raise ValueError("Gestational age must be between 20 and 45 weeks.")
            weight = data.get("birth_weight_g")
            weight = None if weight in (None, "") else int(weight)
            if weight is not None and not 200 <= weight <= 7000:
                raise ValueError("Birth weight must be between 200 and 7000 grams.")
        except (ValueError, TypeError) as exc:
            msg = str(exc)
            if msg.startswith("invalid literal"):
                msg = "Gestational age and birth weight must be whole numbers."
            return Response({"detail": msg}, status=400)
        if Patient.objects.filter(mother=mother, date_of_birth=dob, user__first_name__iexact=first).exists():
            return Response({"detail": "This baby is already registered under this mother."}, status=400)
        with transaction.atomic():
            username = f"newborn-{uuid.uuid4().hex[:10]}"
            user = User(username=username, email=f"{username}@newborn.invalid", first_name=first, last_name=last, role="patient", organization=mother.organization)
            user.set_unusable_password()
            user.save()
            baby = Patient.objects.get(user=user)
            baby.organization = mother.organization
            baby.mother = mother
            baby.date_of_birth = dob
            baby.legal_sex = sex
            baby.gestational_age_weeks = weeks
            baby.birth_weight_g = weight
            for field in ("phone_number", "address", "address2", "city", "state", "zip_code", "address_type", "preferred_language"):
                setattr(baby, field, getattr(mother, field))
            baby.save()
            PatientGuarantor.objects.create(
                patient=baby,
                is_self=False,
                name=f"{mother.user.first_name} {mother.user.last_name}".strip(),
                relationship="Mother",
                phone=mother.phone_number,
                address=mother.address,
            )
            visit_id = None
            if data.get("create_visit"):
                visit = Registration.objects.create(patient=baby, organization=mother.organization, reason_for_visit="Newborn")
                visit_id = visit.pk
        return Response(
            {"patient": {"id": baby.pk, "user_id": user.pk, "username": username, "mrn": baby.mrn, "first_name": first, "last_name": last}, "visit": visit_id, "mother": mother.pk},
            status=201,
        )
