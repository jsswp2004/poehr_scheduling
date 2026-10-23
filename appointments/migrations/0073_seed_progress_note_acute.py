"""Progress Note (Acute): a physician's daily inpatient note, built from a clinic's own section list.

Five tabs (Subjective, Objective, Devices, Assessment & Plan, Attestation), note type "Progress".
Vital signs, 24-hour intake and output, active medication orders, labs and the problem list are
"Chart data" fields: read-only, with the server keeping a snapshot in the note. Everything else is an
ordinary field the clinic can edit in the Note Builder. A template that already exists is never
overwritten, so re-running this never undoes a clinic's edits.
"""

from django.db import migrations

DICTIONARIES = {
    "yes_no": ("Yes / No", [("yes", "Yes"), ("no", "No")]),
    "amb_ros_status": ("Ambulatory: review of systems", [("negative", "Negative"), ("positive", "Positive"), ("not_reviewed", "Not reviewed")]),
    "amb_exam_status": ("Ambulatory: exam finding", [("normal", "Normal"), ("abnormal", "Abnormal"), ("not_examined", "Not examined")]),
    "acute_service": ("Acute care: service", [
        ("medicine", "Medicine"), ("surgery", "Surgery"), ("cardiology", "Cardiology"), ("cardiothoracic", "Cardiothoracic"),
        ("neurology", "Neurology"), ("orthopedics", "Orthopedics"), ("ob_gyn", "OB/GYN"), ("pediatrics", "Pediatrics"),
        ("psychiatry", "Psychiatry"), ("icu", "ICU"), ("other", "Other")]),
}

ROS_SYSTEMS = [
    "General", "Skin", "Breast", "Eye", "Ear", "Nose", "Mouth/Throat", "Respiratory", "Cardiovascular",
    "Gastrointestinal", "Genitourinary", "Gynecological", "Neurological", "Psychiatric", "Musculoskeletal",
    "Heme/Lymph", "Endocrine", "All Other Systems",
]
EXAM_SYSTEMS = [
    "General", "Head, eyes, ears, nose and throat", "Neck", "Cardiovascular", "Respiratory", "Abdomen",
    "Extremities", "Musculoskeletal", "Neurological", "Skin", "Psychiatric",
]


def F(key, label, ftype, dic=None, req=False, help="", dep=None, val=None, calc=None):
    return {"key": key, "label": label, "type": ftype, "dict": dic, "req": req, "help": help,
            "dep": dep, "val": val, "calc": calc or {}}


def chart(key, label, source):
    return F(key, label, "chart_data", calc={"source": source})


def slug(text):
    out = "".join(c if c.isalnum() else "_" for c in text.lower())
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


def ros_fields():
    out = [F("ros_not_obtained", "Reason ROS not obtained", "text")]
    for system in ROS_SYSTEMS:
        s = slug(system)
        out.append(F(f"ros_{s}_status", system, "radio", "amb_ros_status"))
        out.append(F(f"ros_{s}_findings", f"{system}: positive findings", "text", dep=f"ros_{s}_status", val="positive"))
    return out


def exam_fields():
    out = []
    for system in EXAM_SYSTEMS:
        s = slug(system)
        out.append(F(f"pe_{s}_status", system, "radio", "amb_exam_status"))
        out.append(F(f"pe_{s}_findings", f"{system}: findings", "text", dep=f"pe_{s}_status", val="abnormal"))
    out.append(F("pe_comments", "Physical examination comments", "textarea"))
    return out


def device(prefix, label, req, *extras):
    """A Yes/No device line; each extra (suffix, label) opens when the answer is Yes."""
    out = [F(prefix, label, "radio", "yes_no", req=req)]
    for suffix, extra_label in extras:
        out.append(F(f"{prefix}_{suffix}", extra_label, "text", dep=prefix, val="yes"))
    return out


def problem_pairs():
    out = []
    for n in range(1, 11):
        out.append(F(f"problem_{n}", f"Problem {n}", "text", req=(n == 1), dep=(f"problem_{n - 1}_more" if n > 1 else None), val=("yes" if n > 1 else None)))
        out.append(F(f"plan_{n}", f"Assessment and plan {n}", "textarea", req=(n == 1), dep=(f"problem_{n - 1}_more" if n > 1 else None), val=("yes" if n > 1 else None)))
        if n < 10:
            out.append(F(f"problem_{n}_more", "Add another problem", "radio", "yes_no", dep=(f"problem_{n - 1}_more" if n > 1 else None), val=("yes" if n > 1 else None)))
    return out


# (tab, section, [fields])
SECTIONS = [
    ("Subjective", "Service", [F("service", "Service", "dropdown", "acute_service", req=True)]),
    ("Subjective", "Reason for Admission / Subjective", [
        F("reason_for_admission", "Reason for admission", "textarea", req=True),
        F("subjective", "Subjective: interval events and patient complaints", "textarea", req=True)]),
    ("Subjective", "Length of Stay", [F("los_days", "Length of stay (days)", "numeric")]),
    ("Subjective", "ROS", ros_fields()),
    ("Objective", "Chart Review (VS / I&O)", [
        chart("chart_vitals", "Vital signs", "vitals"), chart("chart_io", "Intake and output", "intake_output")]),
    ("Objective", "Physical Examination", exam_fields()),
    ("Objective", "Active Medications", [
        chart("active_meds", "Active medication orders", "inpatient_meds"),
        F("high_risk_meds", "High-risk medications for the elderly prescribed?", "radio", "yes_no"),
        F("high_risk_which", "Which, and why", "text", dep="high_risk_meds", val="yes")]),
    ("Objective", "Results", [
        chart("lab_results", "Laboratory results", "labs"),
        F("diagnostic_results", "Diagnostic results", "textarea"),
        F("results_comments", "Results comments", "textarea")]),
    ("Devices", "Device/Therapy",
        device("central_line", "Central line", True, ("type", "Type"), ("indication", "Indication"))
        + device("peripheral_line", "Peripheral line", True, ("type", "Type"))
        + device("foley", "Foley catheter", True, ("indication", "Indication"))
        + device("ventilator", "Ventilator", False)
        + device("telemetry", "Telemetry monitoring", True, ("indications", "Telemetry indications"))
        + [F("device_comment", "Comment", "textarea")]),
    ("Assessment & Plan", "Problem List", [
        F("admission_diagnosis", "Admission diagnosis", "text"),
        F("secondary_diagnosis", "Secondary diagnosis", "text"),
        chart("past_history", "Past medical history (problem list)", "problems"),
        F("past_history_update", "Past medical history: update", "textarea")]),
    ("Assessment & Plan", "Problem / Assessment Plan",
        [F("suny_launch_hi_manager", "SUNY LAUNCH HI Manager", "text")] + problem_pairs()),
    ("Assessment & Plan", "Discharge Planning", [F("discharge_planning", "Discharge planning", "textarea")]),
    ("Attestation", "PATH Statement", [
        F("path_app", "Advanced Practice Practitioner (NP/PA) statement", "textarea"),
        F("path_attending_midlevel", "Attending physician statement for mid levels only", "textarea"),
        F("path_resident", "PATH statement for Intern/Resident/Fellow", "textarea")]),
    ("Attestation", "Time Spent with Patient", [F("time_spent_minutes", "Time spent with patient (minutes)", "numeric")]),
]

CODE, NAME, NOTE_TYPE = "progress_note_acute", "Progress Note (Acute)", "progress"


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

    types = Dictionary.objects.filter(code="note_types").first()
    if types is not None:
        DictionaryItem.objects.get_or_create(dictionary=types, value=NOTE_TYPE, defaults={"label": "Progress", "sort_order": 30})
    template, created = NoteTemplate.objects.get_or_create(
        code=CODE, defaults={"name": NAME, "version": 1, "is_active": True, "note_type": NOTE_TYPE})
    if not created:
        return  # a clinic already has this template: never overwrite its edits
    made, order = {}, 0
    for tab, section, fields in SECTIONS:
        for f in fields:
            made[f["key"]] = NoteFieldDefinition.objects.create(
                template=template, key=f["key"], label=f["label"], field_type=f["type"],
                tab_label=tab, section_label=section, required=f["req"], sort_order=order * 10,
                help_text=f["help"], calc=f["calc"],
                dictionary=dictionaries[f["dict"]] if f["dict"] else None)
            order += 1
    for _tab, _section, fields in SECTIONS:
        for f in fields:
            if f["dep"]:
                field = made[f["key"]]
                field.depends_on = made[f["dep"]]
                field.depends_on_value = f["val"]
                field.save(update_fields=["depends_on", "depends_on_value"])


def unseed(apps, schema_editor):
    apps.get_model("appointments", "NoteTemplate").objects.filter(code=CODE).delete()


class Migration(migrations.Migration):
    dependencies = [("appointments", "0072_intake_output")]
    operations = [migrations.RunPython(seed, unseed)]
