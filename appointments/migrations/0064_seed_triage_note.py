from django.db import migrations

# code -> (name, [(value, label), ...])
DICTIONARIES = {
    "yes_no": ("Yes / No", [("yes", "Yes"), ("no", "No")]),
    "triage_arrival_mode": ("Triage: mode of arrival", [
        ("walk_in", "Walk-in"), ("ems", "Ambulance (EMS)"), ("private_vehicle", "Private vehicle"),
        ("police", "Police"), ("transfer", "Transfer from another facility")]),
    "triage_airway": ("Triage: airway", [("clear", "Airway clear"), ("problem", "Airway problem")]),
    "triage_breathing": ("Triage: breathing", [("unlabored", "Breathing unlabored"), ("labored", "Breathing labored")]),
    "triage_circulation": ("Triage: circulation", [("normal", "Circulation normal"), ("problem", "Circulation problem")]),
    "avpu": ("AVPU", [("A", "Alert"), ("V", "Responds to voice"), ("P", "Responds to pain"), ("U", "Unresponsive")]),
    "triage_peds_appearance": ("Triage: child general appearance", [
        ("alert", "Alert, playful, consolable"), ("irritable", "Irritable"), ("lethargic", "Lethargic or limp")]),
    "triage_peds_breathing": ("Triage: child work of breathing", [
        ("normal", "Normal"), ("retractions", "Retractions or grunting"), ("noisy", "Noisy or stridor")]),
    "triage_peds_skin": ("Triage: child skin color", [("normal", "Normal"), ("pale", "Pale or mottled"), ("cyanosis", "Blue (cyanosis)")]),
    "triage_complaint": ("Triage: chief complaint", [
        ("chest_pain", "Chest pain"), ("shortness_of_breath", "Shortness of breath"), ("abdominal_pain", "Abdominal pain"),
        ("fever", "Fever"), ("headache", "Headache"), ("head_injury", "Head injury"), ("limb_injury", "Arm or leg injury"),
        ("laceration", "Cut or laceration"), ("back_pain", "Back pain"), ("weakness_stroke", "Weakness or stroke symptoms"),
        ("dizziness", "Dizziness or fainting"), ("nausea_vomiting", "Nausea or vomiting"), ("bleeding", "Bleeding"),
        ("allergic_reaction", "Allergic reaction"), ("mental_health", "Mental health concern"), ("overdose", "Overdose or poisoning"),
        ("pregnancy", "Pregnancy related"), ("eye", "Eye problem"), ("rash", "Rash or skin problem"), ("urinary", "Urinary problem"),
        ("dental", "Dental problem"), ("other", "Other")]),
    "triage_pain_scale": ("Triage: pain scale", [("numeric", "Numeric 0 to 10"), ("faces", "Faces"), ("flacc", "FLACC (behavior)")]),
    "triage_weight_source": ("Triage: weight source", [("measured", "Measured"), ("stated", "Stated by parent")]),
    "triage_peds_immunization": ("Triage: child immunizations", [
        ("up_to_date", "Up to date"), ("incomplete", "Incomplete for age"), ("unknown", "Unknown")]),
    "triage_actions": ("Triage: started under protocol", [
        ("ecg", "12-lead ECG"), ("monitor", "Cardiac monitor"), ("oxygen", "Oxygen"), ("iv", "IV access"),
        ("labs", "Blood tests"), ("urine", "Urine test"), ("xray", "X-ray")]),
    "triage_destination": ("Triage: goes to", [
        ("resus", "Resuscitation bay"), ("main_ed", "Main ED bed now"), ("fast_track", "Fast track"),
        ("waiting", "Waiting room"), ("other", "Other area")]),
}

# (section, key, label, field_type, dictionary, required, help_text, depends_on_key, depends_on_value)
FIELDS = [
    ("Arrival", "arrival_mode", "Mode of arrival", "radio", "triage_arrival_mode", False, "", None, None),
    ("Arrival", "accompanied_by", "Accompanied by", "text", None, False, "", None, None),
    ("Arrival", "language", "Language spoken", "text", None, False, "", None, None),
    ("Arrival", "interpreter_needed", "Interpreter needed", "radio", "yes_no", False, "", None, None),
    ("Arrival", "ems_treatment", "Treatment given by EMS before arrival", "text", None, False, "", None, None),
    ("Critical first look", "first_airway", "Airway", "radio", "triage_airway", False, "Adults and teenagers", None, None),
    ("Critical first look", "first_breathing", "Breathing", "radio", "triage_breathing", False, "", None, None),
    ("Critical first look", "first_circulation", "Circulation", "radio", "triage_circulation", False, "", None, None),
    ("Critical first look", "first_avpu", "Level of consciousness (AVPU)", "radio", "avpu", False, "", None, None),
    ("Critical first look", "needs_immediate_help", "Needs immediate help", "checkbox", None, False, "Get help now, then finish the note", None, None),
    ("Critical first look", "general_appearance", "General appearance", "text", None, False, "", None, None),
    ("Chief complaint and history", "chief_complaint", "Chief complaint", "dropdown", "triage_complaint", True, "", None, None),
    ("Chief complaint and history", "reason_for_visit", "Reason for visit, in the patient's words", "text", None, False, "", None, None),
    ("Chief complaint and history", "hpi_onset", "Onset", "text", None, False, "", None, None),
    ("Chief complaint and history", "hpi_provokes", "Provokes or relieves", "text", None, False, "", None, None),
    ("Chief complaint and history", "hpi_quality", "Quality", "text", None, False, "", None, None),
    ("Chief complaint and history", "hpi_radiation", "Region and radiation", "text", None, False, "", None, None),
    ("Chief complaint and history", "hpi_associated", "Associated symptoms", "text", None, False, "", None, None),
    ("Chief complaint and history", "hpi_summary", "Nurse's summary (history of present illness)", "textarea", None, False, "", None, None),
    ("Vital signs", "vitals_note", "Vital signs comment", "text", None, False, "Values come from the Vital Signs flowsheet", None, None),
    ("Vital signs", "blood_glucose", "Blood glucose (mg/dL)", "numeric", None, False, "", None, None),
    ("Vital signs", "pain_scale", "Pain scale used", "dropdown", "triage_pain_scale", False, "", None, None),
    ("Vital signs", "pain_score", "Pain score", "numeric", None, False, "0 to 10, or the FLACC total", None, None),
    ("History", "allergies_confirmed", "Allergies confirmed with patient", "checkbox", None, False, "", None, None),
    ("History", "medications_confirmed", "Current medicines confirmed with patient", "checkbox", None, False, "", None, None),
    ("History", "past_history", "Past medical and surgical history", "textarea", None, False, "", None, None),
    ("History", "last_tetanus", "Last tetanus shot", "text", None, False, "", None, None),
    ("History", "last_menstrual_period", "Last menstrual period", "text", None, False, "Leave blank if not applicable", None, None),
    ("Child details (under 18)", "child_weight_kg", "Weight (kg)", "numeric", None, False, "Required for a child", None, None),
    ("Child details (under 18)", "child_weight_source", "Weight measured or stated", "dropdown", "triage_weight_source", False, "", None, None),
    ("Child details (under 18)", "child_immunizations", "Immunizations", "dropdown", "triage_peds_immunization", False, "", None, None),
    ("Child details (under 18)", "child_guardian", "Parent or guardian with the child", "text", None, False, "", None, None),
    ("Child details (under 18)", "child_appearance", "General appearance", "radio", "triage_peds_appearance", False, "", None, None),
    ("Child details (under 18)", "child_work_of_breathing", "Work of breathing", "radio", "triage_peds_breathing", False, "", None, None),
    ("Child details (under 18)", "child_skin", "Skin color", "radio", "triage_peds_skin", False, "", None, None),
    ("Child details (under 18)", "child_abuse_concern", "Concern about abuse or neglect", "radio", "yes_no", False, "", None, None),
    ("Safety screenings", "screen_falls", "Fall in the last year, or at risk of falling", "radio", "yes_no", False, "", None, None),
    ("Safety screenings", "screen_infection", "Infection control: fever with rash, cough with travel, or exposure", "radio", "yes_no", False, "", None, None),
    ("Safety screenings", "screen_isolation_started", "Isolation started", "radio", "yes_no", False, "", "screen_infection", "yes"),
    ("Safety screenings", "screen_unsafe_home", "Feels unsafe at home, or injury caused by someone else", "radio", "yes_no", False, "Ask privately", None, None),
    ("Safety screenings", "screen_directive", "Health care proxy or advance directive on file", "radio", "yes_no", False, "", None, None),
    ("Suicide risk screen", "cssrs_1", "Wished you were dead or wished you could go to sleep and not wake up (past month)", "radio", "yes_no", False, "", None, None),
    ("Suicide risk screen", "cssrs_2", "Actually had any thoughts of killing yourself (past month)", "radio", "yes_no", False, "", None, None),
    ("Suicide risk screen", "cssrs_3", "Thinking about how you might do this", "radio", "yes_no", False, "", "cssrs_2", "yes"),
    ("Suicide risk screen", "cssrs_4", "Had these thoughts and some intention of acting on them", "radio", "yes_no", False, "", "cssrs_2", "yes"),
    ("Suicide risk screen", "cssrs_5", "Started to work out or worked out the details of how to kill yourself; intend to carry out this plan", "radio", "yes_no", False, "", "cssrs_2", "yes"),
    ("Suicide risk screen", "cssrs_6", "Ever done anything, started to do anything, or prepared to do anything to end your life", "radio", "yes_no", False, "", None, None),
    ("Suicide risk screen", "cssrs_6_recent", "Was this within the past 3 months", "radio", "yes_no", False, "", "cssrs_6", "yes"),
    ("Started at triage", "protocol_actions", "Started under protocol", "multiselect", "triage_actions", False, "", None, None),
    ("Started at triage", "destination", "Goes to", "dropdown", "triage_destination", False, "", None, None),
    ("Started at triage", "handoff_to", "Handoff to", "text", None, False, "", None, None),
    ("Triage level (ESI)", "esi_a_life_saving", "A. Needs a life-saving intervention right now", "radio", "yes_no", False, "", None, None),
    ("Triage level (ESI)", "esi_b_high_risk", "B. High-risk situation", "checkbox", None, False, "", None, None),
    ("Triage level (ESI)", "esi_b_confused", "B. New confusion, lethargy or disorientation", "checkbox", None, False, "", None, None),
    ("Triage level (ESI)", "esi_b_severe_pain", "B. Severe pain or distress", "checkbox", None, False, "", None, None),
    ("Triage level (ESI)", "esi_resources", "C. Resources expected (number)", "numeric", None, False, "0, 1, or 2 or more", None, None),
    ("Triage level (ESI)", "esi_level", "Triage level chosen (1 to 5)", "numeric", None, True, "", None, None),
    ("Triage level (ESI)", "esi_override_reason", "Reason, if different from the suggestion", "textarea", None, False, "", None, None),
]


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

    template, _ = NoteTemplate.objects.get_or_create(code="triage_note", defaults={"name": "Triage Note", "version": 1, "is_active": True})
    made = {}
    for i, (section, key, label, field_type, dict_code, required, help_text, _dep, _val) in enumerate(FIELDS):
        made[key], _ = NoteFieldDefinition.objects.get_or_create(
            template=template, key=key,
            defaults={"section_label": section, "label": label, "field_type": field_type,
                      "dictionary": dictionaries.get(dict_code) if dict_code else None,
                      "required": required, "sort_order": i, "help_text": help_text})
    for section, key, label, field_type, dict_code, required, help_text, dep, value in FIELDS:
        if dep:
            field = made[key]
            if field.depends_on_id is None:
                field.depends_on = made[dep]
                field.depends_on_value = value
                field.save(update_fields=["depends_on", "depends_on_value"])


def unseed(apps, schema_editor):
    apps.get_model("appointments", "NoteTemplate").objects.filter(code="triage_note").delete()
    apps.get_model("appointments", "Dictionary").objects.filter(code__in=[c for c in DICTIONARIES if c.startswith("triage_") or c == "avpu"]).delete()


class Migration(migrations.Migration):
    dependencies = [("appointments", "0063_triage_settings")]
    operations = [migrations.RunPython(seed, unseed)]
