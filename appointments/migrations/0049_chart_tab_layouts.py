from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0039_registration_resident_provider"),
        ("appointments", "0048_locations"),
    ]

    operations = [
        migrations.CreateModel(
            name="ChartTabLayout",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("care_setting", models.CharField(max_length=20)),
                ("items", models.JSONField(default=list)),
                ("default_tab", models.CharField(blank=True, max_length=30)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chart_tab_layouts", to="users.organization"),
                ),
                (
                    "user",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="chart_tab_layouts", to=settings.AUTH_USER_MODEL),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="charttablayout",
            constraint=models.UniqueConstraint(condition=models.Q(("user__isnull", True)), fields=("organization", "care_setting"), name="uniq_chart_tabs_org_default"),
        ),
        migrations.AddConstraint(
            model_name="charttablayout",
            constraint=models.UniqueConstraint(condition=models.Q(("user__isnull", False)), fields=("user", "care_setting"), name="uniq_chart_tabs_user"),
        ),
    ]
