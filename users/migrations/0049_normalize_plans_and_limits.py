from django.db import migrations

PLAN_USER_LIMITS = {"basic": 1, "premium": 10, "enterprise": 999999}
DISPLAY_TO_KEY = {"Personal": "basic", "Professional": "basic", "Clinic": "premium", "Group": "enterprise"}


def normalize(apps, schema_editor):
    """
    Enrollment used to store the plan as a display name ("Clinic"), which the limits lookup did not
    recognise, so Clinic and Group organizations were stuck at one user. Store the plan key, and make sure
    no existing organization ends up over its limit when the limit starts being enforced: an organization
    keeps at least the seats it already uses.
    """
    Organization = apps.get_model("users", "Organization")
    CustomUser = apps.get_model("users", "CustomUser")
    for org in Organization.objects.all():
        tier = org.subscription_tier
        key = tier if tier in PLAN_USER_LIMITS else DISPLAY_TO_KEY.get(tier, "basic")
        in_use = CustomUser.objects.filter(organization=org, is_active=True).exclude(role="patient").count()
        limit = max(org.max_users or 0, PLAN_USER_LIMITS[key], in_use)
        if key != tier or limit != org.max_users:
            org.subscription_tier = key
            org.max_users = limit
            org.save(update_fields=["subscription_tier", "max_users"])


class Migration(migrations.Migration):
    dependencies = [("users", "0048_organization_modules")]
    operations = [migrations.RunPython(normalize, migrations.RunPython.noop)]
