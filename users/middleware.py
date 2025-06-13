from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from jwt import decode as jwt_decode
from django.conf import settings
from urllib.parse import parse_qs


class JWTAuthMiddleware(BaseMiddleware):
    """
    Custom middleware to authenticate WebSocket connections using JWT tokens.
    """

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        # Extract token from query parameters
        token = self.get_token_from_scope(scope)
        
        if token:
            try:
                # Import JWT classes inside function to avoid app loading issues
                from rest_framework_simplejwt.tokens import UntypedToken
                from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
                
                # Validate the token  
                UntypedToken(token)
                
                # Decode the token to get user information
                decoded_data = jwt_decode(
                    token, 
                    settings.SECRET_KEY, 
                    algorithms=["HS256"]
                )
                
                # Get the user
                user = await self.get_user(decoded_data['user_id'])
                scope['user'] = user
                
            except (InvalidToken, TokenError, KeyError):
                from django.contrib.auth.models import AnonymousUser
                scope['user'] = AnonymousUser()
        else:
            from django.contrib.auth.models import AnonymousUser
            scope['user'] = AnonymousUser()

        return await self.inner(scope, receive, send)

    def get_token_from_scope(self, scope):
        """Extract JWT token from query parameters"""
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        
        token_list = query_params.get('token', [])
        if token_list:
            return token_list[0]
        return None

    @database_sync_to_async
    def get_user(self, user_id):
        """Get user from database"""
        try:
            from users.models import CustomUser
            return CustomUser.objects.get(id=user_id)
        except CustomUser.DoesNotExist:
            from django.contrib.auth.models import AnonymousUser
            return AnonymousUser()


def JWTAuthMiddlewareStack(inner):
    """
    Middleware stack that includes JWT authentication
    """
    return JWTAuthMiddleware(inner)
