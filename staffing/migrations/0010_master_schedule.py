import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staffing", "0009_assistantpendingaction"),
    ]

    operations = [
        migrations.CreateModel(
            name="MasterScheduleSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("week_start", models.PositiveSmallIntegerField(default=3)),
                ("hp_values", models.JSONField(blank=True, default=list)),
                ("status_values", models.JSONField(blank=True, default=list)),
                (
                    "organization",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="master_schedule_settings",
                        to="users.organization",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="MasterScheduleSection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("level", models.PositiveSmallIntegerField(default=0)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="master_schedule_sections",
                        to="users.organization",
                    ),
                ),
            ],
            options={"ordering": ["sort_order", "id"]},
        ),
        migrations.CreateModel(
            name="MasterScheduleRow",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("hp", models.CharField(blank=True, default="", max_length=20)),
                ("status", models.CharField(blank=True, default="", max_length=20)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="master_schedule_rows",
                        to="users.organization",
                    ),
                ),
                (
                    "section",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rows",
                        to="staffing.masterschedulesection",
                    ),
                ),
                (
                    "staff",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="master_schedule_rows",
                        to="staffing.staff",
                    ),
                ),
            ],
            options={"ordering": ["sort_order", "id"]},
        ),
        migrations.CreateModel(
            name="MasterScheduleCell",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(db_index=True)),
                ("code", models.CharField(max_length=10)),
                (
                    "row",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="cells",
                        to="staffing.masterschedulerow",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="masterschedulecell",
            constraint=models.UniqueConstraint(fields=("row", "date"), name="master_schedule_cell_unique"),
        ),
    ]
