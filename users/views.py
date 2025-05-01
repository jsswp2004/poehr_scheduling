from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import CustomUser
from .serializers import UserSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .token_serializers import CustomTokenObtainPairSerializer


class DoctorListView(APIView):
    """
    Returns a list of all doctors.
    Publicly accessible for patient registration.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        doctors = CustomUser.objects.filter(role='doctor')
        serializer = UserSerializer(doctors, many=True)
        return Response(serializer.data)


class RegisterView(generics.CreateAPIView):
    """
    Handles user registration.
    """
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]  # ✅ This line is critical

class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom JWT token view that adds role and other fields to token.
    """
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_patients(request):
    """
    Returns a paginated list of patients:
    - If doctor: only assigned patients
    - If registrar: all patients
    Supports search and provider filtering.
    """
    user = request.user

    if user.role not in ['doctor', 'registrar']:
        return Response({'detail': 'Access denied'}, status=403)

    # Base queryset
    if user.role == 'doctor':
        patients = CustomUser.objects.filter(role='patient', provider=user)
    else:  # registrar
        patients = CustomUser.objects.filter(role='patient')

    # Filters
    search = request.GET.get('search')
    provider_id = request.GET.get('provider')

    if search:
        patients = patients.filter(
            first_name__icontains=search
        ) | patients.filter(
            last_name__icontains=search
        )

    if provider_id:
        patients = patients.filter(provider_id=provider_id)

    # Pagination
    paginator = PageNumberPagination()
    paginator.page_size = 25  # Default per page
    result_page = paginator.paginate_queryset(patients.order_by('last_name'), request)
    serializer = UserSerializer(result_page, many=True, context={'request': request})

    return paginator.get_paginated_response(serializer.data)

def validate(self, attrs):
    data = super().validate(attrs)
    print("Authenticated user:", self.user, "Active:", self.user.is_active, "Role:", self.user.role)
    return data
