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
    
    class Meta:
        model = MessageLog
        fields = ['message_type', 'created_at__gte', 'created_at__lte']


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
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=400)

        decoded = file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded)
        created = 0
        for row in reader:
            Contact.objects.create(
                uploaded_by=request.user,
                name=row.get('name', ''),
                phone=row.get('phone', ''),
                email=row.get('email', ''),
            )
            created += 1
        return Response({'created': created})


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
        # Include both user-specific emails and system-generated emails (user=None)
        # This allows admin users to see patient reminder emails and other system emails
        from django.db.models import Q
        return MessageLog.objects.filter(
            Q(user=self.request.user) | Q(user__isnull=True)
        ).order_by('-created_at')
