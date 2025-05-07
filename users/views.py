from rest_framework import generics, filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.generics import RetrieveAPIView, RetrieveUpdateAPIView
from django.contrib.auth import update_session_auth_hash
from django.db.models import Q
from twilio.rest import Client
from django.conf import settings
from twilio.rest import Client
import os

from .models import CustomUser, Patient
from .serializers import UserSerializer, PatientSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .token_serializers import CustomTokenObtainPairSerializer

TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.getenv('TWILIO_PHONE_NUMBER')  # optional

client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)


class UserDetailView(RetrieveUpdateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'pk'
    lookup_url_kwarg = 'pk'
    def patch(self, request, *args, **kwargs):
        print("PATCH data:", request.data)
        print("FILES:", request.FILES)
        return super().patch(request, *args, **kwargs)

class PatientUpdateView(RetrieveUpdateAPIView):
    queryset = Patient.objects.select_related('user')
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'user__id'
    lookup_url_kwarg = 'user_id'


class PatientDetailView(RetrieveAPIView):
    queryset = Patient.objects.select_related('user')
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'user_id'
    lookup_url_kwarg = 'user_id'


class DoctorListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        doctors = CustomUser.objects.filter(role='doctor')
        serializer = UserSerializer(doctors, many=True)
        return Response(serializer.data)


class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            print("❌ Serializer validation errors:", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save()
        if user.role == 'patient':
            Patient.objects.create(user=user)
        return Response({"message": "User created successfully"}, status=status.HTTP_201_CREATED)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_patients(request):
    """
    Returns a paginated list of patients:
    - If doctor: only assigned patients
    - If registrar/admin: all patients
    Supports search and provider filtering.
    """
    user = request.user

    if user.role not in ['doctor', 'registrar', 'admin']:
        return Response({'detail': 'Access denied'}, status=403)

    if user.role == 'doctor':
        patients = Patient.objects.filter(user__provider=user)
    else:
        patients = Patient.objects.all()

    search = request.GET.get('search')
    provider_id = request.GET.get('provider')

    if search:
        patients = patients.filter(
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(user__email__icontains=search) |
            Q(user__provider__first_name__icontains=search) |
            Q(user__provider__last_name__icontains=search)
        )

    if provider_id:
        patients = patients.filter(user__provider_id=provider_id)

    paginator = PageNumberPagination()
    paginator.page_size = 25
    result_page = paginator.paginate_queryset(patients.order_by('user__last_name'), request)
    serializer = PatientSerializer(result_page, many=True)

    return paginator.get_paginated_response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')
    confirm_password = request.data.get('confirm_password')

    if not user.check_password(current_password):
        return Response({'detail': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)

    if new_password != confirm_password:
        return Response({'detail': 'New passwords do not match.'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    update_session_auth_hash(request, user)

    return Response({'detail': 'Password changed successfully.'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def search_users(request):
    query = request.GET.get('q', '')
    users = CustomUser.objects.filter(
        Q(username__icontains=query) |
        Q(email__icontains=query) |
        Q(first_name__icontains=query) |
        Q(last_name__icontains=query)
    ).distinct()
    serializer = UserSerializer(users, many=True)
    return Response(serializer.data)


class UserViewSet(viewsets.ModelViewSet):
    filter_backends = [filters.SearchFilter]
    search_fields = [
        'first_name',
        'last_name',
        'email',
        'provider__first_name',
        'provider__last_name',
        
    ]

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_sms(request):
    phone = request.data.get('phone')
    message = request.data.get('message')

    print("📨 SMS REQUEST RECEIVED:", phone, message)

    if not phone or not message:
        return Response({'error': 'Phone and message are required.'}, status=400)

    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        sent = client.messages.create(
            body=message,
            from_=TWILIO_PHONE_NUMBER,
            to=phone
        )
        print("✅ SMS SENT:", sent.sid)
        return Response({'message': 'SMS sent successfully', 'sid': sent.sid})
    except Exception as e:
        print("❌ TWILIO ERROR:", e)
        return Response({'error': str(e)}, status=500)
    
from django.core.mail import send_mail
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_sms_email(request):
    phone = request.data.get('phone')
    carrier = request.data.get('carrier')
    message = request.data.get('message')

    carrier_domains = {
        'verizon': 'vtext.com',
        'att': 'txt.att.net',
        'tmobile': 'tmomail.net',
        'sprint': 'messaging.sprintpcs.com',
    }

    if not phone or not carrier or not message:
        return Response({'error': 'Phone, carrier, and message are required.'}, status=400)

    domain = carrier_domains.get(carrier.lower())
    if not domain:
        return Response({'error': 'Unsupported carrier'}, status=400)

    to_email = f"{phone}@{domain}"

    try:
        send_mail(
            subject='',
            message=message,
            from_email=None,
            recipient_list=[to_email],
            fail_silently=False,
        )
        return Response({'message': f'SMS sent to {phone} via {carrier}'})
    except Exception as e:
        return Response({'error': str(e)}, status=500)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_patient_email(request):
    email = request.data.get('email')
    subject = request.data.get('subject', 'Message from your provider')
    message = request.data.get('message')

    if not email or not message:
        return Response({'error': 'Email and message are required.'}, status=400)

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=None,  # defaults to DEFAULT_FROM_EMAIL
            recipient_list=[email],
            fail_silently=False,
        )
        return Response({'message': 'Email sent successfully'})
    except Exception as e:
        return Response({'error': str(e)}, status=500)