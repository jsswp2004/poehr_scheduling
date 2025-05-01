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
        provider = validated_data.pop('provider', None)  # remove from validated_data if not present
        user = CustomUser.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', 'patient'),
        )

        # Only assign provider if the user is a patient and provider is supplied
        if user.role == 'patient' and provider:
            user.provider = provider
            user.save()

        return user
