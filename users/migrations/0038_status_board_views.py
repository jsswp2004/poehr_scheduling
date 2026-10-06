from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0037_status_board_versions"),
    ]

    operations = [
        migrations.DeleteModel(name="StatusBoardVersion"),
        migrations.CreateModel(
            name="StatusBoardSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("statuses", models.JSONField(default=list)),
                ("vitals_overdue_minutes", models.PositiveIntegerField(default=60)),
                ("custom_columns", models.JSONField(default=list)),
                ("roster", models.JSONField(default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="status_board_settings", to="users.organization"),
                ),
                (
                    "updated_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="users.customuser"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="StatusBoardView",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=60)),
                ("position", models.PositiveIntegerField(default=0)),
                ("is_default", models.BooleanField(default=False)),
                ("config", models.JSONField(default=dict)),
                ("previous_config", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "author",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to="users.customuser"),
                ),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="status_board_views", to="users.organization"),
                ),
            ],
            options={"ordering": ["position", "name"]},
        ),
        migrations.CreateModel(
            name="StatusBoardPreference",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("view_key", models.CharField(max_length=20)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="status_board_preference", to="users.customuser"),
                ),
            ],
        ),
    ]
