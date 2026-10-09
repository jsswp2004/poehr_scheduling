from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0039_registration_resident_provider"),
        ("appointments", "0048_locations"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="facilities",
            field=models.ManyToManyField(
                blank=True,
                help_text="Facilities this user works at. Leave empty for no restriction.",
                related_name="assigned_users",
                to="appointments.facility",
            ),
        ),
    ]
