# POWER Pharmacy, Phase 2: the clinic's own (in-house) pharmacy and its FDA License to Operate number.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0105_order_status_cancelled"),
    ]

    operations = [
        migrations.AddField(
            model_name="pharmacy",
            name="fda_lto_number",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="pharmacy",
            name="is_in_house",
            field=models.BooleanField(default=False),
        ),
    ]
