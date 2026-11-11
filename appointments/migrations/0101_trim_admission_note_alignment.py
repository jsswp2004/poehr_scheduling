"""Narrow the Admission Note / H&P alignment to the sections the Admission Note already had.

0099/0100 copied every missing H&P section into the Admission Note. The intent was only to bring the sections the
note already has in line with the H&P, so this removes just the sections that were brand new to it: Visit
Information, the per-system Physical Exam sections, Problems 1-6 and Orders and Referrals. Everything the note
originally had, and the extra fields in its existing sections (HPI details, history details, social details,
Preventive Care, Medication Reconciliation, Vital Signs, Counseling and Follow-up), stays. Re-running is safe.
"""

import re

from django.db import migrations

CODES = ("admission_note", "admission_note_2")
HP_CODE = "new_patient_hp"
ROS_TAB = "Review of Systems"
# Keys the Admission Note had before the alignment: never removed.
ORIGINAL_SHARED = {
    "chief_complaint", "hpi", "current_medications", "tobacco_use", "alcohol_use", "drug_use", "occupation",
    "living_situation", "vital_bp", "vital_hr", "vital_rr", "vital_temp", "vital_spo2", "vital_height", "vital_weight",
    "immunization_status", "advance_directive", "consent_acknowledged", "clinical_impression",
}
NEW_SECTION = re.compile(r"^(Visit Information|Physical Exam: .*|Problem \d+|Orders and Referrals)$")


def trim(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    hp = NoteTemplate.objects.filter(code=HP_CODE).first()
    if hp is None:
        return
    hp_keys = set(hp.fields.values_list("key", flat=True))
    for template in NoteTemplate.objects.filter(code__in=CODES):
        doomed = [
            f.pk
            for f in template.fields.all()
            if f.key in hp_keys and f.key not in ORIGINAL_SHARED and f.tab_label != ROS_TAB and NEW_SECTION.match(f.section_label)
        ]
        if doomed:
            template.fields.filter(pk__in=doomed).delete()
            template.version += 1
            template.save(update_fields=["version"])


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0100_align_physician_admission_note"),
    ]

    operations = [
        migrations.RunPython(trim, migrations.RunPython.noop),
    ]
