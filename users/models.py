from django.contrib.auth.models import AbstractUser  # Import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('patient', 'Patient'),
        ('doctor', 'Doctor'),
        ('receptionist', 'Receptionist'),
        ('admin', 'Admin'),
        ('registrar', 'Registrar'),
        ('none', 'None'),  # For non-patients, use 'None' or leave blank
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='none')

    # 🔗 Link user to organization
    organization = models.ForeignKey(
        'Organization',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='users'
    )

    provider = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='patients'
    )

    profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)

    def __str__(self):
        return f"{self.username} ({self.role})"


class Patient(models.Model):
    user = models.OneToOneField('CustomUser', on_delete=models.CASCADE, related_name='patient_profile')  # Use CustomUser instead of User
    date_of_birth = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=15, blank=True)
    address = models.CharField(max_length=255, blank=True)
    medical_history = models.TextField(blank=True)  # Example additional fields for patients

    def __str__(self):
        return f'{self.user.first_name} {self.user.last_name}'

class Organization(models.Model):
    name = models.CharField(max_length=255)
    logo = models.ImageField(upload_to='org_logos/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name