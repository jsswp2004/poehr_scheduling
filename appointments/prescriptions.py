"""
Rx writer: the rules for how a prescription moves from a draft to something a pharmacy can fill.

    draft -> (the prescribing doctor signs) signed -> (printed / faxed) sent
    signed or sent -> cancelled

A signed prescription is never edited. To change one you "revise" it: that makes a new draft
that points back at the old one, and signing the new one cancels the old one. Every step is
written to the history (PrescriptionEvent) and runs under a row lock.

Only non-controlled drugs can be written here. Controlled substances (Schedule II-V) need
electronic prescribing with two-factor signing, which comes with the e-prescribing connection.
"""

import re
from datetime import timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from . import allergies
from .models import HomeMedication, PatientAllergy, PatientAllergyStatus, PatientPharmacy, Prescription, PrescriptionEvent
from .order_tasks import FREQUENCIES, ROUTES

DRAFT_ROLES = ("doctor", "nurse", "admin", "system_admin")  # may create / edit drafts and see prescriptions
ADMIN_ROLES = ("admin", "system_admin")
SIGN_ROLES = ("doctor",)  # a prescription is signed by the prescriber personally

STATUS_LABELS = dict(Prescription.STATUS_CHOICES)
MAX_REFILLS = 11

FORMS = [
    "tablet", "capsule", "solution", "suspension", "syrup", "cream", "ointment", "gel", "lotion", "patch",
    "inhaler", "drops", "spray", "suppository", "injection", "powder", "other",
]

# ---------------------------------------------------------------- controlled substances
# A conservative reviewable list of drugs that are Schedule II-V (federal) so they are kept out of
# the paper / fax writer. It is a safety net, not a drug reference; a pharmacist should review it.

CONTROLLED_INGREDIENTS = """
oxycodone hydrocodone morphine hydromorphone fentanyl methadone oxymorphone tapentadol codeine tramadol
meperidine buprenorphine butorphanol pentazocine levorphanol amphetamine dextroamphetamine methamphetamine
methylphenidate dexmethylphenidate lisdexamfetamine alprazolam lorazepam diazepam clonazepam temazepam
triazolam midazolam chlordiazepoxide clorazepate oxazepam estazolam flurazepam zolpidem eszopiclone zaleplon
phenobarbital butalbital carisoprodol pregabalin lacosamide brivaracetam cenobamate testosterone oxandrolone
nandrolone modafinil armodafinil phentermine ketamine esketamine dronabinol suvorexant lemborexant
daridorexant solriamfetol oxybate diphenoxylate eluxadoline lomotil
""".split()
CONTROLLED_BRANDS = [
    "percocet", "vicodin", "norco", "oxycontin", "roxicodone", "xanax", "ativan", "valium", "klonopin", "adderall",
    "ritalin", "concerta", "vyvanse", "ambien", "lunesta", "soma", "lyrica", "ultram", "suboxone", "subutex",
    "dilaudid", "duragesic", "restoril", "halcion", "focalin", "provigil", "nuvigil", "adipex", "xyrem",
]
_CONTROLLED = {allergies._norm(x) for x in CONTROLLED_INGREDIENTS + CONTROLLED_BRANDS}


def is_controlled(name):
    """True when the drug name mentions a Schedule II-V drug."""
    text = allergies._norm(name or "")
    return any(allergies._phrase_in(term, text) for term in _CONTROLLED)


CONTROLLED_MESSAGE = (
    "Controlled substances (Schedule II-V) can't be written on paper or fax here. "
    "They require electronic prescribing with two-factor signing."
)


# ---------------------------------------------------------------- errors


class RxError(Exception):
    def __init__(self, message, status_code=400, errors=None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.errors = errors or []


# ---------------------------------------------------------------- the directions (sig)

ROUTE_PHRASE = {
    "PO": "by mouth", "SL": "under the tongue", "IM": "into the muscle", "SC": "under the skin",
    "IV": "intravenously", "IVPB": "intravenously", "PR": "rectally", "Topical": "on the skin",
    "Inhaled": "by inhalation", "Ophthalmic": "in the eye", "Otic": "in the ear", "Nasal": "in the nose",
    "Transdermal": "on the skin", "Via tube": "via feeding tube", "Other": "",
}
ROUTE_VERB = {
    "PO": "Take", "SL": "Place", "IM": "Inject", "SC": "Inject", "IV": "Give", "IVPB": "Give", "PR": "Insert",
    "Topical": "Apply", "Inhaled": "Inhale", "Ophthalmic": "Instill", "Otic": "Instill", "Nasal": "Spray",
    "Transdermal": "Apply", "Via tube": "Give", "Other": "Use",
}
FREQUENCY_PHRASE = {
    "once": "once", "stat": "now", "daily": "once daily", "qam": "every morning", "qhs": "at bedtime",
    "bid": "twice daily", "tid": "three times daily", "qid": "four times daily", "q1h": "every hour",
    "q2h": "every 2 hours", "q4h": "every 4 hours", "q6h": "every 6 hours", "q8h": "every 8 hours",
    "q12h": "every 12 hours", "weekly": "once weekly", "prn": "",
}


def build_sig(rx):
    """The directions as a sentence, built from the structured fields."""
    verb = ROUTE_VERB.get(rx.route, "Use") if rx.route else "Take"
    parts = [verb]
    if rx.dose:
        parts.append(rx.dose.strip())
    route = ROUTE_PHRASE.get(rx.route, "")
    if route:
        parts.append(route)
    freq = FREQUENCY_PHRASE.get(rx.frequency, "")
    if freq:
        parts.append(freq)
    if rx.duration_days:
        parts.append(f"for {rx.duration_days} day{'s' if rx.duration_days != 1 else ''}")
    if rx.prn or rx.frequency == "prn":
        parts.append("as needed" + (f" for {rx.prn_reason.strip()}" if rx.prn_reason.strip() else ""))
    sentence = " ".join(p for p in parts if p).strip()
    sentence = sentence[:1].upper() + sentence[1:] + "."
    if rx.sig_extra.strip():
        extra = rx.sig_extra.strip()
        sentence += " " + (extra if extra.endswith((".", "!", "?")) else extra + ".")
    return sentence


# ---------------------------------------------------------------- number checks


def npi_valid(npi):
    """A 10-digit NPI whose check digit is right (Luhn on the number with the 80840 prefix)."""
    npi = str(npi or "")
    if not re.fullmatch(r"\d{10}", npi):
        return False
    digits = [int(c) for c in "80840" + npi]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def dea_valid(dea):
    dea = str(dea or "").upper()
    if not re.fullmatch(r"[A-Z]{2}\d{7}", dea):
        return False
    d = [int(c) for c in dea[2:]]
    return (d[0] + d[2] + d[4] + 2 * (d[1] + d[3] + d[5])) % 10 == d[6]


# ---------------------------------------------------------------- permissions


def can_edit_draft(user, rx):
    return rx.status == "draft" and user.role in DRAFT_ROLES


def can_sign(user, rx):
    return user.role in SIGN_ROLES and rx.prescriber_id == user.pk


def can_cancel(user, rx):
    return user.role in ADMIN_ROLES or (user.role == "doctor" and rx.prescriber_id == user.pk)


def allowed_actions(user, rx):
    """What this user can do to this prescription right now (drives the buttons)."""
    if getattr(user, "role", None) not in DRAFT_ROLES:
        return []
    out = []
    if rx.status == "draft":
        if can_sign(user, rx):
            out.append("sign")
    else:
        if rx.status in ("signed", "sent"):
            out += ["print", "fax"]
        if rx.status in ("signed", "sent") and can_cancel(user, rx):
            out.append("cancel")
        out.append("revise")
        if rx.status in ("signed", "sent"):
            out.append("renew")
    return out


# ---------------------------------------------------------------- helpers


def log_event(rx, event_type, user=None, *, from_status="", to_status="", detail=None):
    return PrescriptionEvent.objects.create(
        prescription=rx,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        user=user if getattr(user, "pk", None) else None,
        detail=detail or {},
    )


def _lock(rx):
    return Prescription.objects.select_for_update().get(pk=rx.pk)


def _name(user):
    if user is None:
        return ""
    return (f"{user.first_name} {user.last_name}".strip()) or user.username


def _decimal(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def pharmacy_json(p):
    return {
        "id": p.pk, "name": p.name, "address": p.address, "city": p.city, "state": p.state, "zip_code": p.zip_code,
        "phone": p.phone, "fax": p.fax, "ncpdp_id": p.ncpdp_id, "npi": p.npi, "is_active": p.is_active,
    }


def pharmacy_line(snap):
    bits = [snap.get("address", ""), " ".join(x for x in (snap.get("city", ""), snap.get("state", ""), snap.get("zip_code", "")) if x)]
    return ", ".join(b for b in bits if b)


def clinical_snapshot(rx):
    """Who wrote it, for whom, and the allergies, as they stand now (frozen onto the Rx when it is signed)."""
    prescriber = rx.prescriber
    profile = getattr(prescriber, "prescriber_profile", None)
    patient = rx.patient
    pat_profile = getattr(patient, "patient_profile", None)
    rows = PatientAllergy.objects.filter(patient=patient, status="active").order_by("substance", "id")
    allergy_list = [{"substance": a.substance, "reaction": a.reaction, "severity": a.severity} for a in rows]
    nka = (not allergy_list) and PatientAllergyStatus.objects.filter(patient=patient, no_known_allergies=True).exists()
    dob = getattr(pat_profile, "date_of_birth", None)
    return {
        "organization": rx.organization.name,
        "prescriber": {
            "name": _name(prescriber),
            "npi": prescriber.npi,
            "license_number": getattr(profile, "license_number", ""),
            "license_state": getattr(profile, "license_state", ""),
            "dea_number": getattr(profile, "dea_number", ""),
            "practice_name": getattr(profile, "practice_name", "") or rx.organization.name,
            "address": getattr(profile, "address", ""),
            "phone": getattr(profile, "phone", ""),
            "fax": getattr(profile, "fax", ""),
        },
        "patient": {
            "name": _name(patient),
            "date_of_birth": dob.isoformat() if dob else "",
            "address": getattr(pat_profile, "address", ""),
            "phone": getattr(pat_profile, "phone_number", ""),
            "sex": getattr(pat_profile, "legal_sex", ""),
            "mrn": getattr(pat_profile, "mrn", "") or "",
        },
        "allergies": allergy_list,
        "no_known_allergies": bool(nka),
        "captured_at": timezone.now().isoformat(),
    }


def missing_for_sign(rx):
    """What is still needed before the prescriber can sign (empty list = ready)."""
    missing = []
    if not rx.drug_name.strip():
        missing.append("drug")
    if not rx.dose.strip():
        missing.append("dose")
    if not rx.frequency:
        missing.append("how often")
    if rx.quantity is None or rx.quantity <= 0:
        missing.append("quantity")
    if not rx.days_supply:
        missing.append("days' supply")
    if rx.refills is None or rx.refills > MAX_REFILLS:
        missing.append("refills (0-%d)" % MAX_REFILLS)
    prescriber = rx.prescriber
    if not npi_valid(prescriber.npi):
        missing.append("prescriber NPI")
    profile = getattr(prescriber, "prescriber_profile", None)
    if not (profile and profile.license_number.strip()):
        missing.append("prescriber license number")
    patient_profile = getattr(rx.patient, "patient_profile", None)
    if not getattr(patient_profile, "date_of_birth", None):
        missing.append("patient date of birth")
    return missing


def _norm_keys(rx):
    """What identifies a drug for the duplicate check: its ingredient names and RxNorm code."""
    ingredients, _groups = allergies.drug_terms(rx.drug_name)
    keys = set(ingredients)
    if rx.code:
        keys.add(f"{rx.code_system}:{rx.code}")
    keys.add(allergies._norm(rx.drug_name))
    return keys


def duplicates_for(rx):
    """Prescriptions for this patient that are still running and contain the same drug."""
    now = timezone.now()
    mine = _norm_keys(rx)
    out = []
    qs = Prescription.objects.filter(patient=rx.patient, status__in=["signed", "sent"]).exclude(pk=rx.pk)
    if rx.replaces_id:
        qs = qs.exclude(pk=rx.replaces_id)
    if rx.renews_id:
        qs = qs.exclude(pk=rx.renews_id)
    for other in qs:
        if not (_norm_keys(other) & mine):
            continue
        start = other.signed_at or other.created_at
        covered = (other.days_supply or 0) * (1 + (other.refills or 0))
        runs_until = start + timedelta(days=max(covered, 1))
        if runs_until > now:
            out.append({
                "prescription": other.pk, "drug_name": other.drug_name, "sig": other.sig,
                "signed_at": other.signed_at.isoformat() if other.signed_at else None,
                "runs_until": runs_until.date().isoformat(), "prescriber": _name(other.prescriber),
            })
    return out


def check_not_controlled(name):
    if is_controlled(name):
        raise RxError(CONTROLLED_MESSAGE)


# ---------------------------------------------------------------- the steps


@transaction.atomic
def sign(rx, user, allergy_override_reason="", duplicate_reason=""):
    rx = _lock(rx)
    if rx.status != "draft":
        raise RxError("Only a draft can be signed.", 409)
    if not can_sign(user, rx):
        raise RxError("Only the prescribing doctor can sign this prescription.", 403)
    check_not_controlled(rx.drug_name)
    missing = missing_for_sign(rx)
    if missing:
        raise RxError("Before signing you need: " + ", ".join(missing) + ".", errors=missing)

    alerts = allergies.check_order(rx.patient, rx.drug_name, rx.code_system, rx.code)
    override = str(allergy_override_reason or "").strip()[:300]
    if alerts and not override:
        raise RxError(
            "Allergy alert for '%s': " % rx.drug_name + "; ".join(a["message"] for a in alerts) + " Give a reason to sign anyway.",
            409, errors=[{"kind": "allergy", "allergy_alerts": alerts}],
        )
    dups = duplicates_for(rx)
    dup_reason = str(duplicate_reason or "").strip()[:300]
    if dups and not dup_reason:
        raise RxError(
            "This patient already has a running prescription for the same drug. Give a reason to prescribe it again.",
            409, errors=[{"kind": "duplicate", "duplicates": dups}],
        )

    pharmacy = rx.pharmacy
    rx.sig = build_sig(rx)
    rx.clinical_snapshot = clinical_snapshot(rx)
    if pharmacy is not None:
        rx.pharmacy_snapshot = pharmacy_json(pharmacy)
    rx.status = "signed"
    rx.signed_by = user
    rx.signed_at = timezone.now()
    rx.save()
    detail = {}
    if alerts:
        detail["allergy_override"] = {"reason": override, "alerts": alerts}
    if dups:
        detail["duplicate_override"] = {"reason": dup_reason, "duplicates": dups}
    log_event(rx, "signed", user, from_status="draft", to_status="signed", detail=detail)

    # what a patient has been prescribed is what they now take: keep the home medication list up to date
    from . import home_meds

    home_meds.add_from_prescription(rx, user)

    if rx.replaces_id:
        old = Prescription.objects.select_for_update().filter(pk=rx.replaces_id).first()
        if old is not None and old.status in ("signed", "sent"):
            old.status = "cancelled"
            old.cancelled_at = timezone.now()
            old.cancel_reason = f"Replaced by Rx {rx.pk}"
            old.save()
            log_event(old, "cancelled", user, from_status="signed", to_status="cancelled", detail={"reason": old.cancel_reason, "replaced_by": rx.pk})
    return rx


def _set_pharmacy_snapshot(rx):
    if rx.pharmacy_id:
        rx.pharmacy_snapshot = pharmacy_json(rx.pharmacy)


@transaction.atomic
def record_print(rx, user):
    """Log that the prescription was printed. The first print counts as 'given to the patient'."""
    rx = _lock(rx)
    if rx.status not in ("signed", "sent"):
        raise RxError("Only a signed prescription can be printed for the patient.", 409)
    first = rx.status == "signed"
    rx.print_count += 1
    if first:
        rx.status = "sent"
        rx.delivery_method = "print"
        rx.sent_at = timezone.now()
        _set_pharmacy_snapshot(rx)
    rx.save()
    log_event(rx, "printed" if first else "reprinted", user, from_status="signed" if first else "sent",
              to_status="sent", detail={"print_count": rx.print_count})
    return rx


def _clean_fax(number):
    digits = re.sub(r"\D", "", str(number or ""))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


@transaction.atomic
def record_fax(rx, user, fax_number="", confirmation="", note=""):
    """Log that the signed prescription was faxed to the pharmacy (a person sent it; we keep the audit)."""
    rx = _lock(rx)
    if rx.status not in ("signed", "sent"):
        raise RxError("Only a signed prescription can be faxed.", 409)
    number = _clean_fax(fax_number) or (_clean_fax(rx.pharmacy.fax) if rx.pharmacy_id else "")
    if len(number) != 10:
        raise RxError("Give the pharmacy's 10-digit fax number (or choose a pharmacy that has one).")
    first = rx.status == "signed"
    rx.delivery_detail = {
        "fax_number": number,
        "confirmation": str(confirmation or "").strip()[:100],
        "note": str(note or "").strip()[:300],
        "mode": "manual",
        "faxed_at": timezone.now().isoformat(),
    }
    if first:
        rx.status = "sent"
        rx.delivery_method = "fax"
        rx.sent_at = timezone.now()
    _set_pharmacy_snapshot(rx)
    rx.save()
    log_event(rx, "faxed" if first else "faxed_again", user, from_status="signed" if first else "sent",
              to_status="sent", detail=dict(rx.delivery_detail))
    return rx


@transaction.atomic
def cancel(rx, user, reason):
    rx = _lock(rx)
    reason = str(reason or "").strip()[:300]
    if rx.status not in ("signed", "sent"):
        raise RxError("Only a signed prescription can be cancelled (delete a draft instead).", 409)
    if not can_cancel(user, rx):
        raise RxError("Only the prescribing doctor or an administrator can cancel a prescription.", 403)
    if not reason:
        raise RxError("Say why it is being cancelled.")
    previous = rx.status
    was_sent = previous == "sent"
    rx.status = "cancelled"
    rx.cancelled_at = timezone.now()
    rx.cancel_reason = reason
    rx.save()
    log_event(rx, "cancelled", user, from_status=previous, to_status="cancelled",
              detail={"reason": reason, "pharmacy_must_be_told": was_sent})
    return rx


@transaction.atomic
def revise(rx, user):
    """A new draft copied from a signed / sent / cancelled prescription; signing it cancels the old one."""
    rx = _lock(rx)
    if rx.status == "draft":
        raise RxError("This is still a draft -- just edit it.", 409)
    if user.role not in DRAFT_ROLES:
        raise RxError("Not allowed.", 403)
    existing = Prescription.objects.filter(replaces=rx, status="draft").first()
    if existing:
        return existing
    copy = Prescription.objects.create(
        organization=rx.organization, patient=rx.patient, prescriber=rx.prescriber, created_by=user,
        appointment=rx.appointment, replaces=rx,
        drug_name=rx.drug_name, code_system=rx.code_system, code=rx.code, strength=rx.strength, form=rx.form,
        dose=rx.dose, route=rx.route, frequency=rx.frequency, duration_days=rx.duration_days, prn=rx.prn,
        prn_reason=rx.prn_reason, sig_extra=rx.sig_extra, quantity=rx.quantity, quantity_unit=rx.quantity_unit,
        days_supply=rx.days_supply, refills=rx.refills, dispense_as_written=rx.dispense_as_written,
        indication_code=rx.indication_code, indication_text=rx.indication_text,
        note_to_pharmacist=rx.note_to_pharmacist, pharmacy=rx.pharmacy,
    )
    log_event(copy, "created", user, to_status="draft", detail={"revises": rx.pk})
    log_event(rx, "revision_started", user, detail={"new_prescription": copy.pk})
    return copy


RENEWAL_AHEAD_DAYS = 14   # a prescription is "due for renewal" this long before it runs out
RENEWAL_BEHIND_DAYS = 90  # ... and for this long after (then it is just an old prescription)


def runs_out_at(rx):
    """When the supply runs out: the days' supply for the fill and every refill, counted from signing."""
    if rx.status not in ("signed", "sent") or not rx.days_supply:
        return None
    start = rx.signed_at or rx.created_at
    return start + timedelta(days=rx.days_supply * (1 + (rx.refills or 0)))


def _followed_up(rx):
    """True when something newer already carries on the drug: another prescription, or the patient stopped taking it."""
    mine = _norm_keys(rx)
    later = Prescription.objects.filter(patient=rx.patient, pk__gt=rx.pk, status__in=["draft", "signed", "sent"])
    if any(_norm_keys(other) & mine for other in later):
        return True
    start = rx.signed_at or rx.created_at
    return HomeMedication.objects.filter(
        patient=rx.patient, status="stopped", drug_name__iexact=rx.drug_name, stopped_at__gte=start
    ).exists()


def renewal_due(rx, now=None):
    now = now or timezone.now()
    end = runs_out_at(rx)
    if end is None:
        return False
    if end > now + timedelta(days=RENEWAL_AHEAD_DAYS) or end < now - timedelta(days=RENEWAL_BEHIND_DAYS):
        return False
    return not _followed_up(rx)


def renewals_due(queryset, now=None):
    """The signed / sent prescriptions in `queryset` that are due for renewal, soonest to run out first."""
    now = now or timezone.now()
    found = []
    for rx in queryset.filter(status__in=["signed", "sent"], days_supply__isnull=False):
        if renewal_due(rx, now):
            found.append((runs_out_at(rx), rx.pk))
    found.sort()
    return [pk for _end, pk in found]


@transaction.atomic
def renew(rx, user):
    """A new draft that carries on a signed / sent prescription. The old one stays as it is."""
    rx = _lock(rx)
    if rx.status not in ("signed", "sent"):
        raise RxError("Only a signed prescription can be renewed.", 409)
    if user.role not in DRAFT_ROLES:
        raise RxError("Not allowed.", 403)
    existing = Prescription.objects.filter(renews=rx, status="draft").first()
    if existing:
        return existing
    pharmacy = preferred_pharmacy(rx.patient) or (rx.pharmacy if rx.pharmacy_id and rx.pharmacy.is_active else None)
    copy = Prescription.objects.create(
        organization=rx.organization, patient=rx.patient, prescriber=user if user.role == "doctor" else rx.prescriber,
        created_by=user, appointment=None, renews=rx,
        drug_name=rx.drug_name, code_system=rx.code_system, code=rx.code, strength=rx.strength, form=rx.form,
        dose=rx.dose, route=rx.route, frequency=rx.frequency, duration_days=rx.duration_days, prn=rx.prn,
        prn_reason=rx.prn_reason, sig_extra=rx.sig_extra, quantity=rx.quantity, quantity_unit=rx.quantity_unit,
        days_supply=rx.days_supply, refills=rx.refills, dispense_as_written=rx.dispense_as_written,
        indication_code=rx.indication_code, indication_text=rx.indication_text,
        note_to_pharmacist=rx.note_to_pharmacist, pharmacy=pharmacy,
    )
    log_event(copy, "created", user, to_status="draft", detail={"renews": rx.pk})
    log_event(rx, "renewal_started", user, detail={"new_prescription": copy.pk})
    return copy


def preferred_pharmacy(patient):
    row = PatientPharmacy.objects.filter(patient=patient).select_related("pharmacy").first()
    return row.pharmacy if row and row.pharmacy.is_active else None


def valid_frequency(key):
    return key in FREQUENCIES


def valid_route(route):
    return route in ROUTES
