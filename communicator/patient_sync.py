"""
Keep the Communicator contact list in step with registered patients.

A patient appears as a Contact only while they are an active patient of an
organization AND have agreed to texts (sms_consent). Consent withdrawn,
account deactivated, or no phone/email -> the synced contact is removed.
Synced contacts are managed here, not by hand (see ContactViewSet).
"""
import logging

from django.db.models import Q

from .models import Contact

logger = logging.getLogger(__name__)


def _patient_phone(user):
    phone = (getattr(user, "phone_number", None) or "").strip()
    if not phone:
        profile = getattr(user, "patient_profile", None)
        phone = (getattr(profile, "phone_number", "") or "").strip()
    return phone


def _display_name(user):
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.username


def should_be_contact(user):
    return bool(
        user.role == "patient"
        and user.is_active
        and user.organization_id
        and user.sms_consent
        and (_patient_phone(user) or user.email)
    )


def sync_patient_contact(user):
    """Create/update/remove the Contact mirroring this patient. Returns the Contact or None."""
    if user.role != "patient":
        Contact.objects.filter(patient_user=user).delete()
        return None
    if not should_be_contact(user):
        Contact.objects.filter(patient_user=user).delete()
        return None
    contact, _ = Contact.objects.update_or_create(
        patient_user=user,
        defaults={
            "name": _display_name(user)[:255],
            "phone": _patient_phone(user)[:20],
            "email": user.email or "",
            "uploaded_by": user,
            "sms_opt_out": bool(user.sms_opt_out),
            "sms_opt_out_date": user.sms_opt_out_date if user.sms_opt_out else None,
            "sms_opt_out_method": user.sms_opt_out_method if user.sms_opt_out else None,
        },
    )
    return contact


def sync_all_patients():
    """Backfill: returns (synced, removed)."""
    from users.models import CustomUser

    synced = 0
    for user in CustomUser.objects.filter(role="patient").select_related("patient_profile"):
        if sync_patient_contact(user):
            synced += 1
    stale = Contact.objects.filter(patient_user__isnull=False).exclude(
        patient_user__role="patient", patient_user__is_active=True, patient_user__sms_consent=True
    )
    removed = stale.count()
    stale.delete()
    return synced, removed


def visible_contacts(user):
    """Contacts this staff user may see: their own, plus synced patients of their
    organization when they hold the messages.send right."""
    from users.rights import user_has_right

    q = Q(uploaded_by=user)
    if getattr(user, "organization_id", None) and user_has_right(user, "messages.send"):
        q |= Q(patient_user__isnull=False, patient_user__organization_id=user.organization_id)
    return Contact.objects.filter(q)
