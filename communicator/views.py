from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
import csv

from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from .models import Contact, MessageLog
from .serializers import ContactSerializer, MessageLogSerializer
from .utils import send_sms, send_email


class MessageLogFilter(django_filters.FilterSet):
    message_type = django_filters.CharFilter(field_name='message_type')
    created_at__gte = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    organization = django_filters.NumberFilter(method='filter_by_organization')
    
    def filter_by_organization(self, queryset, name, value):
        """Filter messages by organization ID through user relationship"""
        from django.db.models import Q
        return queryset.filter(
            Q(user__organization_id=value) | Q(user__isnull=True)
        )
    
    class Meta:
        model = MessageLog
        fields = ['message_type', 'created_at__gte', 'created_at__lte', 'organization']


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Contact.objects.filter(uploaded_by=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(uploaded_by=self.request.user)


class BulkUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        try:
            file = request.FILES.get('file')
            if not file:
                return Response({'error': 'No file provided'}, status=400)

            if not file.name.endswith('.csv'):
                return Response({'error': 'File must be a CSV file'}, status=400)

            # Read and decode file with proper error handling
            try:
                decoded = file.read().decode('utf-8').splitlines()
            except UnicodeDecodeError:
                try:
                    # Try with different encoding
                    file.seek(0)  # Reset file pointer
                    decoded = file.read().decode('utf-8-sig').splitlines()
                except UnicodeDecodeError:
                    return Response({'error': 'Unable to decode file. Please ensure it is UTF-8 encoded.'}, status=400)

            if not decoded:
                return Response({'error': 'File is empty'}, status=400)

            # Parse CSV with error handling
            try:
                reader = csv.DictReader(decoded)
                
                # Validate headers
                expected_headers = {'name', 'phone', 'email'}
                actual_headers = set(reader.fieldnames or [])
                
                if not expected_headers.issubset(actual_headers):
                    missing_headers = expected_headers - actual_headers
                    return Response({
                        'error': f'Missing required headers: {", ".join(missing_headers)}. Expected: name, phone, email'
                    }, status=400)

                created = 0
                errors = []
                
                for row_num, row in enumerate(reader, start=2):  # Start at 2 because row 1 is headers
                    try:
                        # Validate required fields
                        name = row.get('name', '').strip()
                        phone = row.get('phone', '').strip()
                        email = row.get('email', '').strip()
                        
                        if not name:
                            errors.append(f'Row {row_num}: Name is required')
                            continue
                            
                        if not phone and not email:
                            errors.append(f'Row {row_num}: At least one contact method (phone or email) is required')
                            continue

                        # Create contact
                        Contact.objects.create(
                            uploaded_by=request.user,
                            name=name,
                            phone=phone,
                            email=email,
                        )
                        created += 1
                        
                    except Exception as e:
                        errors.append(f'Row {row_num}: {str(e)}')
                        continue

                # Return results
                result = {'created': created}
                if errors:
                    result['errors'] = errors
                    result['message'] = f'Partially successful: {created} contacts created, {len(errors)} errors'
                else:
                    result['message'] = f'Successfully created {created} contacts'

                return Response(result, status=200)
                
            except csv.Error as e:
                return Response({'error': f'CSV parsing error: {str(e)}'}, status=400)
                
        except Exception as e:
            # Log the full error for debugging
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Unexpected error in contact upload: {str(e)}", exc_info=True)
            
            return Response({'error': f'Upload failed: {str(e)}'}, status=500)


class SendBulkMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        message = request.data.get('message')
        subject = request.data.get('subject', 'Notification')
        send_email_flag = request.data.get('send_email', False)
        send_sms_flag = request.data.get('send_sms', True)

        contacts = Contact.objects.filter(uploaded_by=request.user)
        for contact in contacts:
            if send_sms_flag and contact.phone:
                try:
                    send_sms(contact.phone, message, user=request.user)
                except Exception:
                    pass
            if send_email_flag and contact.email:
                try:
                    send_email(contact.email, subject, message, user=request.user)
                except Exception:
                    pass

        return Response({'sent': contacts.count()})


class MessageLogViewSet(viewsets.ModelViewSet):
    serializer_class = MessageLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "delete"]
    filter_backends = [DjangoFilterBackend]
    filterset_class = MessageLogFilter

    def get_queryset(self):
        """
        Filter message logs based on user role:
        - system_admin: sees all messages
        - admin/registrar: sees only messages from their organization
        - others: sees their own messages only
        """
        from django.db.models import Q
        
        user = self.request.user
        
        if user.role == 'system_admin':
            # System admins see everything
            return MessageLog.objects.all().order_by('-created_at')
        elif user.role in ['admin', 'registrar'] and user.organization:
            # Admins and registrars see only org messages (no system messages)
            return MessageLog.objects.filter(
                user__organization=user.organization
            ).order_by('-created_at')
        else:
            # Regular users see only their own messages
            return MessageLog.objects.filter(user=user).order_by('-created_at')
