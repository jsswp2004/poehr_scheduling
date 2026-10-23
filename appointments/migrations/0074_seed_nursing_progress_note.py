"""Nursing Progress Note: a nurse's short bedside entry, in the order of the clinic's outline.

Date and time of entry, Subjective, Objective, Nursing Assessment, Interventions (with provider
communication), Patient Response, Follow-up Plan, Signature. One page, note type "Nursing Assessment".
Vital signs and 24-hour intake and output are "Chart data" fields (read-only). The name and time of the
signature are added by the Sign action; the nurse types only credentials. A template that already
exists is never overwritten, so re-running this never undoes a clinic's edits.
"""

from django.db import migrations

DICTIONARIES = {
    "yes_no": ("Yes / No", [("yes", "Yes"), ("no", "No")]),
    "np_entry_type": ("Nursing progress: type of entry", [
        ("routine", "Routine"), ("change_in_condition", "Change in condition"), ("event", "Event"), ("late_entry", "Late entry")]),
    "np_finding": ("Nursing progress: finding", [("normal", "Normal"), ("abnormal", "Abnormal"), ("not_assessed", "Not assessed")]),
    "np_condition": ("Nursing progress: patient's condition", [("improved", "Improved"), ("stable", "Stable"), ("declined", "Declined")]),
    "np_interventions": ("Nursing progress: interventions", [
        ("medication_given", "Medication given"), ("oxygen_applied", "Oxygen applied"), ("repositioned", "Repositioned"),
        ("wound_care", "Wound care"), ("patient_education", "Patient education"), ("fall_precautions", "Fall precautions"),
        ("fluids_diet", "Fluids or diet"), ("monitoring_increased", "Monitoring increased"), ("other", "Other")]),
    "np_contact_method": ("Nursing progress: how the provider was reached", [
        ("in_person", "In person"), ("phone", "Phone"), ("page", "Page"), ("secure_message", "Secure message")]),
    "np_response": ("Nursing progress: response to interventions", [
        ("improved", "Improved"), ("no_change", "No change"), ("worsened", "Worsened"), ("not_evaluated", "Not yet evaluated")]),
    "np_reassess": ("Nursing progress: reassess in", [
        ("15m", "15 minutes"), ("30m", "30 minutes"), ("1h", "1 hour"), ("2h", "2 hours"), ("4h", "4 hours"), ("next_shift", "Next shift")]),
}

SYSTEMS = ["Respiratory", "Cardiac", "Neurological", "GI / GU", "Skin", "Mobility"]


def F(key, label, ftype, dic=None, req=False, help="", dep=None, val=None, calc=None):
    return {"key": key, "label": label, "type": ftype, "dict": dic, "req": req, "help": help,
            "dep": dep, "val": val, "calc": calc or {}}


def slug(text):
    out = "".join(c if c.isalnum() else "_" for c in text.lower())
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


def findings():
    out = []
    for system in SYSTEMS:
        s = slug(system)
        out.append(F(f"obj_{s}", system, "radio", "np_finding"))
        out.append(F(f"obj_{s}_findings", f"{system}: findings", "text", dep=f"obj_{s}", val="abnormal"))
    return out


SECTIONS = [
    ("Date and Time of the Entry", [
        F("entry_date", "Date of entry", "date", req=True),
        F("entry_time", "Time of entry", "text", req=True, help="24-hour time, for example 14:32"),
        F("entry_type", "Type of entry", "dropdown", "np_entry_type"),
        F("event_datetime", "Date and time the event actually happened", "text", dep="entry_type", val="late_entry")]),
    ("Subjective", [
        F("subjective", "Patient's report: symptoms, concerns, quotes when significant", "textarea", req=True),
        F("subjective_unable", "If the patient could not report, why", "text")]),
    ("Objective", [
        F("chart_vitals", "Vital signs", "chart_data", calc={"source": "vitals"}),
        F("chart_io", "Intake and output", "chart_data", calc={"source": "intake_output"}),
        F("pain_score", "Pain score (0-10)", "numeric")]
        + findings() + [F("objective_other", "Other objective findings", "textarea")]),
    ("Nursing Assessment", [
        F("nursing_assessment", "Nursing assessment and interpretation", "textarea", req=True),
        F("condition", "Patient's condition", "radio", "np_condition")]),
    ("Interventions", [
        F("interventions", "Interventions performed", "multiselect", "np_interventions"),
        F("intervention_details", "Details", "textarea"),
        F("provider_notified", "Provider notified", "radio", "yes_no"),
        F("provider_name", "Provider", "text", dep="provider_notified", val="yes"),
        F("provider_time", "Time notified", "text", dep="provider_notified", val="yes", help="24-hour time"),
        F("provider_method", "How the provider was reached", "dropdown", "np_contact_method", dep="provider_notified", val="yes"),
        F("provider_orders", "Orders received", "textarea", dep="provider_notified", val="yes"),
        F("provider_readback", "Verbal order read back and confirmed", "checkbox", dep="provider_notified", val="yes")]),
    ("Patient Response", [
        F("response", "Response to interventions", "dropdown", "np_response"),
        F("response_details", "Details", "textarea")]),
    ("Follow-up Plan", [
        F("followup_plan", "Plan and next steps", "textarea", req=True),
        F("reassess_in", "Reassess in", "dropdown", "np_reassess"),
        F("handoff", "Hand off at report", "checkbox")]),
    ("Signature", [
        F("signer_credentials", "Your credentials", "text", req=True,
          help="For example RN, BSN. Your name and the time are added when you sign the note.")]),
]

CODE, NAME, NOTE_TYPE = "nursing_progress_note", "Nursing Progress Note", "nursing_assessment"


def seed(apps, schema_editor):
    Dictionary = apps.get_model("appointments", "Dictionary")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")

    dictionaries = {}
    for code, (name, items) in DICTIONARIES.items():
        dictionary, _ = Dictionary.objects.get_or_create(code=code, defaults={"name": name})
        dictionaries[code] = dictionary
        for i, (value, label) in enumerate(items):
            DictionaryItem.objects.get_or_create(dictionary=dictionary, value=value, defaults={"label": label, "sort_order": i})

    template, created = NoteTemplate.objects.get_or_create(
        code=CODE, defaults={"name": NAME, "version": 1, "is_active": True, "note_type": NOTE_TYPE})
    if not created:
        return  # a clinic already has this template: never overwrite its edits
    made, order = {}, 0
    for section, fields in SECTIONS:
        for f in fields:
            made[f["key"]] = NoteFieldDefinition.objects.create(
                template=template, key=f["key"], label=f["label"], field_type=f["type"],
                tab_label="", section_label=section, required=f["req"], sort_order=order * 10,
                help_text=f["help"], calc=f["calc"],
                dictionary=dictionaries[f["dict"]] if f["dict"] else None)
            order += 1
    for _section, fields in SECTIONS:
        for f in fields:
            if f["dep"]:
                field = made[f["key"]]
                field.depends_on = made[f["dep"]]
                field.depends_on_value = f["val"]
                field.save(update_fields=["depends_on", "depends_on_value"])


def unseed(apps, schema_editor):
    apps.get_model("appointments", "NoteTemplate").objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("appointments", "0073_seed_progress_note_acute")]
    operations = [migrations.RunPython(seed, unseed)]
