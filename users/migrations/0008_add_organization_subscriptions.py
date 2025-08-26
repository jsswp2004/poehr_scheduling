# Generated manually for Phase 2: Organization-based subscriptions

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_auto_20250101_0000'),  # Replace with your latest migration
    ]

    operations = [
        migrations.AddField(
            model_name='organization',
            name='subscription_status',
            field=models.CharField(
                choices=[('trial', 'Trial'), ('active', 'Active'), ('canceled', 'Canceled'), ('unpaid', 'Unpaid')],
                default='trial',
                help_text='Current subscription status for the organization',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='organization',
            name='subscription_tier',
            field=models.CharField(
                choices=[('basic', 'Professional'), ('premium', 'Clinic'), ('enterprise', 'Group')],
                default='basic',
                help_text='Subscription tier/plan for the organization',
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='organization',
            name='trial_start_date',
            field=models.DateTimeField(blank=True, help_text='When the trial period started', null=True),
        ),
        migrations.AddField(
            model_name='organization',
            name='trial_end_date',
            field=models.DateTimeField(blank=True, help_text='When the trial period ends', null=True),
        ),
        migrations.AddField(
            model_name='organization',
            name='stripe_subscription_id',
            field=models.CharField(blank=True, help_text='Stripe subscription ID for organization', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='organization',
            name='max_users',
            field=models.IntegerField(default=1, help_text='Maximum number of users allowed in this organization'),
        ),
        migrations.AddField(
            model_name='organization',
            name='organization_type',
            field=models.CharField(
                choices=[('personal', 'Personal Practice'), ('clinic', 'Clinic'), ('group', 'Group Practice')],
                default='personal',
                help_text='Type of organization',
                max_length=50,
            ),
        ),
    ]
