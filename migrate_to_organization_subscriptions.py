#!/usr/bin/env python3
"""
Phase 2 Data Migration: Move User Subscriptions to Organizations
Run this after applying the organization subscription migration
"""

import os
import sys
import django

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'poehr_scheduling_backend.settings')
django.setup()

from users.models import CustomUser, Organization
from django.utils import timezone

def migrate_user_subscriptions_to_organizations():
    """
    Migrate existing user-level subscriptions to organization-level subscriptions
    """
    print("🚀 Starting Phase 2: User to Organization Subscription Migration")
    print("=" * 60)
    
    migrated_count = 0
    skipped_count = 0
    error_count = 0
    
    # Get all users with subscription data
    users_with_subscriptions = CustomUser.objects.filter(
        subscription_tier__isnull=False
    ).select_related('organization')
    
    print(f"📊 Found {users_with_subscriptions.count()} users with subscription data")
    
    for user in users_with_subscriptions:
        try:
            if not user.organization:
                print(f"⚠️  User {user.username} has no organization, skipping...")
                skipped_count += 1
                continue
                
            org = user.organization
            
            # Check if organization already has subscription data
            if org.subscription_tier and org.subscription_tier != 'basic':
                print(f"ℹ️  Organization '{org.name}' already has subscription: {org.subscription_tier}")
                skipped_count += 1
                continue
            
            print(f"\n🔄 Migrating: {user.username} → {org.name}")
            print(f"   User Tier: {user.subscription_tier}")
            print(f"   User Status: {user.subscription_status}")
            
            # Map user tier to organization tier
            tier_mapping = {
                'Personal': 'basic',
                'Clinic': 'premium', 
                'Group': 'enterprise',
                'basic': 'basic',
                'premium': 'premium',
                'enterprise': 'enterprise'
            }
            
            org_tier = tier_mapping.get(user.subscription_tier, 'basic')
            
            # Update organization subscription data
            org.subscription_tier = org_tier
            org.subscription_status = user.subscription_status or 'trial'
            org.trial_start_date = user.trial_start_date
            org.trial_end_date = user.trial_end_date
            org.stripe_subscription_id = user.stripe_subscription_id
            
            # Set organization type based on subscription tier
            if org_tier == 'basic':
                org.organization_type = 'personal'
                org.max_users = 1
            elif org_tier == 'premium':
                org.organization_type = 'clinic'
                org.max_users = 10
            else:  # enterprise
                org.organization_type = 'group'
                org.max_users = 999999
                
            org.save()
            
            print(f"   ✅ Organization updated:")
            print(f"      Tier: {org.subscription_tier}")
            print(f"      Status: {org.subscription_status}")
            print(f"      Type: {org.organization_type}")
            print(f"      Max Users: {org.max_users}")
            
            migrated_count += 1
            
        except Exception as e:
            print(f"❌ Error migrating user {user.username}: {str(e)}")
            error_count += 1
            
    print("\n" + "=" * 60)
    print("📈 Migration Summary:")
    print(f"   ✅ Successfully migrated: {migrated_count}")
    print(f"   ⏭️  Skipped: {skipped_count}")
    print(f"   ❌ Errors: {error_count}")
    print(f"   📊 Total processed: {users_with_subscriptions.count()}")
    
    if migrated_count > 0:
        print(f"\n🎉 Phase 2 migration completed successfully!")
        print(f"   Organizations now manage subscriptions for their users")
        print(f"   JWT tokens will include organization subscription data")
    
    return migrated_count > 0

if __name__ == "__main__":
    success = migrate_user_subscriptions_to_organizations()
    if success:
        print(f"\n🚀 Next steps:")
        print(f"   1. Test organization-based subscription access")
        print(f"   2. Verify analytics access control works")
        print(f"   3. Test enrollment with new organization logic")
    else:
        print(f"\n⚠️  No migrations performed. Check data and try again.")
