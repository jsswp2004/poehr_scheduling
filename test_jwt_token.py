#!/usr/bin/env python
"""
Django shell script to test JWT token organization_id inclusion
Run with: docker exec -it poehr_scheduling-web-1 python manage.py shell < test_jwt_token.py
"""

print("🔍 TESTING JWT TOKEN ORGANIZATION_ID")
print("=" * 50)

from users.models import CustomUser
from users.token_serializers import CustomTokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
import jwt

# Test with different user roles
test_users = CustomUser.objects.filter(
    role__in=['admin', 'registrar', 'system_admin']
).select_related('organization')[:5]

if not test_users.exists():
    print("❌ No test users found with admin, registrar, or system_admin roles")
    print("💡 Create some test users first")
else:
    print(f"📋 Found {test_users.count()} test users")
    
    for user in test_users:
        print(f"\n👤 User: {user.username}")
        print(f"🎭 Role: {user.role}")
        print(f"🏢 Organization: {user.organization.name if user.organization else 'None'}")
        print(f"🆔 Organization ID: {user.organization.id if user.organization else 'None'}")
        
        try:
            # Generate JWT token using our custom serializer
            refresh = RefreshToken.for_user(user)
            access_token = refresh.access_token
            
            # Add custom claims
            serializer = CustomTokenObtainPairSerializer()
            token = serializer.get_token(user)
            
            # Decode the token to see what's inside
            decoded = jwt.decode(str(token), options={"verify_signature": False})
            
            print(f"✅ JWT Token generated successfully")
            print(f"📋 Token claims:")
            for key, value in decoded.items():
                if key not in ['exp', 'iat', 'jti', 'token_type']:  # Skip technical fields
                    print(f"   {key}: {value}")
            
            # Specifically check organization_id
            org_id_in_token = decoded.get('organization_id')
            expected_org_id = user.organization.id if user.organization else None
            
            if org_id_in_token == expected_org_id:
                print(f"✅ Organization ID correctly included: {org_id_in_token}")
            else:
                print(f"❌ Organization ID mismatch!")
                print(f"   Expected: {expected_org_id}")
                print(f"   In token: {org_id_in_token}")
                
        except Exception as e:
            print(f"❌ Error generating/decoding token: {e}")

print("\n" + "=" * 50)
print("🎯 JWT TOKEN TEST COMPLETE")

# Test the message filtering logic
print("\n🔍 TESTING MESSAGE LOG FILTERING")
print("=" * 50)

from communicator.models import MessageLog
from django.db.models import Q

# Check total message count
total_messages = MessageLog.objects.count()
print(f"📊 Total messages in database: {total_messages}")

if total_messages > 0:
    # Test filtering logic for each user
    for user in test_users:
        print(f"\n👤 Testing filtering for: {user.username} ({user.role})")
        
        # Simulate the filtering logic from the view
        if user.role == 'system_admin':
            filtered_messages = MessageLog.objects.all()
            scope = "All messages (system admin)"
        elif user.role in ['admin', 'registrar'] and user.organization:
            base_query = Q(user__isnull=True) | Q(user__organization=user.organization)
            filtered_messages = MessageLog.objects.filter(base_query)
            scope = f"Organization messages + system messages (org: {user.organization.name})"
        else:
            base_query = Q(user__isnull=True) | Q(user=user)
            filtered_messages = MessageLog.objects.filter(base_query)
            scope = "User messages + system messages"
        
        count = filtered_messages.count()
        print(f"📧 Messages visible: {count}")
        print(f"🔍 Scope: {scope}")
        
        # Show breakdown
        if user.role in ['admin', 'registrar'] and user.organization:
            org_messages = MessageLog.objects.filter(user__organization=user.organization).count()
            system_messages = MessageLog.objects.filter(user__isnull=True).count()
            print(f"   └─ Organization messages: {org_messages}")
            print(f"   └─ System messages: {system_messages}")
else:
    print("📭 No messages in database to test filtering")

print("\n" + "=" * 50)
print("✅ FILTERING TEST COMPLETE")
print("\n💡 Next steps:")
print("1. Log out and log back in to get new JWT token with organization_id")
print("2. Check browser console for debug messages")
print("3. Verify message filtering works as expected")
