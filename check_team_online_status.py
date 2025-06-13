"""
Debug script to verify online status data
"""
import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser

def check_team_members_status():
    print("=== TEAM MEMBERS ONLINE STATUS ===")
    
    # Get all non-patient users (team members)
    team_members = CustomUser.objects.exclude(role='patient').values(
        'id', 'username', 'first_name', 'last_name', 'email', 'role', 'is_online', 'last_seen'
    )
    
    online_count = 0
    offline_count = 0
    
    print(f"Total team members: {len(team_members)}")
    print("\nDetailed status:")
    
    for member in team_members:
        status = "ONLINE" if member['is_online'] else "OFFLINE"
        if member['is_online']:
            online_count += 1
        else:
            offline_count += 1
            
        name = f"{member['first_name']} {member['last_name']}".strip() or member['username']
        print(f"  👤 {name} (ID: {member['id']}) - {status}")
        if member['last_seen']:
            print(f"      Last seen: {member['last_seen']}")
    
    print(f"\nSummary:")
    print(f"  🟢 Online: {online_count}")
    print(f"  🔴 Offline: {offline_count}")
    
    return online_count, offline_count

if __name__ == "__main__":
    check_team_members_status()
