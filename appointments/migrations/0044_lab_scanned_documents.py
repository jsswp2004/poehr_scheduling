# Scanned lab documents: file facts on the report, the bytes in their own table.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0043_lab_reports"),
    ]

    operations = [
        migrations.AddField(
            model_name="labreport",
            name="file_content_type",
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name="labreport",
            name="file_name",
            field=models.CharField(blank=True, max_length=150),
        ),
        migrations.AddField(
            model_name="labreport",
            name="file_sha256",
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name="labreport",
            name="file_size",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.CreateModel(
            name="LabReportFileData",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("data", models.BinaryField()),
                (
                    "report",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="file_data",
                        to="appointments.labreport",
                    ),
                ),
            ],
        ),
    ]
