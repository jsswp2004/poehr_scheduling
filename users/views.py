from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny

from .models import CustomUser
from .serializers import UserSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .token_serializers import CustomTokenObtainPairSerializer

class DoctorListView(APIView):
    permission_classes = [AllowAny]
    # permission_classes = [IsAuthenticated]

    def get(self, request):
        doctors = CustomUser.objects.filter(role='doctor')
        serializer = UserSerializer(doctors, many=True)
        return Response(serializer.data)
    
class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = UserSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_patients(request):
    """
    Return a list of users with the role 'patient'.
    Only accessible by users with role 'doctor'.
    """
    user = request.user
    if user.role != 'doctor':
        return Response({'detail': 'Access denied'}, status=403)

    patients = CustomUser.objects.filter(role='patient')
    serializer = UserSerializer(patients, many=True)
    return Response(serializer.data)
