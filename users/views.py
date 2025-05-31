from rest_framework import generics, filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.generics import RetrieveAPIView, RetrieveUpdateAPIView, DestroyAPIView
from rest_framework.parsers import MultiPartParser
from django.contrib.auth import update_session_auth_hash
from django.db.models import Q
from django.http import HttpResponse
from django.conf import settings
from twilio.rest import Client
import os
import csv

from .models import CustomUser, Patient
from .serializers import UserSerializer, PatientSerializer, OrganizationSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .token_serializers import CustomTokenObtainPairSerializer
from .models import Organization
from rest_framework import permissions

TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.getenv('TWILIO_PHONE_NUMBER')  # optional

client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]  # Enable file upload support
    
    def get_queryset(self):
        """
        Filter organizations based on user role:
        - system_admin: can see all organizations
        - admin/registrar: can see their own organization
        - others: can see their own organization
        """
        user = self.request.user
        if user.role == 'system_admin':
            return Organization.objects.all()
        elif user.organization:
            return Organization.objects.filter(id=user.organization.id)
        else:
            return Organization.objects.none()
    
    def perform_update(self, serializer):
        """Only allow admin and system_admin to update organizations"""
        user = self.request.user
        if user.role not in ['admin', 'system_admin']:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to edit organizations.")
        serializer.save()
    
    def perform_destroy(self, instance):
        """Only allow system_admin to delete organizations"""
        user = self.request.user
        if user.role != 'system_admin':
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You do not have permission to delete organizations.")
        instance.delete()

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
    
    def update(self, request, *args, **kwargs):
        # Print the incoming data to debug
        print("Patient Update Data:", request.data)
        print("Provider ID in request:", request.data.get('provider_id'))
        return super().update(request, *args, **kwargs)

class PatientDetailView(RetrieveAPIView):
    queryset = Patient.objects.select_related('user')
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'user_id'
    lookup_url_kwarg = 'user_id'

class DoctorListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == 'system_admin':
            doctors = CustomUser.objects.filter(role='doctor')
        else:
            doctors = CustomUser.objects.filter(role='doctor', organization=user.organization)
        serializer = UserSerializer(doctors, many=True)
        return Response(serializer.data)

class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
    
    def create(self, request, *args, **kwargs):
        print("📥 Incoming registration payload:", request.data)

        data = request.data
        
        # If the user is authenticated, use their organization
        if request.user.is_authenticated:
            # User is logged in, use their organization
            organization = request.user.organization
            print(f"📂 Using authenticated user's organization: {organization}")
        else:            # User is not logged in, use the organization_name from the form or default
            org_name = data.get('organization_name') or "Default Organization"
            organization, _ = Organization.objects.get_or_create(name=org_name)
            print(f"📂 Using organization from form: {organization}")
            
        serializer = self.get_serializer(data=data)

        # Debug validation errors in detail
        if not serializer.is_valid():
            print("❌ Serializer validation errors:", serializer.errors)
            print("❌ Registration data causing errors:", data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = serializer.save(organization=organization)
        print("✅ User created successfully:", user.username, user.email)
        return Response({"message": "User created successfully"}, status=status.HTTP_201_CREATED)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_patients(request):
    """
    Returns a paginated list of patients:
    - If doctor: only assigned patients
    - If registrar/admin: all patients in their org
    - If system_admin: all patients (all orgs)
    Supports search and provider filtering.
    """
    user = request.user

    if user.role not in ['doctor', 'registrar', 'admin', 'system_admin']:
        return Response({'detail': 'Access denied'}, status=403)

    if user.role == 'doctor':
        patients = Patient.objects.filter(user__provider=user)
    elif user.role == 'system_admin':
        patients = Patient.objects.all()
    else:
        # registrar or admin
        patients = Patient.objects.filter(user__organization=user.organization)

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
@permission_classes([IsAuthenticated])
def search_users(request):
    user = request.user
    
    # Only admin and system_admin can search users
    if user.role not in ['admin', 'system_admin']:
        return Response({'detail': 'Access denied'}, status=403)
    
    query = request.GET.get('q', '')
    
    # Base query filter for all searches
    search_filter = (
        Q(username__icontains=query) |
        Q(email__icontains=query) |
        Q(first_name__icontains=query) |
        Q(last_name__icontains=query)
    )
    
    # For system_admin, allow searching all users across organizations
    if user.role == 'system_admin':
        users = CustomUser.objects.filter(search_filter)
    # For regular admins, restrict to their organization
    else:
        users = CustomUser.objects.filter(
            search_filter,
            organization=user.organization
        )
    
    serializer = UserSerializer(users.distinct(), many=True)
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

class PatientDeleteView(DestroyAPIView):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'user_id'  # because you're deleting via user_id

class DownloadProvidersCSVTemplate(APIView):
    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="providers_template.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'username', 'email', 'first_name', 'last_name', 'organization', 'phone_number', 'provider', 'role', 'password'
        ])
        return response

class UploadProvidersCSV(APIView):
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file provided."}, status=400)
        decoded_file = file.read().decode('utf-8').splitlines()
        reader = csv.DictReader(decoded_file)
        created_count = 0
        updated_count = 0
        errors = []
        for row in reader:
            username = row.get('username', '').strip()
            email = row.get('email', '').strip()
            first_name = row.get('first_name', '').strip()
            last_name = row.get('last_name', '').strip()
            org_name = row.get('organization', '').strip()
            phone_number = row.get('phone_number', '').strip()
            provider_username = row.get('provider', '').strip()
            role = row.get('role', 'doctor').strip() or 'doctor'
            password = row.get('password', '').strip()
            if not username or not email:
                errors.append(f"Missing username or email for row: {row}")
                continue
            # Get or create organization
            org = None
            if org_name:
                org, _ = Organization.objects.get_or_create(name=org_name)
            # Get provider (if specified)
            provider = None
            if provider_username:
                try:
                    provider = CustomUser.objects.get(username=provider_username)
                except CustomUser.DoesNotExist:
                    errors.append(f"Provider '{provider_username}' not found for user '{username}'")
            # Create or update user
            user, created = CustomUser.objects.get_or_create(username=username, defaults={
                'email': email,
                'first_name': first_name,
                'last_name': last_name,
                'role': role,
                'organization': org,
                'phone_number': phone_number,
            })
            if created:
                if password:
                    user.set_password(password)
                else:
                    user.set_password('changeme123')
                user.save()
                created_count += 1
            else:
                # Update fields
                user.email = email
                user.first_name = first_name
                user.last_name = last_name
                user.role = role
                user.organization = org
                user.phone_number = phone_number
                if password:
                    user.set_password(password)
                user.save()
                updated_count += 1
            if provider:
                user.provider = provider
                user.save()
        return Response({
            "message": f"{created_count} providers created, {updated_count} updated.",
            "errors": errors
        })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Return the current user's information"""
    user = request.user
    serializer = UserSerializer(user)
    return Response(serializer.data)
