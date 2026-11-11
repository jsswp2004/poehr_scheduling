from django.db import migrations, models


class Migration(migrations.Migration):
    """A note template can be limited to chosen units from the Location Manager (default: all locations)."""

    dependencies = [
        ("appointments", "0095_seed_soap_note_templates"),
    ]

    operations = [
        migrations.AddField(
            model_name="notetemplate",
            name="all_locations",
            field=models.BooleanField(
                default=True, help_text="True = available in every location; otherwise only in `locations`"
            ),
        ),
        migrations.AddField(
            model_name="notetemplate",
            name="locations",
            field=models.ManyToManyField(
                blank=True,
                help_text="Units this template is limited to",
                related_name="note_templates",
                to="appointments.unit",
            ),
        ),
    ]
