from django_cron import CronJobBase, Schedule
from django.utils import timezone
from django.core.mail import send_mail
from communicator.utils import send_email
from django.core.cache import cache
from datetime import timedelta
from .models import Appointment, AutoEmail

def send_patient_reminders():
    """Send patient reminders based on AutoEmail configuration."""
    today = timezone.now().date()
    current_weekday = timezone.now().weekday()  # 0=Monday, 6=Sunday
    
    # Get all active AutoEmail configurations
    active_configs = AutoEmail.objects.filter(is_active=True)
    
    if not active_configs.exists():
        print("No active AutoEmail configurations found.")
        return
    
    emailed_patients = cache.get('emailed_patients_today', set())
    new_emailed_patients = set(emailed_patients)
    
    for config in active_configs:
        # Check if start date is in the future
        if config.auto_message_start_date and config.auto_message_start_date > today:
            continue
            
        # Frequency-based logic
        should_send = False
        
        if config.auto_message_frequency == 'daily':
            # Send every day - ignore day_of_week setting
            should_send = True
            print(f"Daily frequency: sending emails every day")
        elif config.auto_message_frequency == 'weekly':
            # Send weekly on the specified day
            should_send = current_weekday == config.auto_message_day_of_week
            if should_send:
                print(f"Weekly frequency: sending on {config.get_auto_message_day_of_week_display()}")
        elif config.auto_message_frequency == 'bi-weekly':
            # Send every other week on the specified day
            if current_weekday == config.auto_message_day_of_week:
                if config.auto_message_start_date:
                    days_since_start = (today - config.auto_message_start_date).days
                    weeks_since_start = days_since_start // 7
                    should_send = weeks_since_start % 2 == 0
                    print(f"Bi-weekly frequency: {weeks_since_start} weeks since start, should_send: {should_send}")
                else:
                    should_send = True  # If no start date, send every other week
                    print("Bi-weekly frequency: no start date, sending")
        elif config.auto_message_frequency == 'monthly':
            # Send monthly on the specified day (every 4 weeks)
            if current_weekday == config.auto_message_day_of_week:
                if config.auto_message_start_date:
                    days_since_start = (today - config.auto_message_start_date).days
                    weeks_since_start = days_since_start // 7
                    should_send = weeks_since_start % 4 == 0
                    print(f"Monthly frequency: {weeks_since_start} weeks since start, should_send: {should_send}")
                else:
                    should_send = True
                    print("Monthly frequency: no start date, sending")
        
        if not should_send:
            print(f"Skipping config {config.id}: frequency={config.auto_message_frequency}, weekday={current_weekday}, config_day={config.auto_message_day_of_week}")
            continue
            
        # Get appointments for next week
        next_week = today + timedelta(days=7)
        if config.organization:
            appointments = Appointment.objects.filter(
                appointment_datetime__date__gte=today,
                appointment_datetime__date__lte=next_week,
                organization=config.organization
            ).select_related('patient')
            print(f"Processing {appointments.count()} appointments for organization: {config.organization.name}")
        else:
            appointments = Appointment.objects.filter(
                appointment_datetime__date__gte=today,
                appointment_datetime__date__lte=next_week
            ).select_related('patient')
            print(f"Processing {appointments.count()} appointments (all organizations)")
        
        # Send emails
        for appt in appointments:
            patient = appt.patient
            if not patient or not patient.email or patient.id in emailed_patients:
                continue
                
            subject = "Visit reminder"
            appt_date = appt.appointment_datetime.strftime('%A, %B %d, %Y at %I:%M %p')
            message = f"Hi {patient.first_name}, This is a reminder of your visit on: {appt_date}. Please arrive 15 minutes early. See you soon!"
            
            try:
                send_email(
                    patient.email,
                    subject,
                    message,
                    user=None,
                )
                new_emailed_patients.add(patient.id)
                print(f"Sent reminder to {patient.email} for appointment on {appt_date}")
            except Exception as e:
                print(f"Failed to send email to {patient.email}: {str(e)}")
    
    cache.set('emailed_patients_today', new_emailed_patients, 24*60*60)

class BlastPatientReminderCronJob(CronJobBase):
    RUN_AT_TIMES = ['18:00']
    schedule = Schedule(run_at_times=RUN_AT_TIMES)
    code = 'appointments.blast_patient_reminder_cron'

    def do(self):
        print(f"Running cron job at {timezone.now()}")
        send_patient_reminders()
        print("Cron job completed")
