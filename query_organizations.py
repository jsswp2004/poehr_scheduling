#!/usr/bin/env python3
"""
Simple script to query organizations from the POEHR scheduling database
Run this script to see all organizations in the database
"""

import os
import sys
import django

# Add the project directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set up Django environment
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "poehr_scheduling_backend.settings")
django.setup()

from users.models import Organization, CustomUser


def query_organizations():
    print("🔍 Querying Organizations Database...")
    print("=" * 60)

    # Get all organizations
    organizations = Organization.objects.all()

    print(f"📊 Total Organizations: {organizations.count()}")
    print("-" * 60)

    for i, org in enumerate(organizations, 1):
        print(f"\n{i}. Organization: {org.name}")
        print(f"   ID: {org.id}")
        print(f"   Created: {org.created_at}")
        print(f"   Logo: {org.logo.url if org.logo else 'No logo'}")

        # Count users in this organization
        user_count = CustomUser.objects.filter(organization=org).count()
        print(f"   Total Users: {user_count}")

        # Break down by role
        roles = CustomUser.objects.filter(organization=org).values_list(
            "role", flat=True
        )
        role_counts = {}
        for role in roles:
            role_counts[role] = role_counts.get(role, 0) + 1

        if role_counts:
            print(f"   User Breakdown:")
            for role, count in role_counts.items():
                print(f"     - {role}: {count}")

    print("\n" + "=" * 60)
    print("✅ Query completed!")


if __name__ == "__main__":
    query_organizations()
