from rest_framework import serializers
from .models import CustomUser

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = (
            'id', 'username', 'email', 'password',
            'first_name', 'last_name', 'role', 'provider'
        )
        extra_kwargs = {
            'password': {'write_only': True},
            'provider': {'required': False, 'allow_null': True}
        }

def create(self, validated_data):
    provider_id = validated_data.pop('provider', None)

    user = CustomUser.objects.create_user(
        username=validated_data['username'],
        email=validated_data['email'],
        password=validated_data['password'],
        first_name=validated_data.get('first_name', ''),
        last_name=validated_data.get('last_name', ''),
        role=validated_data.get('role', 'patient'),
    )

    if user.role == 'patient' and provider_id:
        try:
            provider = CustomUser.objects.get(id=provider_id)
            user.provider = provider
            user.save()
        except CustomUser.DoesNotExist:
            pass  # Optional: handle the case if the doctor ID is invalid

    return user

