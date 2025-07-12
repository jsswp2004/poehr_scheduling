#!/usr/bin/env python
"""
Debug script to directly test the recurrence logic.
"""
import os
import sys
import django
from datetime import datetime, timedelta

# Add the project directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Set Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from appointments.models import Appointment, EnvironmentSetting, Holiday
from users.models import CustomUser, Organization
from django.utils import timezone
from dateutil.relativedelta import relativedelta

def debug_recurrence_logic():
    """Debug the recurrence logic step by step."""
    print("🔍 Debugging recurring appointment creation...")
    
    try:
        org = Organization.objects.first()
        doctor = CustomUser.objects.filter(role='doctor', organization=org).first()
        patient = CustomUser.objects.filter(role='patient', organization=org).first()
        
        if not all([org, doctor, patient]):
            print("❌ Missing required objects")
            return
            
        print(f"✅ Objects found: {org.name}, {doctor.get_full_name()}, {patient.get_full_name()}")
        
        # Create a test appointment with recurrence
        appointment_time = timezone.now() + timedelta(days=1)
        recurrence_end = appointment_time.date() + timedelta(days=10)
        
        print(f"📅 Creating appointment at {appointment_time} with end date {recurrence_end}")
        
        appointment = Appointment.objects.create(
            patient=patient,
            provider=doctor,
            organization=org,
            title="Debug Recurring Test",
            description="Testing recurrence logic",
            appointment_datetime=appointment_time,
            duration_minutes=30,
            recurrence='weekly',
            recurrence_end_date=recurrence_end
        )
        
        print(f"✅ Created appointment: {appointment.id}")
        print(f"🔍 Appointment recurrence: '{appointment.recurrence}'")
        print(f"🔍 Appointment recurrence_end_date: {appointment.recurrence_end_date}")
        
        # Now manually run the recurrence logic
        print("\n🚀 Running recurrence logic manually...")
        
        recurrence = appointment.recurrence
        print(f"🔍 Recurrence value: '{recurrence}' (type: {type(recurrence)})")
        
        if recurrence and recurrence != 'none':
            print("✅ Recurrence condition passed")
            start_time = appointment.appointment_datetime
            duration = appointment.duration_minutes
            recurrence_end_date = appointment.recurrence_end_date
            
            print(f"🔍 Start time: {start_time}")
            print(f"🔍 Duration: {duration}")
            print(f"🔍 End date: {recurrence_end_date}")
            
            # Fetch blocked days and holidays
            try:
                env = EnvironmentSetting.objects.first()
                blocked_days = env.blocked_days if env else []
                print(f"🔍 Blocked days: {blocked_days}")
            except Exception as e:
                blocked_days = []
                print(f"⚠️ Error fetching blocked days: {e}")
                
            holidays = set(
                Holiday.objects.filter(is_recognized=True, suppressed=False).values_list('date', flat=True)
            )
            print(f"🔍 Holidays: {len(holidays)} holidays found")
            
            repeats = {
                'daily': 179,
                'weekly': 59,
                'monthly': 11,
            }
            count = repeats.get(recurrence, 0)
            print(f"🔍 Recurrence count: {count}")
            
            created_count = 0
            for i in range(1, count + 1):
                if recurrence == 'daily':
                    next_time = start_time + timedelta(days=i)
                elif recurrence == 'weekly':
                    next_time = start_time + timedelta(weeks=i)
                elif recurrence == 'monthly':
                    next_time = start_time + relativedelta(months=i)
                else:
                    continue
                
                print(f"🔍 Iteration {i}: next_time = {next_time}")
                
                # Stop if recurrence_end_date is set and we're past it
                if recurrence_end_date and next_time.date() > recurrence_end_date:
                    print(f"🛑 Stopping: {next_time.date()} > {recurrence_end_date}")
                    break
                    
                # Skip weekends
                if next_time.weekday() in (5, 6):
                    print(f"⏭️ Skipping weekend: {next_time.strftime('%A')}")
                    continue
                    
                # Skip blocked days
                if next_time.weekday() in blocked_days:
                    print(f"⏭️ Skipping blocked day: {next_time.weekday()}")
                    continue
                    
                # Skip holidays
                if next_time.date() in holidays:
                    print(f"⏭️ Skipping holiday: {next_time.date()}")
                    continue
                    
                # Deduplication
                exists = Appointment.objects.filter(
                    provider=doctor,
                    appointment_datetime=next_time,
                    patient=appointment.patient,
                    title=appointment.title
                ).exists()
                
                if exists:
                    print(f"⏭️ Skipping duplicate: {next_time}")
                    continue
                    
                # Create the appointment
                print(f"✅ Creating appointment at {next_time}")
                Appointment.objects.create(
                    patient=appointment.patient,
                    title=appointment.title,
                    description=appointment.description,
                    appointment_datetime=next_time,
                    duration_minutes=duration,
                    recurrence='none',  # Prevent chaining
                    provider=doctor,
                    organization=org
                )
                created_count += 1
                
            print(f"🎉 Created {created_count} recurring appointments")
            
        else:
            print("❌ Recurrence condition failed")
            
        # Clean up
        print("\n🧹 Cleaning up...")
        Appointment.objects.filter(title__contains="Debug Recurring Test").delete()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_recurrence_logic()
