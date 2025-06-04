from django.db import models
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from users.models import Organization  # Assuming Organization is defined in users/models.py

class ClinicEvent(models.Model):
    name = models.CharField(max_length=255, unique=True)  # e.g., "Follow-up Visit", "Annual Checkup"
    description = models.TextField(blank=True, null=True) # Optional
    is_active = models.BooleanField(default=True)         # Optional for hiding events

    def __str__(self):
        return self.name

class Appointment(models.Model):
    RECURRENCE_CHOICES = [
        ('none', 'None'),
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
    ]
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
        ('rescheduled', 'Rescheduled'),
        ('pending', 'Pending'),  # ✅ Add this
        ('in_progress', 'In Progress')  # ✅ Add this too
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='appointments',
        null=True,  # You can make it non-nullable later
        blank=True
    )

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
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='scheduled',
        help_text='Status of the appointment'
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

    recurrence_end_date = models.DateField(null=True, blank=True)  # NEW FIELD

    def __str__(self):
        return f"{self.title} - {self.appointment_datetime}"

class Availability(models.Model):

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='availabilities',
        null=True,
        blank=True
    )

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
    block_type = models.CharField(
        max_length=32,
        choices=[
            ("Lunch", "Lunch"),
            ("Meeting", "Meeting"),
            ("Vacation", "Vacation"),
            ("On Leave", "On Leave"),
            ("Other", "Other"),
        ],
        default="Lunch",
        blank=True,
        null=True,
        help_text="Type of block for this availability (if blocked)"
    )

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
    
class Holiday(models.Model):
    name = models.CharField(max_length=64)
    date = models.DateField()
    is_recognized = models.BooleanField(default=False)
    suppressed = models.BooleanField(default=False)  # Mark as suppressed instead of deleting

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['name', 'date'], name='unique_holiday')
        ]

    def __str__(self):
        return f"{self.name} ({self.date})"
