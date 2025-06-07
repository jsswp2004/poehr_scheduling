import os
from celery import Celery
from celery.schedules import crontab
from django.conf import settings

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')

app = Celery('poehr_scheduling')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
    
# This dictionary will be dynamically updated based on AutoEmail settings
app.conf.beat_schedule = {
    'send-weekly-patient-reminders': {
        'task': 'appointments.tasks.send_weekly_patient_reminders',
        'schedule': crontab(hour=18, minute=0, day_of_week=5),  # 18 = 6:00 PM, 5 = Friday
    },
    # Default schedule - will be modified dynamically based on settings
    'sample-email-task': {
        'task': 'appointments.tasks.send_scheduled_emails',
        'schedule': crontab(hour=8, minute=0, day_of_week=1),  # Default: Monday at 8:00 AM
        'args': ('weekly',),
    },
}

app.conf.timezone = 'UTC'
