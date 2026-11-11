"""Put the H&P sections back into the physician Admission Note (admission_note_2).

0101 removed the sections that were new to it (Visit Information, per-system Physical Exam, Problems 1-6, Orders
and Referrals). The intent is the opposite: everything in the New Patient Comprehensive H&P is copied into
admission_note_2, while everything the Admission Note already had (its own Review of Systems, Intake fields, etc.)
is kept. Same additive routine as 0099/0100; re-running is safe. The Problems' ICD-10 code fields are the automatic
ICD-10 picker because 0099 converted the H&P's.
"""

import importlib

from django.db import migrations


def forwards(apps, schema_editor):
    mod = importlib.import_module("appointments.migrations.0099_align_admission_note_and_icd10_fields")
    mod.align_admission_note(apps, schema_editor, admission_code="admission_note_2")
    # Any code field copied from a text-typed source becomes the picker too.
    mod.to_icd10(apps, schema_editor)


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0101_trim_admission_note_alignment"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
