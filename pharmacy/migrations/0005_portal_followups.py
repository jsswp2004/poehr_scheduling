# POWER Pharmacy portal follow-ups: a pharmacist email per member, and a "released for claiming" status.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0004_pharmacy_portal'),
    ]

    operations = [
        migrations.AddField(
            model_name='partnerpharmacist',
            name='email',
            field=models.EmailField(blank=True, help_text='Portal notices are emailed to each active pharmacist', max_length=254),
        ),
        migrations.AlterField(
            model_name='portalprescription',
            name='status',
            field=models.CharField(choices=[('new', 'New'), ('in_progress', 'In progress'), ('ready', 'Ready for pickup'), ('partially_dispensed', 'Partially dispensed'), ('dispensed', 'Dispensed'), ('declined', 'Declined (back with the prescriber)'), ('released', 'Released for claiming'), ('cancelled', 'Cancelled by prescriber')], default='new', max_length=20),
        ),
    ]
