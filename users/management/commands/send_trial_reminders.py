from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from users.models import CustomUser
from communicator.utils import send_email
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Send trial reminder emails to users whose trials are expiring soon'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days-before',
            type=int,
            default=3,
            help='Send reminders X days before trial expiration (default: 3)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be sent without actually sending emails'
        )

    def handle(self, *args, **options):
        days_before = options['days_before']
        dry_run = options['dry_run']
        
        self.stdout.write(f"\n🔍 Checking for trials expiring in {days_before} days...")
        
        # Calculate the target date (X days from now)
        target_date = timezone.now().date() + timedelta(days=days_before)
        
        # Find users with trials expiring on the target date
        expiring_users = CustomUser.objects.filter(
            trial_end_date=target_date,
            subscription_status='trial',
            role__in=['admin', 'system_admin']  # Only organization admins get trial reminders
        ).exclude(email='')
        
        self.stdout.write(f"📊 Found {expiring_users.count()} users with trials expiring on {target_date}")
        
        if not expiring_users.exists():
            self.stdout.write(self.style.SUCCESS("✅ No trial reminders needed today."))
            return
        
        sent_count = 0
        error_count = 0
        
        for user in expiring_users:
            try:
                if dry_run:
                    self.stdout.write(f"[DRY RUN] Would send reminder to: {user.email} ({user.organization.name})")
                    sent_count += 1
                    continue
                
                # Send trial reminder email
                self.send_trial_reminder(user, days_before)
                sent_count += 1
                self.stdout.write(f"✅ Sent reminder to: {user.email} ({user.organization.name})")
                
            except Exception as e:
                error_count += 1
                self.stdout.write(
                    self.style.ERROR(f"❌ Failed to send reminder to {user.email}: {str(e)}")
                )
                logger.error(f"Trial reminder email failed for {user.email}: {str(e)}")
        
        # Summary
        action = "Would send" if dry_run else "Sent"
        self.stdout.write(
            self.style.SUCCESS(
                f"\n📧 {action} {sent_count} trial reminder emails"
            )
        )
        
        if error_count > 0:
            self.stdout.write(
                self.style.WARNING(f"⚠️  {error_count} emails failed to send")
            )

    def send_trial_reminder(self, user, days_before):
        """Send trial reminder email to user"""
        
        # Format trial end date
        trial_end_formatted = user.trial_end_date.strftime('%B %d, %Y')
        
        # Determine urgency level for subject
        if days_before <= 1:
            urgency = "⏰ URGENT: "
            urgency_text = "tomorrow" if days_before == 1 else "today"
        elif days_before <= 3:
            urgency = "⚠️ REMINDER: "
            urgency_text = f"in {days_before} days"
        else:
            urgency = "📅 NOTICE: "
            urgency_text = f"in {days_before} days"
        
        subject = f"{urgency}Your POWER Scheduling trial expires {urgency_text}"
        
        message = f"""
Hello {user.first_name},

Your POWER Scheduling free trial is expiring {urgency_text} on {trial_end_formatted}.

🏢 Organization: {user.organization.name}
📊 Current Plan: {user.subscription_tier.title()}
📅 Trial End Date: {trial_end_formatted}

🚀 Don't lose access to your scheduling system!

To continue using POWER Scheduling without interruption:

1. 💳 Update your payment method (if needed)
2. 📋 Review your subscription settings
3. 🔄 Your subscription will automatically continue after the trial

🔗 Manage your subscription:
• Log in at: http://127.0.0.1:3000/login
• Go to Account Settings > Subscription
• Update payment methods and billing preferences

💬 What happens next:
• If payment method is valid: Automatic conversion to paid subscription
• If payment fails: Account will be suspended until payment is resolved
• All your data and settings will be preserved

📞 Need assistance?
Our support team is here to help with:
• Payment and billing questions
• Plan upgrades or changes
• Technical support

Contact us if you have any questions or need help with your subscription.

Thank you for choosing POWER Scheduling!

Best regards,
The POWER Scheduling Team

---
This is an automated reminder. You're receiving this because your trial is expiring soon.
        """
        
        send_email(
            to_email=user.email,
            subject=subject,
            message=message.strip(),
            user=user
        )
