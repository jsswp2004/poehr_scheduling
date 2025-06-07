from django_cron import CronJobBase, Schedule
from django.utils import timezone
from django.core.mail import send_mail
from datetime import timedelta
from users.models import CustomUser
from .models import Appointment

def send_patient_reminders():
    today = timezone.now().date()
    next_week = today + timedelta(days=7)
    from django.core.cache import cache
    appointments = Appointment.objects.filter(
        appointment_datetime__date__gte=today,
        appointment_datetime__date__lte=next_week
    ).select_related('patient')
    emailed_patients = cache.get('emailed_patients_today', set())
    new_emailed_patients = set(emailed_patients)
    for appt in appointments:
        patient = appt.patient
        if not patient or not patient.email or patient.id in emailed_patients:
            continue
        subject = "Visit reminder"
        appt_date = appt.appointment_datetime.strftime('%A, %B %d, %Y at %I:%M %p')
        message = f"Hi {patient.first_name}, This is a reminder of your visit on: {appt_date}. Please arrive 15 minutes early. See you soon!"
        send_mail(
            subject,
            message,
            None,
            [patient.email],
            fail_silently=False,
        )
        new_emailed_patients.add(patient.id)
    cache.set('emailed_patients_today', new_emailed_patients, 24*60*60)

class BlastPatientReminderCronJob(CronJobBase):
    RUN_AT_TIMES = ['18:00']  # 6 PM
    schedule = Schedule(run_at_times=RUN_AT_TIMES)
    code = 'appointments.blast_patient_reminder_cron'  # unique code

    def do(self):
        send_patient_reminders()
