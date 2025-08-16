from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
import logging

logger = logging.getLogger(__name__)
User = get_user_model()


class AccountStatusBackend(ModelBackend):
    """Custom authentication backend that checks account status"""
    
    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            user = User.objects.get(username=username)
            
            # Check if account is cancelled
            if user.cancelled_at is not None:
                logger.warning(f"🚫 Login attempt for cancelled account: {username}")
                return None
                
            # Check if account is active
            if not user.is_active:
                logger.warning(f"🚫 Login attempt for inactive account: {username}")
                return None
                
            # Verify password using the parent method
            if user.check_password(password):
                logger.info(f"✅ Successful login for user: {username}")
                return user
                
        except User.DoesNotExist:
            logger.warning(f"🚫 Login attempt for non-existent user: {username}")
            
        return None
    
    def get_user(self, user_id):
        try:
            user = User.objects.get(pk=user_id)
            
            # Additional check for cancelled accounts during session validation
            if user.cancelled_at is not None:
                logger.warning(f"🚫 Session access denied for cancelled account: {user.username}")
                return None
                
            if not user.is_active:
                logger.warning(f"🚫 Session access denied for inactive account: {user.username}")
                return None
                
            return user
        except User.DoesNotExist:
            return None
