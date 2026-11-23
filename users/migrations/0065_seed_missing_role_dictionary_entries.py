from django.db import migrations

# Built-in roles that exist on CustomUser.ROLE_CHOICES but were not in the "roles" dictionary
# seeded by 0051, so they were missing from Create Profile and the dictionary maintenance page.
MISSING_ROLES = [
    ("pharmacist", "Pharmacist"),
    ("pharmacy_tech", "Pharmacy Assistant"),
    ("ext_pharmacist", "External Pharmacist"),
    ("ext_pharmacy_admin", "External Pharmacy Admin"),
    ("ext_lab_tech", "External Medical Technologist"),
    ("ext_lab_pathologist", "External Pathologist"),
    ("ext_lab_admin", "External Lab Admin"),
]


def seed(apps, schema_editor):
    Dictionary = apps.get_model("users", "Dictionary")
    Entry = apps.get_model("users", "DictionaryEntry")
    roles, _ = Dictionary.objects.get_or_create(
        code="roles",
        defaults={"name": "Roles", "used_by": "Create Profile, Team, user lists", "display_type": "dropdown"},
    )
    last = max([e.sort_order for e in Entry.objects.filter(dictionary=roles)] or [0])
    for i, (value, label) in enumerate(MISSING_ROLES, start=1):
        Entry.objects.get_or_create(
            dictionary=roles, value=value,
            defaults={"label": label, "behaves_like": value, "sort_order": last + i * 10, "is_locked": True},
        )


class Migration(migrations.Migration):
    dependencies = [("users", "0064_alter_customuser_role")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
