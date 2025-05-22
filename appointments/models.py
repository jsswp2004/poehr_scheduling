from django.db import models
from django.conf import settings
from django.contrib.postgres.fields import ArrayField

class Appointment(models.Model):
    RECURRENCE_CHOICES = [
        ('none', 'None'),
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
    ]

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='appointments'
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    appointment_datetime = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    recurrence = models.CharField(  # ✅ NEW
        max_length=10,
        choices=RECURRENCE_CHOICES,
        default='none'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Add the provider field (ForeignKey to User model)
    provider = models.ForeignKey(
        settings.AUTH_USER_MODEL,  # Assuming doctors are stored in the same User model
        on_delete=models.SET_NULL,  # If a doctor is deleted, set provider to NULL
        null=True,  # Allow null values in case no provider is assigned initially
        blank=True,  # Allow blank values in the form
        related_name='provider_appointments'  # Reverse relation from User (doctor) to appointments
    )

    def __str__(self):
        return f"{self.title} - {self.appointment_datetime}"

class Availability(models.Model):
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='availabilities'
    )
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    is_blocked = models.BooleanField(default=False)
    recurrence = models.CharField(
        max_length=10,
        choices=[
            ('none', 'None'),
            ('daily', 'Daily'),   # ✅ Add this
            ('weekly', 'Weekly'),
            ('monthly', 'Monthly')  # ✅ Add this too
        ],
    
        default='none'
    )
    recurrence_end_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        status = "Blocked" if self.is_blocked else "Available"
        return f"{status} for Dr. {self.doctor.get_full_name()} on {self.start_time}"

class EnvironmentSetting(models.Model):
    # Store the blocked days as an array of integers [0,6]
    blocked_days = ArrayField(
        models.IntegerField(),
        default=list,
        blank=True,
        help_text="Days blocked by default, 0=Sun, ..., 6=Sat"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Environment Setting ({self.pk})"