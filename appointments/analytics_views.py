from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.db import models
from django.db.models import Q, Count, Avg, Sum
from django.utils.dateparse import parse_date
from django.utils import timezone
from datetime import datetime, timedelta
from django.http import HttpResponse
import csv
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.units import inch
import io

from .models import Appointment, Availability
from users.models import CustomUser


class AnalyticsReportView(APIView):
    """
    Main analytics view that generates data for various reports based on report_type.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        report_type = request.query_params.get('report_type')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        provider_id = request.query_params.get('provider_id')

        # Parse dates
        start_dt = None
        end_dt = None
        if start_date:
            start_dt = parse_date(start_date)
            if start_dt:
                start_dt = timezone.make_aware(datetime.combine(start_dt, datetime.min.time()))
        
        if end_date:
            end_dt = parse_date(end_date)
            if end_dt:
                end_dt = timezone.make_aware(datetime.combine(end_dt, datetime.max.time()))

        # Filter by organization
        user = request.user
        if user.role == 'system_admin':
            appointments = Appointment.objects.all()
            availabilities = Availability.objects.all()
        else:
            appointments = Appointment.objects.filter(organization=user.organization)
            availabilities = Availability.objects.filter(organization=user.organization)

        # Apply date filters
        if start_dt:
            appointments = appointments.filter(appointment_datetime__gte=start_dt)
            availabilities = availabilities.filter(start_time__gte=start_dt)
        if end_dt:
            appointments = appointments.filter(appointment_datetime__lte=end_dt)
            availabilities = availabilities.filter(start_time__lte=end_dt)

        # Apply provider filter
        if provider_id and provider_id != 'all':
            appointments = appointments.filter(provider_id=provider_id)
            availabilities = availabilities.filter(doctor_id=provider_id)

        # Generate report data based on type
        try:
            data = self._generate_report_data(report_type, appointments, availabilities, user)
            return Response({
                'report_type': report_type,
                'data': data,
                'filters': {
                    'start_date': start_date,
                    'end_date': end_date,
                    'provider_id': provider_id
                }
            })
        except Exception as e:
            return Response({
                'error': f'Failed to generate report: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _generate_report_data(self, report_type, appointments, availabilities, user):
        """Generate specific report data based on report type."""
        
        if report_type == 'Upcoming Appointments Report':
            now = timezone.now()
            upcoming = appointments.filter(
                appointment_datetime__gt=now,
                status__in=['scheduled', 'pending']
            ).order_by('appointment_datetime')
            
            return [{
                'id': apt.id,
                'patient_name': f"{apt.patient.first_name} {apt.patient.last_name}",
                'provider_name': f"Dr. {apt.provider.first_name} {apt.provider.last_name}" if apt.provider else 'TBD',
                'title': apt.title,
                'datetime': apt.appointment_datetime.strftime('%Y-%m-%d %H:%M'),
                'duration': apt.duration_minutes,
                'status': apt.status
            } for apt in upcoming[:100]]  # Limit to 100 records

        elif report_type == 'Past Appointments Report':
            now = timezone.now()
            past = appointments.filter(
                appointment_datetime__lt=now
            ).order_by('-appointment_datetime')
            
            return [{
                'id': apt.id,
                'patient_name': f"{apt.patient.first_name} {apt.patient.last_name}",
                'provider_name': f"Dr. {apt.provider.first_name} {apt.provider.last_name}" if apt.provider else 'TBD',
                'title': apt.title,
                'datetime': apt.appointment_datetime.strftime('%Y-%m-%d %H:%M'),
                'duration': apt.duration_minutes,
                'status': apt.status
            } for apt in past[:100]]

        elif report_type == 'Provider Schedule Report':
            # Group appointments by provider
            providers = {}
            for apt in appointments.select_related('provider'):
                if not apt.provider:
                    continue
                provider_key = f"Dr. {apt.provider.first_name} {apt.provider.last_name}"
                if provider_key not in providers:
                    providers[provider_key] = []
                providers[provider_key].append({
                    'patient_name': f"{apt.patient.first_name} {apt.patient.last_name}",
                    'title': apt.title,
                    'datetime': apt.appointment_datetime.strftime('%Y-%m-%d %H:%M'),
                    'duration': apt.duration_minutes,
                    'status': apt.status
                })
            return providers

        elif report_type == 'Appointment Status Report':
            # Status breakdown
            status_counts = appointments.values('status').annotate(count=Count('id'))
            total = sum(item['count'] for item in status_counts)
            
            return {
                'summary': [{
                    'status': item['status'],
                    'count': item['count'],
                    'percentage': round((item['count'] / total) * 100, 1) if total > 0 else 0
                } for item in status_counts],
                'total': total
            }

        elif report_type == 'New Patient Registrations':
            # Get patients from appointments in date range
            patient_ids = appointments.values_list('patient_id', flat=True).distinct()
            patients = CustomUser.objects.filter(
                id__in=patient_ids,
                role='patient'
            ).order_by('-date_joined')
            
            return [{
                'id': patient.id,
                'name': f"{patient.first_name} {patient.last_name}",
                'email': patient.email,
                'registration_date': patient.date_joined.strftime('%Y-%m-%d'),
                'appointment_count': appointments.filter(patient=patient).count()
            } for patient in patients[:100]]

        elif report_type == 'Blocked Time Slots':
            blocked = availabilities.filter(is_blocked=True).order_by('start_time')
            
            return [{
                'id': avail.id,
                'doctor_name': f"Dr. {avail.doctor.first_name} {avail.doctor.last_name}",
                'start_time': avail.start_time.strftime('%Y-%m-%d %H:%M'),
                'end_time': avail.end_time.strftime('%Y-%m-%d %H:%M'),
                'duration_hours': round((avail.end_time - avail.start_time).total_seconds() / 3600, 2)
            } for avail in blocked[:100]]

        elif report_type == 'Appointment Recurrence Report':
            recurring = appointments.exclude(recurrence='none').order_by('appointment_datetime')
            
            return [{
                'id': apt.id,
                'patient_name': f"{apt.patient.first_name} {apt.patient.last_name}",
                'provider_name': f"Dr. {apt.provider.first_name} {apt.provider.last_name}" if apt.provider else 'TBD',
                'title': apt.title,
                'recurrence': apt.recurrence,
                'start_date': apt.appointment_datetime.strftime('%Y-%m-%d'),
                'end_date': apt.recurrence_end_date.strftime('%Y-%m-%d') if apt.recurrence_end_date else 'Ongoing'
            } for apt in recurring[:100]]

        elif report_type == 'Appointment Duration Summary':
            # Duration statistics
            duration_stats = appointments.aggregate(
                avg_duration=Avg('duration_minutes'),
                total_duration=Sum('duration_minutes'),
                min_duration=models.Min('duration_minutes'),
                max_duration=models.Max('duration_minutes')
            )
            
            # Duration distribution
            duration_groups = {
                '15-30 min': appointments.filter(duration_minutes__lte=30).count(),
                '31-60 min': appointments.filter(duration_minutes__gt=30, duration_minutes__lte=60).count(),
                '61-90 min': appointments.filter(duration_minutes__gt=60, duration_minutes__lte=90).count(),
                '90+ min': appointments.filter(duration_minutes__gt=90).count()
            }
            
            return {
                'statistics': {
                    'average_duration': round(duration_stats['avg_duration'] or 0, 1),
                    'total_duration_hours': round((duration_stats['total_duration'] or 0) / 60, 1),
                    'min_duration': duration_stats['min_duration'] or 0,
                    'max_duration': duration_stats['max_duration'] or 0,
                    'total_appointments': appointments.count()
                },
                'distribution': duration_groups
            }

        elif report_type == 'Appointment Volume Trends':
            # Get appointment volume trends over time
            from django.db.models import Count
            from django.utils import timezone
            from datetime import timedelta
            
            # Use start_dt and end_dt from the parsed parameters
            if not start_dt:
                start_dt = timezone.now() - timedelta(days=30)
            if not end_dt:
                end_dt = timezone.now()
            
            # Get daily appointment counts for the date range
            daily_counts = appointments.extra(
                select={'day': 'date(appointment_datetime)'}
            ).values('day').annotate(
                count=Count('id')
            ).order_by('day')
            
            # Fill in missing days with 0 counts
            current_date = start_dt.date()
            end_date = end_dt.date()
            trend_data = []
            daily_dict = {item['day']: item['count'] for item in daily_counts}
            
            while current_date <= end_date:
                date_str = current_date.strftime('%Y-%m-%d')
                trend_data.append({
                    'date': date_str,
                    'count': daily_dict.get(current_date, 0)
                })
                current_date += timedelta(days=1)
            
            return {
                'trend_data': trend_data,
                'total_appointments': appointments.count(),
                'average_daily': round(appointments.count() / max(1, (end_date - start_dt.date()).days + 1), 1)
            }

        elif report_type == 'No-Show & Cancellation Rate':
            # Calculate no-show and cancellation rates
            total_appointments = appointments.count()
            scheduled_count = appointments.filter(status='scheduled').count()
            completed_count = appointments.filter(status='completed').count()
            cancelled_count = appointments.filter(status='cancelled').count()
            no_show_count = appointments.filter(status='no_show').count()
            
            return {
                'totals': {
                    'total_appointments': total_appointments,
                    'scheduled': scheduled_count,
                    'completed': completed_count,
                    'cancelled': cancelled_count,
                    'no_show': no_show_count
                },
                'rates': {
                    'completion_rate': round((completed_count / max(1, total_appointments)) * 100, 1),
                    'cancellation_rate': round((cancelled_count / max(1, total_appointments)) * 100, 1),
                    'no_show_rate': round((no_show_count / max(1, total_appointments)) * 100, 1),
                    'scheduled_rate': round((scheduled_count / max(1, total_appointments)) * 100, 1)
                }
            }

        elif report_type == 'Provider Utilization Report':
            # Calculate provider utilization rates
            from django.db.models import Sum
            
            utilization_data = []
            providers_list = appointments.values_list('provider', flat=True).distinct()
            
            for provider_id in providers_list:
                if provider_id:  # Skip None values
                    provider_appointments = appointments.filter(provider_id=provider_id)
                    provider = provider_appointments.first().provider if provider_appointments.exists() else None
                    
                    if provider:
                        total_duration = provider_appointments.aggregate(
                            total=Sum('duration_minutes')
                        )['total'] or 0
                        
                        completed_appointments = provider_appointments.filter(status='completed').count()
                        total_appointments = provider_appointments.count()
                        
                        utilization_data.append({
                            'provider_name': f"Dr. {provider.first_name} {provider.last_name}",
                            'total_appointments': total_appointments,
                            'completed_appointments': completed_appointments,
                            'total_hours': round(total_duration / 60, 1),
                            'completion_rate': round((completed_appointments / max(1, total_appointments)) * 100, 1)
                        })
            
            return {
                'provider_utilization': sorted(utilization_data, key=lambda x: x['total_appointments'], reverse=True)
            }

        elif report_type == 'Patient Visit Frequency':
            # Analyze patient visit frequency patterns
            from django.db.models import Count
            
            patient_visits = appointments.values('patient').annotate(
                visit_count=Count('id')
            ).order_by('-visit_count')
            
            frequency_groups = {
                '1 visit': patient_visits.filter(visit_count=1).count(),
                '2-3 visits': patient_visits.filter(visit_count__gte=2, visit_count__lte=3).count(),
                '4-5 visits': patient_visits.filter(visit_count__gte=4, visit_count__lte=5).count(),
                '6+ visits': patient_visits.filter(visit_count__gte=6).count()
            }
            
            # Get top frequent patients
            top_patients = []
            for patient_data in patient_visits[:10]:  # Top 10
                try:
                    patient = patient_data['patient']
                    if hasattr(patient, 'first_name'):
                        patient_name = f"{patient.first_name} {patient.last_name}"
                    else:
                        patient_name = f"Patient {patient_data['patient']}"
                    
                    top_patients.append({
                        'patient_name': patient_name,
                        'visit_count': patient_data['visit_count']
                    })
                except:
                    continue
            
            return {
                'frequency_distribution': frequency_groups,
                'top_frequent_patients': top_patients,
                'total_unique_patients': patient_visits.count()
            }

        elif report_type == 'New vs. Returning Patients':
            # Analyze new vs returning patient patterns
            from django.db.models import Min
            
            # Get each patient's first appointment date
            patient_first_appointments = appointments.values('patient').annotate(
                first_appointment=Min('datetime')
            )
            
            new_patients = []
            returning_patients = []
            
            for patient_data in patient_first_appointments:
                first_date = patient_data['first_appointment'].date()
                patient_appointments = appointments.filter(patient=patient_data['patient'])
                
                if start_date <= first_date <= end_date:
                    # Patient is new in this period
                    new_patients.append({
                        'patient_id': patient_data['patient'],
                        'first_appointment': first_date.strftime('%Y-%m-%d'),
                        'total_appointments': patient_appointments.count()
                    })
                else:
                    # Patient is returning
                    period_appointments = patient_appointments.filter(
                        datetime__date__gte=start_date,
                        datetime__date__lte=end_date
                    ).count()
                    
                    if period_appointments > 0:
                        returning_patients.append({
                            'patient_id': patient_data['patient'],
                            'appointments_in_period': period_appointments
                        })
            
            return {
                'new_patients': {
                    'count': len(new_patients),
                    'patients': new_patients[:20]  # Top 20
                },
                'returning_patients': {
                    'count': len(returning_patients),
                    'patients': returning_patients[:20]  # Top 20
                },
                'ratio': {
                    'new_percentage': round((len(new_patients) / max(1, len(new_patients) + len(returning_patients))) * 100, 1),
                    'returning_percentage': round((len(returning_patients) / max(1, len(new_patients) + len(returning_patients))) * 100, 1)
                }
            }

        elif report_type == 'Appointment Lead Time Analysis':
            # Analyze how far in advance appointments are booked
            from django.utils import timezone
            import pytz
            
            lead_times = []
            for appointment in appointments:
                if hasattr(appointment, 'created_at') and appointment.created_at:
                    # Calculate lead time in days
                    lead_time = (appointment.datetime.date() - appointment.created_at.date()).days
                    lead_times.append(lead_time)
            
            if lead_times:
                avg_lead_time = sum(lead_times) / len(lead_times)
                
                # Group by lead time ranges
                lead_time_groups = {
                    'Same day': len([lt for lt in lead_times if lt == 0]),
                    '1-3 days': len([lt for lt in lead_times if 1 <= lt <= 3]),
                    '4-7 days': len([lt for lt in lead_times if 4 <= lt <= 7]),
                    '1-2 weeks': len([lt for lt in lead_times if 8 <= lt <= 14]),
                    '2+ weeks': len([lt for lt in lead_times if lt > 14])
                }
            else:
                avg_lead_time = 0
                lead_time_groups = {
                    'Same day': 0, '1-3 days': 0, '4-7 days': 0, 
                    '1-2 weeks': 0, '2+ weeks': 0
                }
            
            return {
                'average_lead_time_days': round(avg_lead_time, 1),
                'lead_time_distribution': lead_time_groups,
                'total_analyzed': len(lead_times)
            }

        elif report_type == 'Patient Demographic Breakdown':
            # Analyze patient demographics (basic version)
            from django.db.models import Count
            from datetime import date
            
            # Get unique patients in the appointment data
            unique_patients = appointments.values('patient').distinct()
            total_patients = unique_patients.count()
            
            # Gender distribution (if available in patient model)
            gender_data = {'Unknown': total_patients}  # Default fallback
            
            # Age groups (if birth date available)
            age_groups = {
                'Under 18': 0,
                '18-30': 0,
                '31-50': 0,
                '51-65': 0,
                'Over 65': 0,
                'Unknown': total_patients
            }
            
            # Try to get actual demographic data if fields exist
            try:
                from users.models import CustomUser
                patients = CustomUser.objects.filter(
                    id__in=[p['patient'] for p in unique_patients],
                    role='patient'
                )
                
                # Reset counters
                age_groups = {
                    'Under 18': 0, '18-30': 0, '31-50': 0, 
                    '51-65': 0, 'Over 65': 0, 'Unknown': 0
                }
                
                for patient in patients:
                    # Calculate age if birth_date exists
                    if hasattr(patient, 'birth_date') and patient.birth_date:
                        today = date.today()
                        age = today.year - patient.birth_date.year - ((today.month, today.day) < (patient.birth_date.month, patient.birth_date.day))
                        
                        if age < 18:
                            age_groups['Under 18'] += 1
                        elif 18 <= age <= 30:
                            age_groups['18-30'] += 1
                        elif 31 <= age <= 50:
                            age_groups['31-50'] += 1
                        elif 51 <= age <= 65:
                            age_groups['51-65'] += 1
                        else:
                            age_groups['Over 65'] += 1
                    else:
                        age_groups['Unknown'] += 1
                        
            except Exception as e:
                # Fallback if patient model doesn't have demographic fields
                age_groups['Unknown'] = total_patients
            
            return {
                'total_patients': total_patients,
                'age_distribution': age_groups,
                'appointment_frequency': {
                    'single_visit': appointments.values('patient').annotate(count=Count('id')).filter(count=1).count(),
                    'multiple_visits': appointments.values('patient').annotate(count=Count('id')).filter(count__gt=1).count()
                }
            }

        elif report_type == 'Blocked vs. Booked Time Comparison':
            # Compare blocked time slots vs booked appointments
            from django.db.models import Sum
            
            # Get booked appointment time
            booked_duration = appointments.aggregate(
                total=Sum('duration_minutes')
            )['total'] or 0
            
            # Get blocked time slots (from availability model)
            blocked_duration = 0
            try:
                from .models import Availability
                blocked_slots = Availability.objects.filter(
                    doctor__in=appointments.values_list('doctor', flat=True).distinct(),
                    date__gte=start_date,
                    date__lte=end_date,
                    is_blocked=True
                )
                
                for slot in blocked_slots:
                    if hasattr(slot, 'start_time') and hasattr(slot, 'end_time'):
                        # Calculate duration in minutes
                        start_datetime = timezone.datetime.combine(slot.date, slot.start_time)
                        end_datetime = timezone.datetime.combine(slot.date, slot.end_time)
                        duration = (end_datetime - start_datetime).total_seconds() / 60
                        blocked_duration += duration
                        
            except Exception as e:
                blocked_duration = 0
            
            total_time = booked_duration + blocked_duration
            
            return {
                'booked_time': {
                    'minutes': booked_duration,
                    'hours': round(booked_duration / 60, 1),
                    'percentage': round((booked_duration / max(1, total_time)) * 100, 1)
                },
                'blocked_time': {
                    'minutes': blocked_duration,
                    'hours': round(blocked_duration / 60, 1),
                    'percentage': round((blocked_duration / max(1, total_time)) * 100, 1)
                },
                'total_time_hours': round(total_time / 60, 1),
                'efficiency_ratio': round(booked_duration / max(1, blocked_duration), 2) if blocked_duration > 0 else 'N/A'
            }

        else:
            return {'error': 'Unknown report type'}


class ExportReportView(APIView):
    """
    Export reports as CSV or PDF
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        export_format = request.data.get('format')  # 'csv' or 'pdf'
        report_type = request.data.get('report_type')
        report_data = request.data.get('data')
        
        if export_format == 'csv':
            return self._export_csv(report_type, report_data)
        elif export_format == 'pdf':
            return self._export_pdf(report_type, report_data)
        else:
            return Response({
                'error': 'Invalid export format'
            }, status=status.HTTP_400_BAD_REQUEST)

    def _export_csv(self, report_type, data):
        """Export data as CSV"""
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{report_type.replace(" ", "_").lower()}.csv"'
        
        writer = csv.writer(response)
        
        # Write headers and data based on report type
        if report_type in ['Upcoming Appointments Report', 'Past Appointments Report']:
            writer.writerow(['Patient Name', 'Provider', 'Title', 'Date & Time', 'Duration (min)', 'Status'])
            for item in data:
                writer.writerow([
                    item['patient_name'],
                    item['provider_name'],
                    item['title'],
                    item['datetime'],
                    item['duration'],
                    item['status']
                ])
                
        elif report_type == 'Provider Schedule Report':
            writer.writerow(['Provider', 'Patient', 'Title', 'Date & Time', 'Duration (min)', 'Status'])
            for provider, appointments in data.items():
                for apt in appointments:
                    writer.writerow([
                        provider,
                        apt['patient_name'],
                        apt['title'],
                        apt['datetime'],
                        apt['duration'],
                        apt['status']
                    ])
                    
        elif report_type == 'Appointment Status Report':
            writer.writerow(['Status', 'Count', 'Percentage'])
            for item in data['summary']:
                writer.writerow([item['status'], item['count'], f"{item['percentage']}%"])
                
        elif report_type == 'New Patient Registrations':
            writer.writerow(['Patient Name', 'Email', 'Registration Date', 'Appointment Count'])
            for item in data:
                writer.writerow([
                    item['name'],
                    item['email'],
                    item['registration_date'],
                    item['appointment_count']
                ])
                
        elif report_type == 'Blocked Time Slots':
            writer.writerow(['Doctor', 'Start Time', 'End Time', 'Duration (hours)'])
            for item in data:
                writer.writerow([
                    item['doctor_name'],
                    item['start_time'],
                    item['end_time'],
                    item['duration_hours']
                ])
                
        elif report_type == 'Appointment Recurrence Report':
            writer.writerow(['Patient', 'Provider', 'Title', 'Recurrence', 'Start Date', 'End Date'])
            for item in data:
                writer.writerow([
                    item['patient_name'],
                    item['provider_name'],
                    item['title'],
                    item['recurrence'],
                    item['start_date'],
                    item['end_date']
                ])
                
        elif report_type == 'Appointment Duration Summary':
            writer.writerow(['Metric', 'Value'])
            stats = data['statistics']
            writer.writerow(['Average Duration (min)', stats['average_duration']])
            writer.writerow(['Total Duration (hours)', stats['total_duration_hours']])
            writer.writerow(['Min Duration (min)', stats['min_duration']])
            writer.writerow(['Max Duration (min)', stats['max_duration']])
            writer.writerow(['Total Appointments', stats['total_appointments']])
            
            writer.writerow([])  # Empty row
            writer.writerow(['Duration Range', 'Count'])
            for range_name, count in data['distribution'].items():
                writer.writerow([range_name, count])
                
        elif report_type == 'Appointment Volume Trends':
            writer.writerow(['Date', 'Appointment Count'])
            for item in data['trend_data']:
                writer.writerow([item['date'], item['count']])
            writer.writerow([])  # Empty row
            writer.writerow(['Total Appointments', data['total_appointments']])
            writer.writerow(['Average Daily', data['average_daily']])
            
        elif report_type == 'No-Show & Cancellation Rate':
            writer.writerow(['Status', 'Count', 'Percentage'])
            totals = data['totals']
            rates = data['rates']
            writer.writerow(['Total', totals['total_appointments'], '100%'])
            writer.writerow(['Completed', totals['completed'], f"{rates['completion_rate']}%"])
            writer.writerow(['Scheduled', totals['scheduled'], f"{rates['scheduled_rate']}%"])
            writer.writerow(['Cancelled', totals['cancelled'], f"{rates['cancellation_rate']}%"])
            writer.writerow(['No Show', totals['no_show'], f"{rates['no_show_rate']}%"])
            
        elif report_type == 'Provider Utilization Report':
            writer.writerow(['Provider', 'Total Appointments', 'Completed', 'Total Hours', 'Completion Rate'])
            for provider in data['provider_utilization']:
                writer.writerow([
                    provider['provider_name'],
                    provider['total_appointments'],
                    provider['completed_appointments'],
                    provider['total_hours'],
                    f"{provider['completion_rate']}%"
                ])
                
        elif report_type == 'Patient Visit Frequency':
            writer.writerow(['Frequency Group', 'Patient Count'])
            for group, count in data['frequency_distribution'].items():
                writer.writerow([group, count])
            writer.writerow([])  # Empty row
            writer.writerow(['Top Frequent Patients'])
            writer.writerow(['Patient Name', 'Visit Count'])
            for patient in data['top_frequent_patients']:
                writer.writerow([patient['patient_name'], patient['visit_count']])
                
        elif report_type == 'New vs. Returning Patients':
            writer.writerow(['Patient Type', 'Count', 'Percentage'])
            writer.writerow(['New Patients', data['new_patients']['count'], f"{data['ratio']['new_percentage']}%"])
            writer.writerow(['Returning Patients', data['returning_patients']['count'], f"{data['ratio']['returning_percentage']}%"])
            writer.writerow([])  # Empty row
            writer.writerow(['New Patients Details'])
            writer.writerow(['Patient ID', 'First Appointment', 'Total Appointments'])
            for patient in data['new_patients']['patients']:
                writer.writerow([patient['patient_id'], patient['first_appointment'], patient['total_appointments']])
                
        elif report_type == 'Appointment Lead Time Analysis':
            writer.writerow(['Metric', 'Value'])
            writer.writerow(['Average Lead Time (days)', data['average_lead_time_days']])
            writer.writerow(['Total Analyzed', data['total_analyzed']])
            writer.writerow([])  # Empty row
            writer.writerow(['Lead Time Range', 'Count'])
            for range_name, count in data['lead_time_distribution'].items():
                writer.writerow([range_name, count])
                
        elif report_type == 'Patient Demographic Breakdown':
            writer.writerow(['Age Group', 'Count'])
            for age_group, count in data['age_distribution'].items():
                writer.writerow([age_group, count])
            writer.writerow([])  # Empty row
            writer.writerow(['Visit Frequency'])
            writer.writerow(['Single Visit Patients', data['appointment_frequency']['single_visit']])
            writer.writerow(['Multiple Visit Patients', data['appointment_frequency']['multiple_visits']])
            writer.writerow(['Total Unique Patients', data['total_patients']])
            
        elif report_type == 'Blocked vs. Booked Time Comparison':
            writer.writerow(['Time Type', 'Hours', 'Minutes', 'Percentage'])
            writer.writerow(['Booked Time', data['booked_time']['hours'], data['booked_time']['minutes'], f"{data['booked_time']['percentage']}%"])
            writer.writerow(['Blocked Time', data['blocked_time']['hours'], data['blocked_time']['minutes'], f"{data['blocked_time']['percentage']}%"])
            writer.writerow([])  # Empty row
            writer.writerow(['Total Time (hours)', data['total_time_hours']])
            writer.writerow(['Efficiency Ratio', data['efficiency_ratio']])
        
        return response

    def _export_pdf(self, report_type, data):
        """Export data as PDF"""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        
        # Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=16,
            spaceAfter=30,
        )
        
        # Build the PDF content
        story = []
        
        # Title
        title = Paragraph(report_type, title_style)
        story.append(title)
        story.append(Spacer(1, 12))
        
        # Generate timestamp
        timestamp = timezone.now().strftime('%Y-%m-%d %H:%M:%S')
        story.append(Paragraph(f"Generated on: {timestamp}", styles['Normal']))
        story.append(Spacer(1, 20))
        
        # Content based on report type
        if report_type in ['Upcoming Appointments Report', 'Past Appointments Report']:
            table_data = [['Patient', 'Provider', 'Title', 'Date & Time', 'Duration', 'Status']]
            for item in data[:50]:  # Limit for PDF
                table_data.append([
                    item['patient_name'],
                    item['provider_name'],
                    item['title'],
                    item['datetime'],
                    f"{item['duration']} min",
                    item['status']
                ])
                
        elif report_type == 'Appointment Status Report':
            table_data = [['Status', 'Count', 'Percentage']]
            for item in data['summary']:
                table_data.append([item['status'], str(item['count']), f"{item['percentage']}%"])
                
        elif report_type == 'New Patient Registrations':
            table_data = [['Patient', 'Email', 'Registration Date', 'Appointments']]
            for item in data[:50]:
                table_data.append([
                    item['name'],
                    item['email'],
                    item['registration_date'],
                    str(item['appointment_count'])
                ])
                
        elif report_type == 'Blocked Time Slots':
            table_data = [['Doctor', 'Start Time', 'End Time', 'Duration']]
            for item in data[:50]:
                table_data.append([
                    item['doctor_name'],
                    item['start_time'],
                    item['end_time'],
                    f"{item['duration_hours']} hrs"
                ])
                
        elif report_type == 'Appointment Duration Summary':
            stats = data['statistics']
            story.append(Paragraph("Statistics Summary:", styles['Heading2']))
            stats_text = f"""
            Average Duration: {stats['average_duration']} minutes<br/>
            Total Duration: {stats['total_duration_hours']} hours<br/>
            Min Duration: {stats['min_duration']} minutes<br/>
            Max Duration: {stats['max_duration']} minutes<br/>
            Total Appointments: {stats['total_appointments']}
            """
            story.append(Paragraph(stats_text, styles['Normal']))
            story.append(Spacer(1, 20))
            
            story.append(Paragraph("Duration Distribution:", styles['Heading2']))
            table_data = [['Duration Range', 'Count']]
            for range_name, count in data['distribution'].items():
                table_data.append([range_name, str(count)])
        else:
            table_data = [['Error', 'Unsupported report type']]
        
        # Create table if we have table_data
        if 'table_data' in locals():
            table = Table(table_data)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 14),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(table)
        
        # Build PDF
        doc.build(story)
        buffer.seek(0)
        
        response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{report_type.replace(" ", "_").lower()}.pdf"'
        
        return response
