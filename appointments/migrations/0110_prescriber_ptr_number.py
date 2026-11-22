# Philippine prescribers: the Professional Tax Receipt (PTR) number, optional, printed on prescriptions when set.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0109_orderable_formulary_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="prescriberprofile",
            name="ptr_number",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
