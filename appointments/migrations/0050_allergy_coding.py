from django.db import migrations, models


class Migration(migrations.Migration):
    """Coded allergy entries: category, code system + code, reactions and type."""

    dependencies = [
        ("appointments", "0049_chart_tab_layouts"),
    ]

    operations = [
        migrations.AddField(
            model_name="patientallergy",
            name="category",
            field=models.CharField(blank=True, max_length=15),
        ),
        migrations.AddField(
            model_name="patientallergy",
            name="code_system",
            field=models.CharField(blank=True, max_length=10),
        ),
        migrations.AddField(
            model_name="patientallergy",
            name="code",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="patientallergy",
            name="reaction_type",
            field=models.CharField(default="allergy", max_length=12),
        ),
        migrations.AddField(
            model_name="patientallergy",
            name="reactions",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
