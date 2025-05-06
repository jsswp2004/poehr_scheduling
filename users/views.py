from rest_framework import generics, filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.generics import RetrieveAPIView, RetrieveUpdateAPIView
from django.contrib.auth import update_session_auth_hash
from django.db.models import Q

from .models import CustomUser, Patient
from .serializers import UserSerializer, PatientSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .token_serializers import CustomTokenObtainPairSerializer


class UserDetailView(RetrieveUpdateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'pk'
    lookup_url_kwarg = 'pk'


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
