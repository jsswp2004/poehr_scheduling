from django.contrib.auth.models import AbstractUser  # Import AbstractUser
from django.db import models
from django.utils import timezone

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
        ('group', 'Group'),    ]
    organization_type = models.CharField(max_length=20, choices=ORGANIZATION_TYPE_CHOICES, default='personal')

    # ✅ Online Status Fields for Real-time Chat
    last_seen = models.DateTimeField(null=True, blank=True, help_text="Last time user was active")
    is_online = models.BooleanField(default=False, help_text="Whether user is currently online")

    def __str__(self):
        return f"{self.username} ({self.role})"
    
    def update_last_seen(self):
        """Update the last seen timestamp to current time"""
        self.last_seen = timezone.now()
        self.save(update_fields=['last_seen'])
    
    def set_online_status(self, is_online):
        """Set the online status and update last seen if going online"""
        self.is_online = is_online
        if is_online:
            self.last_seen = timezone.now()
        self.save(update_fields=['is_online', 'last_seen'])


class Patient(models.Model):
    user = models.OneToOneField('CustomUser', on_delete=models.CASCADE, related_name='patient_profile')  # Use CustomUser instead of User
    date_of_birth = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=15, blank=True)
    address = models.CharField(max_length=255, blank=True)
    medical_history = models.TextField(blank=True, null=True)  # Allow null values for optional medical history
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


# ✅ Phase 2: Real-time Chat Models
class ChatRoom(models.Model):
    """Chat room for team communication"""
    ROOM_TYPE_CHOICES = [
        ('direct', 'Direct Message'),
        ('group', 'Group Chat'),
        ('team', 'Team Chat'),
    ]
    
    name = models.CharField(max_length=255, help_text='Name of the chat room')
    room_type = models.CharField(max_length=20, choices=ROOM_TYPE_CHOICES, default='direct')
    participants = models.ManyToManyField(CustomUser, related_name='chat_rooms', help_text='Users participating in this chat room')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        verbose_name = 'Chat Room'
        verbose_name_plural = 'Chat Rooms'
    
    def __str__(self):
        return f'{self.name} ({self.get_room_type_display()})'
    
    def get_participants_list(self):
        """Get list of participant usernames"""
        return [user.username for user in self.participants.all()]


class ChatMessage(models.Model):
    """Individual chat message"""
    MESSAGE_TYPE_CHOICES = [
        ('text', 'Text Message'),
        ('system', 'System Message'),
        ('notification', 'Notification'),
    ]
    
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages', help_text='Chat room this message belongs to')
    sender = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='sent_messages', help_text='User who sent the message')
    recipient = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='received_messages', null=True, blank=True, help_text='User who should receive the message (for direct messages)')
    message = models.TextField(help_text='The chat message content')
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPE_CHOICES, default='text')
    timestamp = models.DateTimeField(auto_now_add=True, help_text='When the message was sent')
    is_read = models.BooleanField(default=False, help_text='Whether the message has been read')
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Chat Message'
        verbose_name_plural = 'Chat Messages'
    
    def __str__(self):
        return f'{self.sender.username}: {self.message[:50]}...'
    
    def mark_as_read(self):
        """Mark message as read"""
        self.is_read = True
        self.save(update_fields=['is_read'])


class TypingIndicator(models.Model):
    """Track who is currently typing in a chat room"""
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE)
    is_typing = models.BooleanField(default=False)
    last_typing_time = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('user', 'room')
        verbose_name = 'Typing Indicator'
        verbose_name_plural = 'Typing Indicators'
    
    def __str__(self):
        return f'{self.user.username} typing in {self.room.name}'
    
    def set_typing(self, is_typing=True):
        """Update typing status"""
        self.is_typing = is_typing
        self.save(update_fields=['is_typing', 'last_typing_time'])