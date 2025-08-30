#!/usr/bin/env python3
"""
Quick script to check Tribeca Clinic's subscription tier in the database
"""
import os
import sys
import django

# Add the project directory to Python path
sys.path.append("/c/Users/jsswp/POWER/poehr_scheduling")

# Setup Django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "patient_scheduling.settings")
django.setup()

from users.models import Organization, CustomUser


def check_tribeca_clinic():
    print("🔍 Checking Tribeca Clinic's subscription tier in database...")
    print("=" * 60)

    try:
        # Find Tribeca Clinic
        tribeca = Organization.objects.filter(name__icontains="tribeca").first()

        if tribeca:
            print(f"✅ Found organization: {tribeca.name}")
            print(f"📋 Organization ID: {tribeca.id}")
            print(f"💳 Subscription Tier: {tribeca.subscription_tier}")
            print(f"🏢 Is Active: {tribeca.is_active}")
            print(f"📅 Created: {tribeca.created_at}")
            print(f"🔄 Updated: {tribeca.updated_at}")

            # Check users in this organization
            users = tribeca.users.all()
            print(f"\n👥 Users in {tribeca.name}:")
            for user in users:
                print(
                    f"   - {user.username} ({user.first_name} {user.last_name}) - Role: {user.role}"
                )
                print(f"     Subscription Tier: {user.subscription_tier}")

            # Check for admin users specifically
            admin_users = tribeca.users.filter(role__in=["admin", "system_admin"])
            print(f"\n🔑 Admin users in {tribeca.name}:")
            for admin in admin_users:
                print(
                    f"   - {admin.username} - Subscription: {admin.subscription_tier}"
                )
                print(f"     Stripe Customer ID: {admin.stripe_customer_id}")

        else:
            print("❌ Tribeca Clinic not found in database")
            print("\n📋 All organizations in database:")
            orgs = Organization.objects.all()
            for org in orgs:
                print(f"   - {org.name} (ID: {org.id}) - Plan: {org.subscription_tier}")

    except Exception as e:
        print(f"❌ Error checking database: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    check_tribeca_clinic()
