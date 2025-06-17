import django
import os
import sys

# Add the current directory to the Python path
sys.path.append(os.getcwd())

# Set up Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

from django.contrib.auth import get_user_model
from users.models import Profile

User = get_user_model()

print("=== CURRENT USER DEBUG ===")
print("Available users:")
for user in User.objects.all()[:5]:
    try:
        profile = Profile.objects.get(user=user)
        print(f"- {user.username} (ID: {user.id}) - {profile.first_name} {profile.last_name}")
    except Profile.DoesNotExist:
        print(f"- {user.username} (ID: {user.id}) - No profile")

print("\n=== TOKEN VERIFICATION ===")
print("To check your current user, run this in browser console:")
print("console.log('Current user:', JSON.parse(localStorage.getItem('currentUser')))")
print("console.log('Token:', localStorage.getItem('token'))")
print("console.log('WebSocket state:', websocketConnection?.readyState)")
