from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import CustomUser, Patient


@receiver(post_save, sender=CustomUser)
def create_patient_profile(sender, instance, created, **kwargs):
    """
    Automatically create a Patient profile when a CustomUser with role='patient' is created.
    """
    if created and instance.role == 'patient':
        Patient.objects.create(user=instance)


@receiver(post_save, sender=CustomUser)
def save_patient_profile(sender, instance, **kwargs):
    """
    Save the Patient profile when the CustomUser is saved, if it exists.
    """
    if instance.role == 'patient' and hasattr(instance, 'patient'):
        instance.patient.save()
