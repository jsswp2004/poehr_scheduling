"""Home medications and medication reconciliation: the list of what a patient actually takes, and who confirmed it."""

from django.db import transaction
from django.utils import timezone

from . import prescriptions as rxs
from .models import HomeMedication, MedReview

COPIED = (
    "drug_name", "code_system", "code", "strength", "form", "dose", "route", "frequency", "prn", "prn_reason", "sig_extra",
    "indication_text",
)


def same_drug(patient, drug_name, exclude_pk=None):
    """The patient's active home medicine with this name, if any (names compare ignoring case)."""
    qs = HomeMedication.objects.filter(patient=patient, status="active", drug_name__iexact=str(drug_name or "").strip())
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return qs.first()


def add_from_prescription(rx, user):
    """A signed prescription is something the patient now takes: put it on the home list unless it is already there."""
    if same_drug(rx.patient, rx.drug_name) is not None:
        return None
    values = {k: getattr(rx, k) for k in COPIED}
    values["sig_extra"] = values["sig_extra"][:300]
    if not values["indication_text"]:
        values["indication_text"] = rx.indication_text
    return HomeMedication.objects.create(
        organization=rx.organization, patient=rx.patient, source="our_rx", from_prescription=rx, created_by=user, **values
    )


def sig_of(med):
    return rxs.build_sig(med) if (med.dose or med.route or med.frequency or med.prn or med.sig_extra) else ""


@transaction.atomic
def stop(med, user, reason):
    med.status = "stopped"
    med.stopped_at = timezone.now()
    med.stopped_by = user
    med.stop_reason = reason
    med.save()
    return med


@transaction.atomic
def resume(med):
    med.status = "active"
    med.stopped_at = None
    med.stopped_by = None
    med.stop_reason = ""
    med.save()
    return med


@transaction.atomic
def confirm_review(patient, org, user, note=""):
    """Reconciliation: stamp every active home medicine as confirmed now, and keep a record of what the list said."""
    now = timezone.now()
    active = list(HomeMedication.objects.select_for_update().filter(patient=patient, status="active"))
    snapshot = [
        {"id": m.pk, "drug_name": m.drug_name, "strength": m.strength, "form": m.form, "sig": sig_of(m), "source": m.source}
        for m in active
    ]
    for m in active:
        m.reviewed_at = now
        m.reviewed_by = user
        m.save(update_fields=["reviewed_at", "reviewed_by", "updated_at"])
    return MedReview.objects.create(organization=org, patient=patient, reviewed_by=user, note=note, snapshot=snapshot)
