"""Make the Admission Note consistent with the New Patient Comprehensive H&P, and turn free-text diagnosis boxes
into the automatic ICD-10 picker.

Additive only: no Admission Note field or section is removed. Existing fields keep their keys (so saved notes
and answers are untouched) and are moved into the matching H&P tab/section; H&P fields the Admission Note does
not have yet are copied in. The Review of Systems is left as the Admission Note had it. The H&P's allergy
status/details are not copied because the Admission Note already shows the chart allergy list.

The H&P (code new_patient_hp) is built by clinics in the live database, so this is a no-op where it does not exist.
Signed notes always render from their own saved template snapshot, so none of them change.
"""

import re

from django.db import migrations

HP_CODE = "new_patient_hp"
ADMISSION_CODE = "admission_note"
ROS_TAB = "Review of Systems"
SKIP_COPY = {"allergy_status", "allergy_details"}

# Where each existing Admission Note field lives in the H&P layout: key -> (tab, section).
REMAP = {
    "chief_complaint": ("Visit", "Chief Complaint"),
    "hpi": ("Visit", "History of Present Illness"),
    "past_medical_history": ("History", "Past Medical History"),
    "past_surgical_history": ("History", "Past Surgical History"),
    "family_history": ("History", "Family History"),
    "tobacco_use": ("History", "Social History"),
    "alcohol_use": ("History", "Social History"),
    "drug_use": ("History", "Social History"),
    "occupation": ("History", "Social History"),
    "living_situation": ("History", "Social History"),
    "immunization_status": ("History", "Preventive Care"),
    "current_medications": ("Medications & Allergies", "Medication Reconciliation"),
    "allergy_list": ("Medications & Allergies", "Allergies"),
    "allergies": ("Medications & Allergies", "Allergies"),
    "clinical_impression": ("Assessment & Plan", "Assessment"),
    "plan": ("Assessment & Plan", "Plan"),
    "advance_directive": ("Assessment & Plan", "Counseling and Follow-up"),
    "consent_acknowledged": ("Assessment & Plan", "Counseling and Follow-up"),
    "physical_exam": ("Physical Exam", "Physical Exam"),
}
TAB_RENAMES = {"ROS": ROS_TAB, "Vitals": "Physical Exam", "PE": "Physical Exam", "Assessment / Plan": "Assessment & Plan"}
# Admission-only sections slot in after these H&P sections.
AFTER_SECTION = {"Plan": "Problem 6", "Physical Exam": "Vital Signs"}

ICD_KEYS = {"dx_primary", "dx_other", "admission_diagnosis", "secondary_diagnosis"}
ICD_RELABEL = {
    "dx_primary": "Primary diagnosis (ICD-10)",
    "dx_other": "Other diagnoses (ICD-10)",
    "admission_diagnosis": "Admission diagnosis (ICD-10)",
    "secondary_diagnosis": "Secondary diagnosis (ICD-10)",
}
PROBLEM_ICD = re.compile(r"^problem_\d+_icd10$")


def to_icd10(apps, schema_editor):
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    touched = set()
    for f in NoteFieldDefinition.objects.filter(field_type__in=("text", "textarea")):
        if f.key in ICD_KEYS or PROBLEM_ICD.match(f.key):
            f.field_type = "icd10"
            f.dictionary = None
            f.calc = {}
            f.label = ICD_RELABEL.get(f.key, "ICD-10 diagnosis")
            f.width = "full"
            f.save()
            touched.add(f.template_id)
    for t in NoteTemplate.objects.filter(id__in=touched):
        t.version += 1
        t.save(update_fields=["version"])


def align_admission_note(apps, schema_editor, admission_code=ADMISSION_CODE):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")
    hp = NoteTemplate.objects.filter(code=HP_CODE).first()
    adm = NoteTemplate.objects.filter(code=admission_code).first()
    if hp is None or adm is None:
        return
    hp_fields = list(hp.fields.order_by("sort_order", "id"))
    adm_fields = {f.key: f for f in adm.fields.all()}
    old_order = {f.key: i for i, f in enumerate(sorted(adm_fields.values(), key=lambda f: (f.sort_order, f.id)))}

    # 1. Move the existing fields into the matching H&P tabs/sections.
    for key, f in adm_fields.items():
        if key in REMAP:
            f.tab_label, f.section_label = REMAP[key]
        elif f.tab_label in TAB_RENAMES:
            f.tab_label = TAB_RENAMES[f.tab_label]
        if f.key == "vital_bmi" or f.section_label == "Vital Signs":
            f.tab_label = "Physical Exam"
        f.save(update_fields=["tab_label", "section_label"])

    # 2. Copy the H&P fields the Admission Note lacks (not the Review of Systems), keeping conditional wiring.
    created = {}
    for hf in hp_fields:
        if hf.key in adm_fields or hf.key in SKIP_COPY or hf.tab_label == ROS_TAB:
            continue
        created[hf.key] = NoteFieldDefinition.objects.create(
            template=adm, tab_label=hf.tab_label, section_label=hf.section_label, key=hf.key, label=hf.label,
            field_type=hf.field_type, dictionary_id=hf.dictionary_id, required=hf.required, sort_order=0,
            help_text=hf.help_text, width=hf.width, calc=hf.calc, depends_on=None, depends_on_value=hf.depends_on_value,
        )
    all_adm = {**adm_fields, **created}
    hp_by_id = {hf.id: hf for hf in hp_fields}
    for hf in hp_fields:
        if hf.key in created and hf.depends_on_id and hp_by_id.get(hf.depends_on_id):
            target = all_adm.get(hp_by_id[hf.depends_on_id].key)
            if target is not None:
                created[hf.key].depends_on = target
                created[hf.key].save(update_fields=["depends_on"])

    # 3. Order: H&P tab order, then H&P section order (Admission-only sections slot in), then field order.
    tab_rank, sec_rank, key_rank = {}, {}, {}
    for i, hf in enumerate(hp_fields):
        tab_rank.setdefault(hf.tab_label, len(tab_rank))
        sec_rank.setdefault((hf.tab_label, hf.section_label), len(sec_rank))
        key_rank[hf.key] = i

    def tab_key(tab):
        return tab_rank.get(tab, 1000)

    def section_key(f):
        if f.tab_label == ROS_TAB:  # the Review of Systems keeps the Admission Note's own order
            return 1000 + old_order.get(f.key, 0)
        k = (f.tab_label, f.section_label)
        if k in sec_rank:
            return sec_rank[k]
        anchor = AFTER_SECTION.get(f.section_label)
        if anchor and (f.tab_label, anchor) in sec_rank:
            return sec_rank[(f.tab_label, anchor)] + 0.5
        return 1000 + old_order.get(f.key, 0)

    ordered = sorted(
        all_adm.values(),
        key=lambda f: (tab_key(f.tab_label), section_key(f), key_rank.get(f.key, 100000 + old_order.get(f.key, 0))),
    )
    for i, f in enumerate(ordered):
        NoteFieldDefinition.objects.filter(pk=f.pk).update(sort_order=i * 10)
    if created:
        adm.version += 1
        adm.save(update_fields=["version"])


def forwards(apps, schema_editor):
    align_admission_note(apps, schema_editor)
    to_icd10(apps, schema_editor)


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0098_flowsheet_template_tools"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
