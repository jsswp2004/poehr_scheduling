#!/usr/bin/env python
"""
Script to create the cron.py file
"""

cron_content = '''from django_cron import CronJobBase, Schedule
from django.utils import timezone
from django.core.mail import send_mail
from django.core.cache import cache
from datetime import timedelta
from .models import Appointment, AutoEmail

def send_patient_reminders():
    """Send patient reminders based on AutoEmail configuration."""
    today = timezone.now().date()
    next_week = today + timedelta(days=7)
    
    # Get all active AutoEmail configurations
    active_configs = AutoEmail.objects.filter(is_active=True)
    
    if not active_configs.exists():
        print("No active AutoEmail configurations found.")
        return
    
    emailed_patients = cache.get('emailed_patients_today', set())
    new_emailed_patients = set(emailed_patients)
    
    appointments = Appointment.objects.filter(
        appointment_datetime__date__gte=today,
        appointment_datetime__date__lte=next_week
    ).select_related('patient')
    
    for appt in appointments:
        patient = appt.patient
        if not patient or not patient.email or patient.id in emailed_patients:
            continue
            
        subject = "Visit reminder"
        appt_date = appt.appointment_datetime.strftime('%A, %B %d, %Y at %I:%M %p')
        message = f"Hi {patient.first_name}, This is a reminder of your visit on: {appt_date}. Please arrive 15 minutes early. See you soon!"
        
        try:
            send_mail(
                subject,
                message,
                None,
                [patient.email],
                fail_silently=False,
            )
            new_emailed_patients.add(patient.id)
            print(f"Sent reminder to {patient.email}")
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
'''

# Write the file
with open('appointments/cron.py', 'w', encoding='utf-8') as f:
    f.write(cron_content)

print("Created appointments/cron.py successfully")
