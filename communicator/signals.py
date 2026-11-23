import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from users.models import CustomUser, Patient

logger = logging.getLogger(__name__)


def _safe_sync(user):
    try:
        from .patient_sync import sync_patient_contact

        sync_patient_contact(user)
    except Exception:  # never let contact syncing break registration or profile saves
        logger.exception("Patient contact sync failed for user %s", getattr(user, "pk", None))


@receiver(post_save, sender=CustomUser, dispatch_uid="communicator_sync_patient_user")
def sync_on_user_save(sender, instance, **kwargs):
    if instance.role == "patient" or hasattr(instance, "communicator_contact"):
        _safe_sync(instance)


@receiver(post_save, sender=Patient, dispatch_uid="communicator_sync_patient_profile")
def sync_on_patient_save(sender, instance, **kwargs):
    _safe_sync(instance.user)
