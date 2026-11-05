from django.db import migrations

# Orders and lab results, prescriptions and referrals, and triage and status boards became part of Clinical Notes.
LEGACY = {"orders_labs": "clinical_documentation", "prescriptions_referrals": "clinical_documentation",
          "triage_boards": "clinical_documentation"}


def merge(apps, schema_editor):
    Organization = apps.get_model("users", "Organization")
    for org in Organization.objects.exclude(enabled_modules__isnull=True):
        out = []
        for code in org.enabled_modules or []:
            code = LEGACY.get(code, code)
            if code not in out:
                out.append(code)
        if out != org.enabled_modules:
            org.enabled_modules = out
            org.save(update_fields=["enabled_modules"])


class Migration(migrations.Migration):
    dependencies = [("users", "0051_seed_role_dictionary")]
    operations = [migrations.RunPython(merge, migrations.RunPython.noop)]
