from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0017_reportsubscription"),
    ]

    operations = [
        migrations.AddField(
            model_name="reportsubscription",
            name="start_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="reportsubscription",
            name="frequency",
            field=models.CharField(
                choices=[("once", "Once"), ("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly")],
                default="weekly",
                max_length=10,
            ),
        ),
    ]
