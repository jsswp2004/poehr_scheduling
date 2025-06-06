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
        ('system_admin', 'System Admin'),  # For superusers or system admins
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='none')    # 🔗 Link user to organization
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
    registered = models.BooleanField(default=False, help_text="Indicates if the user has completed registration")
    
    # Subscription and Trial Management
    stripe_customer_id = models.CharField(max_length=255, null=True, blank=True, help_text="Stripe customer ID")
    subscription_status = models.CharField(
        max_length=50, 
        default='trial',
        choices=[
            ('trial', 'Trial'),
            ('active', 'Active'),
            ('past_due', 'Past Due'),
            ('canceled', 'Canceled'),
            ('unpaid', 'Unpaid'),
        ],
        help_text="Current subscription status"
    )
    subscription_tier = models.CharField(
        max_length=50,
        default='basic',
        choices=[
            ('basic', 'Basic'),
            ('premium', 'Premium'),
            ('enterprise', 'Enterprise'),
        ],
        help_text="Subscription tier/plan"
    )
    trial_start_date = models.DateTimeField(null=True, blank=True, help_text="When the trial period started")
    trial_end_date = models.DateTimeField(null=True, blank=True, help_text="When the trial period ends")
    stripe_subscription_id = models.CharField(max_length=255, null=True, blank=True, help_text="Stripe subscription ID")
    
    ORGANIZATION_TYPE_CHOICES = [
        ('personal', 'Personal'),
        ('clinic', 'Clinic'),
        ('group', 'Group'),
    ]
    organization_type = models.CharField(max_length=20, choices=ORGANIZATION_TYPE_CHOICES, default='personal')

    def __str__(self):
        return f"{self.username} ({self.role})"


class Patient(models.Model):
    user = models.OneToOneField('CustomUser', on_delete=models.CASCADE, related_name='patient_profile')  # Use CustomUser instead of User
    date_of_birth = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=15, blank=True)
    address = models.CharField(max_length=255, blank=True)
    medical_history = models.TextField(blank=True)  # Example additional fields for patients
    # Add direct organization link for easier queries
    organization = models.ForeignKey(
        'Organization',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='patients'
    )

    def __str__(self):
        return f'{self.user.first_name} {self.user.last_name}'

class Organization(models.Model):
    name = models.CharField(max_length=255)
    logo = models.ImageField(upload_to='org_logos/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name