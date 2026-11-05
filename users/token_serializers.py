from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers

from .modules import plan_key

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        
        # Safely add user information to token
        try:
            token['username'] = user.username or ''
            token['first_name'] = user.first_name or ''
            token['last_name'] = user.last_name or ''
            token['role'] = user.role or 'none'
            
            # Safely handle organization relationship
            try:
                if user.organization:
                    token['organization_id'] = user.organization.id
                    token['organization_name'] = user.organization.name
                    # Phase 2: Add organization subscription info to token
                    token['subscription_tier'] = plan_key(user.organization.subscription_tier)
                    # Services switched on: a list of codes, or None meaning "everything".
                    token['modules'] = user.organization.enabled_modules
                    token['subscription_status'] = user.organization.subscription_status
                    token['organization_type'] = user.organization.organization_type
                else:
                    token['organization_id'] = None
                    token['organization_name'] = None
                    # Default to basic tier if no organization
                    token['subscription_tier'] = 'basic'
                    token['subscription_status'] = 'trial'
                    token['organization_type'] = 'personal'
                    token['modules'] = None
            except Exception as org_error:
                print(f"[TOKEN ERROR] Organization access failed: {org_error}")
                token['organization_id'] = None
                token['organization_name'] = None
                token['subscription_tier'] = 'basic'
                token['subscription_status'] = 'trial' 
                token['organization_type'] = 'personal'
                
        except Exception as token_error:
            print(f"[TOKEN ERROR] Token generation failed: {token_error}")
            # Continue with basic token if custom fields fail
            
        return token

    def validate(self, attrs):
        try:
            data = super().validate(attrs)

            if not self.user.is_active:
                raise serializers.ValidationError('This account is inactive.')

            # A system administrator starts every sign-in with no organization chosen; they are asked which one.
            if getattr(self.user, 'role', None) == 'system_admin' and self.user.acting_organization_id:
                type(self.user).objects.filter(pk=self.user.pk).update(acting_organization=None)

            # Optional: Debug log
            print(f"[LOGIN DEBUG] User: {self.user.username} | Active: {self.user.is_active} | Role: {self.user.role}")

            return data
            
        except Exception as validate_error:
            print(f"[VALIDATION ERROR] Login validation failed: {validate_error}")
            raise
