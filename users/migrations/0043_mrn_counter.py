from django.db import migrations, models


class Migration(migrations.Migration):
    """Step 1 of 3 (MRN is required): the counter that hands out MRN numbers."""

    dependencies = [("users", "0042_user_removal")]

    operations = [
        migrations.CreateModel(
            name="MRNCounter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("last_number", models.PositiveBigIntegerField(default=0)),
            ],
        ),
    ]
