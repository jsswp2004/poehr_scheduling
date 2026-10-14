from django.db import migrations, models


class Migration(migrations.Migration):
    """Step 3 of 3: an MRN is now required and unique in the database."""

    dependencies = [("users", "0044_backfill_mrn")]

    operations = [
        migrations.AlterField(
            model_name="patient",
            name="mrn",
            field=models.CharField(editable=False, max_length=20, unique=True),
        ),
    ]
