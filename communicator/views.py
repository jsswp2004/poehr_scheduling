from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser
import csv

from .models import Contact
from .serializers import ContactSerializer
from .utils import send_sms, send_email


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
                    send_sms(contact.phone, message)
                except Exception:
                    pass
            if send_email_flag and contact.email:
                try:
                    send_email(contact.email, subject, message)
                except Exception:
                    pass

        return Response({'sent': contacts.count()})
