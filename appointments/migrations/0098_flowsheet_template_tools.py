from django.db import migrations, models


class Migration(migrations.Migration):
    """Flowsheet types can carry builder Tools (the first is the Allergy Manager), shown above the grid."""

    dependencies = [
        ("appointments", "0097_allergy_chart_field_in_notes"),
    ]

    operations = [
        migrations.AddField(
            model_name="flowsheettemplate",
            name="tools",
            field=models.JSONField(blank=True, default=list, help_text="Tools shown above the grid, e.g. allergy_manager"),
        ),
    ]
