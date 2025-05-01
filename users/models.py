# users/models.py
from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('patient', 'Patient'),
        ('doctor', 'Doctor'),
        ('receptionist', 'Receptionist'),
        ('admin', 'Admin'),
        ('registrar', 'Registrar'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='patient')

    # ✅ Optional: only patients have a provider
    provider = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='patients'
    )

    def __str__(self):
        return f"{self.username} ({self.role})"
