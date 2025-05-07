from rest_framework import serializers
from .models import CustomUser, Patient

class UserSerializer(serializers.ModelSerializer):
    provider_name = serializers.SerializerMethodField()  # ✅ Add readable provider name
    profile_picture = serializers.ImageField(use_url=True)  # ✅ This makes it include full path

    class Meta:
        model = CustomUser
        fields = (
            'id', 'username', 'email', 'password',
            'first_name', 'last_name', 'role', 'provider', 'provider_name', 'profile_picture','phone_number'  # ✅ include provider_name
        )
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'provider': {'required': False, 'allow_null': True}
        }

    def update(self, instance, validated_data):
        profile_picture = validated_data.pop('profile_picture', None)
        print("🔥 PROFILE PICTURE RECEIVED:", profile_picture)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if profile_picture:
            instance.profile_picture = profile_picture
        instance.save()
        return instance

    def get_provider_name(self, obj):
        if obj.provider:
            return f"{obj.provider.first_name} {obj.provider.last_name}"
        return None

    def create(self, validated_data):
        provider = validated_data.pop('provider', None)

        user = CustomUser.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', 'patient'),
        )

        # ✅ Handle provider assignment correctly based on type
        if user.role == 'patient':
            if isinstance(provider, CustomUser):
                user.provider = provider
            elif isinstance(provider, int):
                try:
                    user.provider = CustomUser.objects.get(id=provider)
                except CustomUser.DoesNotExist:
                    pass  # Optionally log or raise an error
            user.save()

        return user


class PatientSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username')
    email = serializers.EmailField(source='user.email')
    first_name = serializers.CharField(source='user.first_name')
    last_name = serializers.CharField(source='user.last_name')
    provider_name = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            'id',
            'user_id',
            'username',
            'email',
            'first_name',
            'last_name',
            'provider_name',
            'date_of_birth',
            'phone_number',
            'address',
            'medical_history',
        ]

    def get_provider_name(self, obj):
        if obj.user.provider:
            return f"{obj.user.provider.first_name} {obj.user.provider.last_name}"
        return None

    def update(self, instance, validated_data):
        # Handle nested updates to the related user fields
        user_data = validated_data.pop('user', {})
        user = instance.user

        for attr, value in user_data.items():
            setattr(user, attr, value)
        user.save()

        # Handle patient fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        return instance
