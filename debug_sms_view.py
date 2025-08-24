from django.http import JsonResponse
from django.utils import timezone
from datetime import timedelta
from appointments.models import Appointment, AutoEmail
from users.models import Organization
from django.contrib.auth import get_user_model


def debug_sms_data(request):
    """Debug endpoint to check SMS data in Azure"""
    try:
        today = timezone.now().date()
        next_week = today + timedelta(days=7)
        User = get_user_model()

        data = {
            "current_date": str(today),
            "date_range": f"{today} to {next_week}",
            "current_weekday": timezone.now().weekday(),
        }

        # Check AutoEmail configs
        active_configs = AutoEmail.objects.filter(is_active=True)
        data["active_configs"] = []

        for config in active_configs:
            config_data = {
                "id": config.id,
                "organization": (
                    config.organization.name if config.organization else None
                ),
                "frequency": config.auto_message_frequency,
                "day_of_week": config.auto_message_day_of_week,
                "start_date": (
                    str(config.auto_message_start_date)
                    if config.auto_message_start_date
                    else None
                ),
            }

            # Get appointments for this config
            if config.organization:
                appointments = Appointment.objects.filter(
                    appointment_datetime__date__gte=today,
                    appointment_datetime__date__lte=next_week,
                    organization=config.organization,
                ).select_related("patient")
            else:
                appointments = Appointment.objects.filter(
                    appointment_datetime__date__gte=today,
                    appointment_datetime__date__lte=next_week,
                ).select_related("patient")

            config_data["appointments_count"] = appointments.count()
            config_data["appointments"] = []

            for appt in appointments:
                patient = appt.patient
                if patient:
                    config_data["appointments"].append(
                        {
                            "id": appt.id,
                            "patient_name": f"{patient.first_name} {patient.last_name}",
                            "phone": patient.phone_number,
                            "email": patient.email,
                            "appointment_date": str(appt.appointment_datetime),
                            "title": appt.title,
                        }
                    )

            data["active_configs"].append(config_data)

        # Check total appointments in database
        all_appointments = Appointment.objects.all()
        data["total_appointments"] = all_appointments.count()

        # Check patients with phone numbers
        patients_with_phones = User.objects.filter(
            role="patient", phone_number__isnull=False
        ).exclude(phone_number="")
        data["patients_with_phones"] = patients_with_phones.count()

        return JsonResponse(data, indent=2)

    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)
