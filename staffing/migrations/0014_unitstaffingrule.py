from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0031_organization_address_state"),
        ("staffing", "0013_staffshift_pickup_source"),
    ]

    operations = [
        migrations.CreateModel(
            name="UnitStaffingRule",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="unit_staffing_rules", to="users.organization")),
                ("rule", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="unit_assignments", to="staffing.staffingrule")),
                ("unit", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="staffing_rule_assignments", to="staffing.unit")),
                ("updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="unitstaffingrule",
            constraint=models.UniqueConstraint(fields=("organization", "unit"), name="staffing_unit_rule_unique"),
        ),
    ]
