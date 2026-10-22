from django.db import migrations, models

# The two note types that existed before the picker came from the dictionary. They must stay
# valid values: every signed note carries one of them.
LEGACY = [
    ("nursing_assessment", "Nursing Assessment", "nurse", 110),
    ("doctor_assessment", "Doctor Assessment", "doctor", 120),
]


def seed_legacy_note_types(apps, schema_editor):
    Dictionary = apps.get_model("appointments", "Dictionary")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    d, _ = Dictionary.objects.get_or_create(
        code="note_types",
        defaults={"name": "Note types", "description": "Categories offered in the Note type picker of every note template."},
    )
    for value, label, role, order in LEGACY:
        item, created = DictionaryItem.objects.get_or_create(
            dictionary=d, value=value, defaults={"label": label, "sort_order": order, "author_role": role}
        )
        if not created and not item.author_role:
            item.author_role = role
            item.save(update_fields=["author_role"])


class Migration(migrations.Migration):
    dependencies = [("appointments", "0067_note_template_note_type")]

    operations = [
        migrations.AddField(
            model_name="dictionaryitem",
            name="author_role",
            field=models.CharField(
                blank=True,
                choices=[("", "Anyone"), ("doctor", "Doctor"), ("nurse", "Nurse")],
                default="",
                help_text="note_types dictionary only: the role allowed to write this type of note; blank = anyone",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="clinicalnote",
            name="note_type",
            field=models.CharField(max_length=100),
        ),
        migrations.RunPython(seed_legacy_note_types, migrations.RunPython.noop),
    ]
