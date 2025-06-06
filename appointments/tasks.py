from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import datetime, timedelta
from .models import AutoEmail, Appointment
from celery.utils.log import get_task_logger
from users.models import CustomUser

logger = get_task_logger(__name__)

@shared_task
def send_scheduled_emails(frequency='weekly'):
    """
    Send scheduled emails to patients based on frequency
    
    Args:
        frequency: 'weekly', 'bi-weekly', or 'monthly'
    """
    logger.info(f"Running scheduled email task for frequency: {frequency}")
    
    # Get all active auto email configurations that match the frequency
    auto_emails = AutoEmail.objects.filter(
        is_active=True,
        auto_message_frequency=frequency
    )
    
    if not auto_emails.exists():
        logger.info(f"No active auto email configurations found for {frequency} frequency.")
        return
    
    # Process each auto email configuration
    for config in auto_emails:
        # Check if today is the configured day of the week
        today = timezone.now().weekday()
        if today != config.auto_message_day_of_week:
            logger.info(f"Skipping auto email for organization {config.organization} - "
                       f"today is day {today}, configured for day {config.auto_message_day_of_week}")
            continue
            
        # Check if start date is in the future
        if config.auto_message_start_date and config.auto_message_start_date > timezone.now().date():
            logger.info(f"Skipping auto email for organization {config.organization} - "
                       f"start date {config.auto_message_start_date} is in the future")
            continue
            
        # Get organization
        organization = config.organization
        
        if organization:
            logger.info(f"Sending scheduled emails for organization: {organization.name}")
            # Get upcoming appointments for this organization
            upcoming_appointments = get_upcoming_appointments(organization)
            
            # Send notifications for each appointment
            for appointment in upcoming_appointments:
                send_appointment_reminder(appointment)
        else:
            logger.info("Sending scheduled emails for all organizations (global setting)")
            # Handle global settings - email for all organizations
            upcoming_appointments = get_upcoming_appointments(None)
            
            # Send notifications for each appointment
            for appointment in upcoming_appointments:
                send_appointment_reminder(appointment)
                
    logger.info(f"Completed scheduled email task for frequency: {frequency}")


def get_upcoming_appointments(organization=None):
    """
    Get upcoming appointments based on organization
    
    For weekly emails: appointments in the next 7 days
    For bi-weekly emails: appointments in the next 14 days
    For monthly emails: appointments in the next 30 days
    """
    now = timezone.now()
    tomorrow = now + timedelta(days=1)
    next_week = now + timedelta(days=7)
    
    # Get appointments between tomorrow and next week
    query = {
        'appointment_datetime__gte': tomorrow,
        'appointment_datetime__lte': next_week,
    }
    
    if organization:
        query['organization'] = organization
        
    return Appointment.objects.filter(**query).order_by('appointment_datetime')


def send_appointment_reminder(appointment):
    """
    Send a reminder email for a specific appointment
    """
    try:
        # Get patient email
        patient = appointment.patient
        if not patient or not patient.email:
            logger.error(f"Cannot send reminder for appointment {appointment.id}: No patient email available")
            return
            
        # Get doctor name
        doctor_name = "N/A"
        if appointment.provider:
            doctor_name = f"Dr. {appointment.provider.first_name} {appointment.provider.last_name}"
            
        # Format appointment date
        appointment_date = appointment.appointment_datetime.strftime("%A, %B %d, %Y at %I:%M %p")
        
        # Send email
        subject = f"Reminder: Upcoming Appointment on {appointment_date}"
        message = f"""
Hello {patient.first_name},

This is a friendly reminder about your upcoming appointment:

Date and Time: {appointment_date}
Doctor: {doctor_name}
Title: {appointment.title or 'Medical Appointment'}

If you need to reschedule, please contact us as soon as possible.

Thank you,
{appointment.organization.name if appointment.organization else 'The Medical Team'}
        """
        
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [patient.email],
            fail_silently=False,
        )
        
        logger.info(f"Reminder sent for appointment {appointment.id} to {patient.email}")
        
    except Exception as e:
        logger.error(f"Failed to send reminder for appointment {appointment.id}: {str(e)}")


@shared_task
def update_celery_beat_schedule():
    """
    Update the Celery Beat schedule based on the current auto email settings
    """
    from poehr_scheduling_backend.celery import app
    
    # Get all active auto email configurations
    auto_emails = AutoEmail.objects.filter(is_active=True)
    
    # Clear existing schedule
    app.conf.beat_schedule = {}
    
    for config in auto_emails:
        # Create a unique task name for this configuration
        org_name = config.organization.name if config.organization else "global"
        task_name = f"send-emails-{org_name}-{config.auto_message_frequency}"
        
        # Convert day_of_week from 0-6 (Sunday-Saturday) to crontab format
        day_of_week = config.auto_message_day_of_week
        
        # Add to beat schedule
        app.conf.beat_schedule[task_name] = {
            'task': 'appointments.tasks.send_scheduled_emails',
            'schedule': crontab(hour=8, minute=0, day_of_week=day_of_week),
            'args': (config.auto_message_frequency,),
        }
    
    logger.info(f"Updated Celery Beat schedule with {len(auto_emails)} auto email configurations")


@shared_task
def send_weekly_patient_reminders():
    """
    Send weekly reminders to patients with appointments in the next 7 days
    """
    today = timezone.now().date()
    next_week = today + timedelta(days=7)
    # Find patients with appointments in the next 7 days
    patient_ids = Appointment.objects.filter(
        appointment_datetime__date__gte=today,
        appointment_datetime__date__lte=next_week
    ).values_list('patient_id', flat=True).distinct()
    # Fetch patient emails
    recipients = CustomUser.objects.filter(
        id__in=patient_ids,
        role='patient',
        email__isnull=False
    ).values_list('email', flat=True)
    # Send email to each patient
    for email in recipients:
        send_mail(
            subject="Upcoming Appointment Reminder",
            message="You have an appointment scheduled in the next 7 days.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
