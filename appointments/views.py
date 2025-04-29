from rest_framework import viewsets, permissions
from .models import Appointment
from .serializers import AppointmentSerializer

class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only show the logged-in user's appointments
        return Appointment.objects.filter(patient=self.request.user)

    def perform_create(self, serializer):
        # Set the patient to the logged-in user
        serializer.save(patient=self.request.user)
