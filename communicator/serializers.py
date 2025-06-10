from rest_framework import serializers
from .models import Contact


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ['id', 'name', 'phone', 'email', 'uploaded_by', 'created_at']
        read_only_fields = ['id', 'uploaded_by', 'created_at']
