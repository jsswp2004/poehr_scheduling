"""Apply the H&P alignment to the physician Admission Note (code admission_note_2).

0099 aligned the original nursing "admission_note", which is inactive in the live database; the Admission Note
physicians actually open is admission_note_2. Same additive rules as 0099: nothing removed, existing keys kept,
the H&P's missing sections copied in (no Review of Systems changes). Re-running is safe.
"""

import importlib

from django.db import migrations

CODE = "admission_note_2"


def forwards(apps, schema_editor):
    mod = importlib.import_module("appointments.migrations.0099_align_admission_note_and_icd10_fields")
    mod.align_admission_note(apps, schema_editor, admission_code=CODE)


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0099_align_admission_note_and_icd10_fields"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
