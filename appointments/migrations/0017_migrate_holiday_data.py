# Data migration to assign existing holidays to organizations

from django.db import migrations


def assign_holidays_to_organizations(apps, schema_editor):
    """Assign existing holidays to all organizations."""
    Holiday = apps.get_model('appointments', 'Holiday')
    Organization = apps.get_model('users', 'Organization')
    
    # Get holidays without organization
    orphaned_holidays = Holiday.objects.filter(organization__isnull=True)
    organizations = Organization.objects.all()
    
    print(f"Found {orphaned_holidays.count()} holidays without organization")
    print(f"Found {organizations.count()} organizations")
    
    if not organizations.exists():
        print("No organizations found - skipping migration")
        return
    
    created_count = 0
    
    # Create organization-specific copies of holidays
    for holiday in orphaned_holidays:
        for org in organizations:
            # Check if this holiday already exists for this organization
            if not Holiday.objects.filter(
                organization=org,
                name=holiday.name,
                date=holiday.date
            ).exists():
                Holiday.objects.create(
                    organization=org,
                    name=holiday.name,
                    date=holiday.date,
                    is_recognized=holiday.is_recognized,
                    suppressed=holiday.suppressed
                )
                created_count += 1
    
    # Delete orphaned holidays
    deleted_count = orphaned_holidays.count()
    orphaned_holidays.delete()
    
    print(f"Created {created_count} organization-specific holidays")
    print(f"Deleted {deleted_count} orphaned holidays")


def reverse_holiday_migration(apps, schema_editor):
    """Reverse the holiday organization assignment."""
    # This is optional - you could implement a reverse operation here
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0016_add_organization_to_holiday'),
    ]

    operations = [
        migrations.RunPython(
            assign_holidays_to_organizations,
            reverse_holiday_migration,
        ),
    ]
