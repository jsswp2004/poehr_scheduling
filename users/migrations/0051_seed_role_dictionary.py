from django.db import migrations

BUILT_IN_ROLES = [
    ("patient", "Patient"),
    ("receptionist", "Receptionist"),
    ("doctor", "Doctor"),
    ("nurse", "Nurse"),
    ("admin", "Admin"),
    ("registrar", "Registrar"),
    ("system_admin", "System Admin"),
    ("staff", "Staff"),
]


def seed(apps, schema_editor):
    Dictionary = apps.get_model("users", "Dictionary")
    Entry = apps.get_model("users", "DictionaryEntry")
    roles, _ = Dictionary.objects.get_or_create(
        code="roles",
        defaults={"name": "Roles", "used_by": "Create Profile, Team, user lists", "display_type": "dropdown"},
    )
    for i, (value, label) in enumerate(BUILT_IN_ROLES):
        Entry.objects.get_or_create(
            dictionary=roles, value=value,
            defaults={"label": label, "behaves_like": value, "sort_order": i * 10, "is_locked": True},
        )


class Migration(migrations.Migration):
    dependencies = [("users", "0050_system_dictionaries")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
