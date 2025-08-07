#!/usr/bin/env python3
import os
import sys
import django

# Add the project directory to Python path
project_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(project_dir)

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization

def update_user_organization():
    """Update jsswp2004's organization to 'POWER IT'"""
    
    print("🔍 Updating jsswp2004's organization to 'POWER IT'...")
    
    try:
        # Get or create the 'POWER IT' organization
        power_it_org, created = Organization.objects.get_or_create(
            name='POWER IT',
            defaults={'name': 'POWER IT'}
        )
        
        if created:
            print(f"✅ Created new organization: {power_it_org.name} (ID: {power_it_org.id})")
        else:
            print(f"📋 Found existing organization: {power_it_org.name} (ID: {power_it_org.id})")
        
        # Find the user jsswp2004
        try:
            user = CustomUser.objects.get(username='jsswp2004')
            print(f"👤 Found user: {user.username}")
            print(f"   Current organization: {user.organization.name if user.organization else 'None'}")
            print(f"   Current role: {user.role}")
            
            # Update the user's organization
            old_org = user.organization.name if user.organization else 'None'
            user.organization = power_it_org
            user.save()
            
            print(f"✅ Successfully updated user organization!")
            print(f"   Changed from: {old_org}")
            print(f"   Changed to: {user.organization.name}")
            print(f"   Organization ID: {user.organization.id}")
            
            # Verify the change
            updated_user = CustomUser.objects.get(username='jsswp2004')
            print(f"\n🔍 Verification:")
            print(f"   Username: {updated_user.username}")
            print(f"   Email: {updated_user.email}")
            print(f"   Role: {updated_user.role}")
            print(f"   Organization: {updated_user.organization.name}")
            print(f"   Organization ID: {updated_user.organization.id}")
            
        except CustomUser.DoesNotExist:
            print("❌ User 'jsswp2004' not found!")
            print("\n📋 Available users:")
            users = CustomUser.objects.all()
            for u in users:
                org_name = u.organization.name if u.organization else 'No org'
                print(f"   - {u.username} ({u.role}) - {org_name}")
            return False
            
    except Exception as e:
        print(f"❌ Error updating organization: {e}")
        return False
    
    return True

if __name__ == "__main__":
    success = update_user_organization()
    if success:
        print("\n🎉 Organization update completed successfully!")
    else:
        print("\n💔 Organization update failed!")
        sys.exit(1)
