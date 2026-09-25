from django.db import migrations


# --- Dictionaries -----------------------------------------------------------
# code -> (name, [(value, label), ...])
DICTIONARIES = {
    "yes_no_unknown": (
        "Yes / No / Unknown",
        [("yes", "Yes"), ("no", "No"), ("unknown", "Unknown")],
    ),
    "tobacco_use": (
        "Tobacco Use",
        [
            ("never", "Never smoker"),
            ("former", "Former smoker"),
            ("current", "Current smoker"),
        ],
    ),
    "alcohol_use": (
        "Alcohol Use",
        [
            ("none", "None"),
            ("occasional", "Occasional"),
            ("moderate", "Moderate"),
            ("heavy", "Heavy"),
        ],
    ),
    "ros_finding": (
        "Review of Systems Finding",
        [
            ("negative", "Negative / Denies"),
            ("positive", "Positive"),
            ("not_assessed", "Not Assessed"),
        ],
    ),
    "immunization_status": (
        "Immunization Status",
        [
            ("up_to_date", "Up to date"),
            ("not_up_to_date", "Not up to date"),
            ("unknown", "Unknown"),
        ],
    ),
}

# --- Admission Note field definitions ---------------------------------------
# (section_label, key, label, field_type, dictionary_code_or_None, required, help_text)
ADMISSION_NOTE_FIELDS = [
    # Visit
    ("Visit", "chief_complaint", "Chief Complaint", "text", None, True, ""),
    ("Visit", "hpi", "History of Present Illness", "textarea", None, True, ""),
    # History
    ("History", "past_medical_history", "Past Medical History", "textarea", None, False, ""),
    ("History", "past_surgical_history", "Past Surgical History", "textarea", None, False, ""),
    ("History", "current_medications", "Current Medications", "textarea", None, False, "Name, dose, frequency"),
    ("History", "allergies", "Allergies", "textarea", None, True, "Drug/food/environmental allergies and reaction, or 'NKDA'"),
    ("History", "family_history", "Family History", "textarea", None, False, ""),
    ("History", "tobacco_use", "Tobacco Use", "dropdown", "tobacco_use", False, ""),
    ("History", "alcohol_use", "Alcohol Use", "dropdown", "alcohol_use", False, ""),
    ("History", "drug_use", "Recreational Drug Use", "dropdown", "yes_no_unknown", False, ""),
    ("History", "occupation", "Occupation", "text", None, False, ""),
    ("History", "living_situation", "Living Situation", "text", None, False, ""),
    # Review of Systems
    ("Review of Systems", "ros_constitutional", "Constitutional", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_cardiovascular", "Cardiovascular", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_respiratory", "Respiratory", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_gastrointestinal", "Gastrointestinal", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_genitourinary", "Genitourinary", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_musculoskeletal", "Musculoskeletal", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_neurological", "Neurological", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_psychiatric", "Psychiatric", "dropdown", "ros_finding", False, ""),
    ("Review of Systems", "ros_skin", "Skin", "dropdown", "ros_finding", False, ""),
    # Vital Signs
    ("Vital Signs", "vital_bp", "Blood Pressure", "text", None, False, "e.g. 120/80"),
    ("Vital Signs", "vital_hr", "Heart Rate (bpm)", "numeric", None, False, ""),
    ("Vital Signs", "vital_rr", "Respiratory Rate", "numeric", None, False, ""),
    ("Vital Signs", "vital_temp", "Temperature (F)", "numeric", None, False, ""),
    ("Vital Signs", "vital_spo2", "SpO2 (%)", "numeric", None, False, ""),
    ("Vital Signs", "vital_height", "Height (in)", "numeric", None, False, ""),
    ("Vital Signs", "vital_weight", "Weight (lb)", "numeric", None, False, ""),
    # Physical Exam
    ("Physical Exam", "physical_exam", "Physical Exam Findings", "textarea", None, False, ""),
    # Intake / Administrative
    ("Intake", "immunization_status", "Immunization Status", "dropdown", "immunization_status", False, ""),
    ("Intake", "advance_directive", "Advance Directive on File", "radio", "yes_no_unknown", False, ""),
    ("Intake", "consent_acknowledged", "Consent for Treatment Acknowledged", "checkbox", None, True, ""),
    # Assessment / Plan
    ("Assessment / Plan", "clinical_impression", "Clinical Impression", "textarea", None, True, ""),
    ("Assessment / Plan", "plan", "Plan", "textarea", None, True, "Orders, referrals, follow-up interval"),
]


def seed(apps, schema_editor):
    Dictionary = apps.get_model("appointments", "Dictionary")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")

    dictionaries_by_code = {}
    for code, (name, items) in DICTIONARIES.items():
        dictionary, _ = Dictionary.objects.get_or_create(code=code, defaults={"name": name})
        dictionaries_by_code[code] = dictionary
        for i, (value, label) in enumerate(items):
            DictionaryItem.objects.get_or_create(
                dictionary=dictionary,
                value=value,
                defaults={"label": label, "sort_order": i},
            )

    template, _ = NoteTemplate.objects.get_or_create(
        code="admission_note",
        defaults={"name": "Admission Note", "version": 1, "is_active": True},
    )

    for i, (section, key, label, field_type, dict_code, required, help_text) in enumerate(
        ADMISSION_NOTE_FIELDS
    ):
        NoteFieldDefinition.objects.get_or_create(
            template=template,
            key=key,
            defaults={
                "section_label": section,
                "label": label,
                "field_type": field_type,
                "dictionary": dictionaries_by_code.get(dict_code) if dict_code else None,
                "required": required,
                "sort_order": i,
                "help_text": help_text,
            },
        )


def unseed(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    Dictionary = apps.get_model("appointments", "Dictionary")
    NoteTemplate.objects.filter(code="admission_note").delete()
    Dictionary.objects.filter(code__in=list(DICTIONARIES.keys())).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0030_note_builder_engine"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
