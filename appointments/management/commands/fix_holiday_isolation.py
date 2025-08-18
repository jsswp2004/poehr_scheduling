"""
Django management command to fix holiday organization isolation.
Run with: python manage.py fix_holiday_isolation
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from appointments.models import Holiday
from users.models import Organization


class Command(BaseCommand):
    help = 'Fix holiday organization isolation by migrating existing holidays'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('🔍 DRY RUN MODE - No changes will be made'))
        
        self.stdout.write('🚀 Starting Holiday Organization Isolation Fix...')
        self.stdout.write('=' * 60)
        
        # Get holidays without organization
        orphaned_holidays = Holiday.objects.filter(organization__isnull=True)
        organizations = Organization.objects.all()
        
        self.stdout.write(f"📊 Found {orphaned_holidays.count()} holidays without organization")
        self.stdout.write(f"🏢 Found {organizations.count()} organizations")
        
        if not organizations.exists():
            self.stdout.write(self.style.WARNING("⚠️  No organizations found - nothing to migrate"))
            return
        
        if not orphaned_holidays.exists():
            self.stdout.write(self.style.SUCCESS("✅ No orphaned holidays found - migration already complete!"))
            return
        
        created_count = 0
        
        try:
            with transaction.atomic():
                # Create organization-specific copies
                for holiday in orphaned_holidays:
                    self.stdout.write(f"📅 Processing: {holiday.name} ({holiday.date})")
                    
                    for org in organizations:
                        if not dry_run:
                            new_holiday, created = Holiday.objects.get_or_create(
                                organization=org,
                                name=holiday.name,
                                date=holiday.date,
                                defaults={
                                    'is_recognized': holiday.is_recognized,
                                    'suppressed': holiday.suppressed
                                }
                            )
                            if created:
                                created_count += 1
                                self.stdout.write(f"   ✅ Created for {org.name}")
                            else:
                                self.stdout.write(f"   ⚠️  Already exists for {org.name}")
                        else:
                            self.stdout.write(f"   📝 Would create for {org.name}")
                            created_count += 1
                
                # Delete orphaned holidays
                if not dry_run:
                    deleted_count = orphaned_holidays.count()
                    orphaned_holidays.delete()
                    self.stdout.write(f"🗑️  Deleted {deleted_count} orphaned holidays")
                else:
                    self.stdout.write(f"🗑️  Would delete {orphaned_holidays.count()} orphaned holidays")
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"❌ Error during migration: {e}"))
            return
        
        self.stdout.write('=' * 60)
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f"🔍 DRY RUN: Would create {created_count} organization-specific holidays"))
            self.stdout.write("Run without --dry-run to apply changes")
        else:
            self.stdout.write(self.style.SUCCESS(f"🎉 Migration completed successfully!"))
            self.stdout.write(self.style.SUCCESS(f"📊 Created {created_count} organization-specific holidays"))
            self.stdout.write("✅ Holidays are now properly isolated by organization")
