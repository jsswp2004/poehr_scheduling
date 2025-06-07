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
