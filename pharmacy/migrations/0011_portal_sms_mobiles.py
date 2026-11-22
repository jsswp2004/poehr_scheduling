# POWER Pharmacy Portal: mobile numbers for new-prescription SMS (the pharmacy's and each pharmacist's).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0010_formulary_reviewer_log'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnerpharmacist',
            name='mobile',
            field=models.CharField(blank=True, help_text='Mobile number for SMS (+639...): new-prescription texts', max_length=16),
        ),
        migrations.AddField(
            model_name='partnerpharmacy',
            name='sms_mobile',
            field=models.CharField(blank=True, help_text='Mobile number for SMS (+639...): new-prescription texts when no pharmacist has a mobile', max_length=16),
        ),
    ]
