from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0048_locations"),
        ("users", "0036_ed_board_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="registration",
            name="board_custom",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.CreateModel(
            name="StatusBoardVersion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("number", models.PositiveIntegerField()),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("published", "Published"), ("archived", "Archived")],
                        default="draft",
                        max_length=10,
                    ),
                ),
                ("note", models.CharField(blank=True, max_length=300)),
                ("config", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                (
                    "author",
                    models.ForeignKey(
                        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="users.customuser"
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="status_board_versions", to="users.organization"
                    ),
                ),
                (
                    "published_by",
                    models.ForeignKey(
                        blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="users.customuser"
                    ),
                ),
                (
                    "unit",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="status_board_versions",
                        to="appointments.unit",
                    ),
                ),
            ],
            options={"ordering": ["-number"]},
        ),
    ]
