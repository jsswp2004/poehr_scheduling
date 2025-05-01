from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

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


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom JWT token view that adds role and other fields to token.
    """
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_patients(request):
    """
    Return a list of patients assigned to the logged-in doctor.
    Only accessible by users with role 'doctor'.
    """
    user = request.user
    if user.role != 'doctor':
        return Response({'detail': 'Access denied'}, status=403)

    # ✅ Only get patients assigned to this doctor
    patients = CustomUser.objects.filter(role='patient', provider=user)
    serializer = UserSerializer(patients, many=True)
    return Response(serializer.data)

def validate(self, attrs):
    data = super().validate(attrs)
    print("Authenticated user:", self.user, "Active:", self.user.is_active, "Role:", self.user.role)
    return data
