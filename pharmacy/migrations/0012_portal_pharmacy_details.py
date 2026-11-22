# POWER Pharmacy Portal: "Pharmacy details" (barangay; the change history with POWER review of name and LTO changes).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('pharmacy', '0011_portal_sms_mobiles'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnerpharmacy',
            name='barangay',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.CreateModel(
            name='PartnerPharmacyChange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(choices=[('contact', 'Contact details'), ('regulatory', 'Registered name / LTO')], max_length=12)),
                ('status', models.CharField(choices=[('applied', 'Applied'), ('pending', 'Pending POWER review'), ('approved', 'Approved'), ('rejected', 'Rejected')], max_length=10)),
                ('changes', models.JSONField(default=dict)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('review_note', models.CharField(blank=True, max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('partner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='changes', to='pharmacy.partnerpharmacy')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]
