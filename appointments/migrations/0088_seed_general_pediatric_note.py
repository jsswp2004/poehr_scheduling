"""General Pediatric Note: a tabbed note for well-child and sick visits, written by a nurse or a doctor.

Tabs: Visit, Birth & Perinatal, History, Nutrition & Sleep, Development, Social & Safety, Review of Systems,
Vitals & Exam, Screening & Immunizations, Assessment & Plan.

The Birth & Perinatal tab holds the birth details (gestational age and birth weight) that used to sit on the
registration page. When a pediatric note is saved or signed, those three values are copied to the patient's
record (see appointments/pediatric_sync.py) so the growth charts can plot a premature baby at corrected age.
Templates and dictionaries that already exist are left alone, so re-running this never overwrites a clinic's edits.
"""

from django.db import migrations

YES_NO = ("Yes / No", [("yes", "Yes"), ("no", "No")])

DICTIONARIES = {
    "yes_no": YES_NO,
    "amb_ros_status": ("Ambulatory: review of systems", [("negative", "Negative"), ("positive", "Positive"), ("not_reviewed", "Not reviewed")]),
    "amb_exam_status": ("Ambulatory: exam finding", [("normal", "Normal"), ("abnormal", "Abnormal"), ("not_examined", "Not examined")]),
    "amb_history_from": ("Ambulatory: history obtained from", [
        ("patient", "Patient"), ("parent", "Parent"), ("family", "Family member"), ("caregiver", "Caregiver"),
        ("interpreter", "Interpreter"), ("records", "Records")]),
    "amb_screen_result": ("Ambulatory: screening result", [("not_done", "Not done"), ("negative", "Negative"), ("positive", "Positive")]),
    "amb_immune_status": ("Ambulatory: immunization status", [
        ("up_to_date", "Up to date"), ("due", "Due"), ("overdue", "Overdue"), ("declined", "Declined"), ("unknown", "Unknown")]),
    "amb_followup": ("Ambulatory: follow-up", [
        ("1w", "1 week"), ("2w", "2 weeks"), ("1m", "1 month"), ("3m", "3 months"), ("6m", "6 months"),
        ("12m", "12 months"), ("prn", "As needed")]),
    "ped_visit_type": ("Pediatric: type of visit", [
        ("newborn", "Newborn visit"), ("well_child", "Well-child visit"), ("sick", "Sick visit"), ("follow_up", "Follow-up"),
        ("school_sports", "School, camp or sports physical"), ("post_hospital", "Post-hospital follow-up"), ("telehealth", "Telehealth")]),
    "ped_delivery": ("Pediatric: delivery", [
        ("vaginal", "Vaginal"), ("assisted", "Assisted vaginal (forceps or vacuum)"), ("cesarean_planned", "Cesarean, planned"),
        ("cesarean_urgent", "Cesarean, urgent"), ("unknown", "Unknown")]),
    "ped_newborn_result": ("Pediatric: newborn screen result", [
        ("normal", "Normal"), ("abnormal", "Abnormal"), ("pending", "Pending"), ("not_done", "Not done"), ("unknown", "Unknown")]),
    "ped_feeding": ("Pediatric: how the child is fed", [
        ("breast_milk", "Breast milk"), ("formula", "Formula"), ("solids", "Solid foods"), ("cow_milk", "Cow's milk"),
        ("table_food", "Table foods"), ("tube", "Tube feeding"), ("other", "Other")]),
    "ped_dev_status": ("Pediatric: development", [
        ("meets", "Meets milestones"), ("concern", "Concern or delay"), ("regression", "Loss of skills"), ("not_assessed", "Not assessed")]),
    "ped_dev_tool": ("Pediatric: screening tool used", [
        ("none", "None"), ("asq3", "ASQ-3"), ("asq_se", "ASQ:SE"), ("mchat", "M-CHAT-R/F"), ("peds", "PEDS"), ("swyc", "SWYC"), ("other", "Other")]),
    "ped_sleep_place": ("Pediatric: where the child sleeps", [
        ("crib", "Own crib or bassinet"), ("shared_room", "Parents' room, own surface"), ("bed_share", "Shares a bed"), ("own_bed", "Own bed"), ("other", "Other")]),
    "ped_tanner": ("Pediatric: Tanner stage", [
        ("1", "Stage 1"), ("2", "Stage 2"), ("3", "Stage 3"), ("4", "Stage 4"), ("5", "Stage 5"), ("na", "Not applicable")]),
    "ped_growth": ("Pediatric: growth assessment", [
        ("appropriate", "Growing appropriately"), ("low_weight", "Low weight or poor weight gain"), ("short", "Short stature or slow height gain"),
        ("overweight", "Overweight"), ("obese", "Obesity"), ("head", "Head size concern")]),
    "ped_guidance": ("Pediatric: anticipatory guidance", [
        ("nutrition", "Nutrition and feeding"), ("sleep", "Sleep and safe sleep"), ("development", "Development and play"),
        ("injury", "Injury prevention, car seat, helmet"), ("water", "Water safety"), ("firearms", "Firearm safety"),
        ("screen", "Screen time"), ("oral", "Oral health"), ("behavior", "Behavior and discipline"), ("toilet", "Toilet training"),
        ("school", "School readiness and performance"), ("puberty", "Puberty and body changes"), ("mental", "Emotional health"),
        ("substance", "Tobacco, alcohol and drugs"), ("sexual", "Sexual health"), ("fever", "Fever and when to call")]),
}

PED_ROS = [
    "Constitutional", "Eyes", "Ears, nose, mouth and throat", "Cardiovascular", "Respiratory", "Gastrointestinal",
    "Genitourinary", "Musculoskeletal", "Skin", "Neurological", "Behavior and mood", "Endocrine",
    "Hematologic and lymphatic", "Allergic and immunologic",
]
PED_EXAM = [
    "General appearance", "Head, fontanelles and face", "Eyes (red reflex, alignment)", "Ears, nose and throat", "Neck",
    "Cardiovascular (pulses, murmur)", "Respiratory", "Abdomen", "Genitourinary", "Hips and musculoskeletal",
    "Skin", "Lymph nodes", "Neurological (tone, reflexes)", "Behavior and affect",
]


def F(key, label, ftype, dic=None, req=False, help="", dep=None, val=None, calc=None):
    return {"key": key, "label": label, "type": ftype, "dict": dic, "req": req, "help": help,
            "dep": dep, "val": val, "calc": calc or {}}


def chart(key, label, source, help=""):
    return F(key, label, "chart_data", calc={"source": source}, help=help)


def slug(text):
    out = "".join(c if c.isalnum() else "_" for c in text.lower())
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


def ros_fields():
    out = []
    for system in PED_ROS:
        s = slug(system)
        out.append(F(f"ros_{s}_status", system, "radio", "amb_ros_status"))
        out.append(F(f"ros_{s}_findings", f"{system}: positive findings", "text", dep=f"ros_{s}_status", val="positive"))
    return out


def exam_fields():
    out = []
    for system in PED_EXAM:
        s = slug(system)[:40]
        out.append(F(f"pe_{s}_status", system, "radio", "amb_exam_status"))
        out.append(F(f"pe_{s}_findings", f"{system}: findings", "text", dep=f"pe_{s}_status", val="abnormal"))
    return out


def screen(key, label, help=""):
    return [F(f"{key}_result", label, "dropdown", "amb_screen_result", help=help),
            F(f"{key}_notes", f"{label}: result or plan", "text", dep=f"{key}_result", val="positive")]


# (tab, section, [fields])
PEDIATRIC = [
    ("Visit", "Reason for Visit", [
        F("visit_type", "Type of visit", "dropdown", "ped_visit_type", req=True),
        F("history_from", "History obtained from", "multiselect", "amb_history_from"),
        F("accompanied_by", "Accompanied by (name and relationship)", "text"),
        F("chief_complaint", "Chief complaint or reason for visit", "text", req=True),
        F("concerns_parent", "Parent or caregiver concerns", "textarea"),
        F("concerns_patient", "Child's or teen's own concerns", "textarea"),
    ]),
    ("Visit", "History of Present Illness", [
        F("hpi", "History of present illness", "textarea", help="For a sick visit: onset, duration, severity, what helps or worsens it, associated symptoms, sick contacts."),
        F("interval_history", "Interval history since the last visit", "textarea",
          help="Illnesses, ED visits, hospital stays, injuries, new medicines or specialists."),
    ]),

    ("Birth & Perinatal", "Birth Details", [
        F("gestational_age_weeks", "Gestational age at birth (completed weeks)", "numeric",
          help="Weeks, 20 to 45. Leave blank if not known. Used to plot a premature baby at corrected age on the growth charts."),
        F("gestational_age_days", "Plus days", "numeric", help="0 to 6."),
        F("birth_weight_g", "Birth weight (grams)", "numeric", help="200 to 8000 grams. For example 3.5 kg is 3500."),
        F("birth_length_cm", "Birth length (cm)", "numeric"),
        F("birth_head_cm", "Birth head circumference (cm)", "numeric"),
    ]),
    ("Birth & Perinatal", "Pregnancy and Delivery", [
        F("prenatal_care", "Prenatal care received", "radio", "yes_no"),
        F("pregnancy_complications", "Pregnancy complications (diabetes, hypertension, infection, bleeding)", "textarea"),
        F("prenatal_exposures", "Exposures during pregnancy (tobacco, alcohol, drugs, medicines)", "text"),
        F("maternal_labs", "Maternal blood type, GBS, HIV, hepatitis B and syphilis results", "text"),
        F("delivery_type", "Type of delivery", "dropdown", "ped_delivery"),
        F("apgar_1", "APGAR at 1 minute", "numeric", help="0 to 10."),
        F("apgar_5", "APGAR at 5 minutes", "numeric", help="0 to 10."),
        F("delivery_complications", "Complications at delivery", "text"),
    ]),
    ("Birth & Perinatal", "Newborn Period", [
        F("nicu_stay", "Admitted to the NICU or special care nursery", "radio", "yes_no"),
        F("nicu_days", "Days in the NICU", "numeric", dep="nicu_stay", val="yes"),
        F("nicu_reason", "Reason for the NICU stay", "text", dep="nicu_stay", val="yes"),
        F("neonatal_problems", "Newborn problems (jaundice, feeding, breathing, infection, seizures)", "textarea"),
        F("newborn_screen", "Newborn metabolic screen", "dropdown", "ped_newborn_result"),
        F("newborn_hearing", "Newborn hearing screen", "dropdown", "ped_newborn_result"),
        F("newborn_cchd", "Critical congenital heart disease screen", "dropdown", "ped_newborn_result"),
        F("vitamin_k", "Vitamin K given", "radio", "yes_no"),
        F("hep_b_birth", "Hepatitis B vaccine given at birth", "radio", "yes_no"),
        F("discharge_age_days", "Age at hospital discharge (days)", "numeric"),
    ]),

    ("History", "Past Medical and Surgical History", [
        chart("problem_list", "Problem list", "problems"),
        F("pmh", "Past medical history (illnesses, hospital stays, ED visits)", "textarea"),
        F("psh", "Past surgical history", "textarea"),
        F("specialists", "Specialists involved", "text"),
    ]),
    ("History", "Allergies and Medicines", [
        chart("allergy_list", "Allergies", "allergies"),
        F("allergies_reviewed", "Allergies reviewed with the family", "checkbox"),
        chart("medication_list", "Outpatient medications", "medications"),
        F("meds_reconciled", "Medication list reconciled", "checkbox"),
        F("meds_supplements", "Vitamins, supplements and over-the-counter medicines", "text"),
    ]),
    ("History", "Family History", [
        F("family_history", "Family history (asthma, diabetes, heart disease, early death, genetic, hearing, developmental, mental health)", "textarea"),
        F("family_consanguinity", "Parents related by blood", "radio", "yes_no"),
        F("family_reviewed", "Family history reviewed", "checkbox"),
    ]),

    ("Nutrition & Sleep", "Feeding and Nutrition", [
        F("feeding", "How the child is fed", "multiselect", "ped_feeding"),
        F("feeding_details", "Breast or bottle feeds: how often and how much; formula type", "text"),
        F("solids_started", "Age solids were started (months)", "numeric"),
        F("diet_description", "Diet: fruits, vegetables, milk, juice, sweet drinks, fast food, picky eating", "textarea"),
        F("vitamin_d", "Vitamin D or other supplements", "text"),
        F("food_allergy_history", "Food allergy or intolerance", "text"),
        F("food_insecurity", "Worried food would run out in the past year", "radio", "yes_no"),
        F("water_source", "Water source and fluoride", "text"),
    ]),
    ("Nutrition & Sleep", "Sleep", [
        F("sleep_place", "Where the child sleeps", "dropdown", "ped_sleep_place"),
        F("sleep_hours", "Hours of sleep in 24 hours", "numeric"),
        F("sleep_back", "Infant put to sleep on the back", "radio", "yes_no"),
        F("sleep_problems", "Sleep problems (snoring, night waking, apnea)", "text"),
    ]),
    ("Nutrition & Sleep", "Elimination and Oral Health", [
        F("urine_stool", "Urine and stool: frequency, constipation, diarrhea", "text"),
        F("toilet_training", "Toilet training status", "text"),
        F("dental_home", "Has a dentist", "radio", "yes_no"),
        F("tooth_brushing", "Brushes teeth, fluoride toothpaste", "radio", "yes_no"),
    ]),

    ("Development", "Milestones", [
        F("dev_gross_motor", "Gross motor (sitting, walking, running)", "radio", "ped_dev_status"),
        F("dev_gross_motor_notes", "Gross motor: details", "text", dep="dev_gross_motor", val="concern"),
        F("dev_fine_motor", "Fine motor (grasp, drawing, self-feeding)", "radio", "ped_dev_status"),
        F("dev_fine_motor_notes", "Fine motor: details", "text", dep="dev_fine_motor", val="concern"),
        F("dev_language", "Language and communication", "radio", "ped_dev_status"),
        F("dev_language_notes", "Language: details", "text", dep="dev_language", val="concern"),
        F("dev_social", "Social and emotional", "radio", "ped_dev_status"),
        F("dev_social_notes", "Social and emotional: details", "text", dep="dev_social", val="concern"),
        F("dev_cognitive", "Cognitive and problem solving", "radio", "ped_dev_status"),
        F("dev_cognitive_notes", "Cognitive: details", "text", dep="dev_cognitive", val="concern"),
        F("dev_regression", "Any loss of skills the child once had", "radio", "yes_no"),
    ]),
    ("Development", "Developmental Screening", [
        F("dev_tool", "Standardized tool used today", "dropdown", "ped_dev_tool"),
        F("dev_screen_result", "Developmental screen result", "dropdown", "amb_screen_result"),
        F("autism_screen", "Autism screen (M-CHAT-R/F at 18 and 24 months)", "dropdown", "amb_screen_result"),
        F("dev_plan", "Referral or plan (early intervention, speech, audiology)", "text", dep="dev_screen_result", val="positive"),
    ]),
    ("Development", "School and Behavior", [
        F("school_grade", "Child care, school and grade", "text"),
        F("school_performance", "School performance and concerns (learning, attention, bullying, attendance)", "textarea"),
        F("behavior_concerns", "Behavior concerns (tantrums, aggression, anxiety, mood)", "textarea"),
        F("screen_hours", "Screen time (hours per day)", "numeric"),
        F("physical_activity", "Physical activity (minutes per day)", "numeric"),
    ]),

    ("Social & Safety", "Home and Family", [
        F("lives_with", "Lives with", "text"),
        F("caregiver_wellbeing", "Caregiver stress, depression or relationship safety concerns", "textarea"),
        F("housing_concerns", "Housing, utilities or money worries", "text"),
        F("smoke_exposure", "Exposure to tobacco or vape smoke at home", "radio", "yes_no"),
        F("social_services", "Social work or community referral offered", "checkbox"),
    ]),
    ("Social & Safety", "Safety", [
        F("car_seat", "Car seat or seat belt used correctly", "radio", "yes_no"),
        F("helmet", "Helmet used for bike, scooter or sports", "radio", "yes_no"),
        F("firearms", "Firearms in the home, stored locked and unloaded", "text"),
        F("water_safety", "Water safety and pool fencing discussed", "checkbox"),
        F("lead_risk", "Lead exposure risk (older housing, imported items, pica)", "radio", "yes_no"),
        F("tb_risk", "Tuberculosis risk (travel, exposure)", "radio", "yes_no"),
        F("abuse_concern", "Any concern about abuse or neglect", "radio", "yes_no"),
    ]),
    ("Social & Safety", "Adolescent Interview (confidential)", [
        F("confidential_time", "Time alone with the teen offered", "checkbox"),
        F("headss", "Home, education, activities, drugs, sexuality, suicide and safety (HEADSS)", "textarea"),
        F("substance_use", "Tobacco, vaping, alcohol or drug use", "text"),
        F("crafft", "CRAFFT substance screen", "dropdown", "amb_screen_result"),
        F("depression_screen", "Depression screen (PHQ-A)", "dropdown", "amb_screen_result"),
        F("depression_notes", "Depression screen: follow-up", "text", dep="depression_screen", val="positive",
          help="If the teen reports thoughts of self-harm, assess safety before they leave and tell the provider."),
        F("sexual_health", "Sexual health, contraception and STI counselling", "text"),
        F("menstrual_history", "Menstrual history", "text"),
    ]),

    ("Review of Systems", "Review of Systems", ros_fields() + [F("ros_comments", "Review of systems comments", "textarea")]),

    ("Vitals & Exam", "Vital Signs and Measurements", [
        chart("nursing_vitals", "Latest vital signs", "vitals"),
        F("weight_kg", "Weight (kg)", "numeric"),
        F("length_height_cm", "Length or height (cm)", "numeric"),
        F("head_circumference_cm", "Head circumference (cm, under 3 years)", "numeric"),
        F("growth_percentiles", "Percentiles: weight, length or height, head circumference, BMI", "text",
          help="Use the Growth Charts button in the patient banner."),
        F("blood_pressure_note", "Blood pressure (routine from age 3), percentile", "text"),
    ]),
    ("Vitals & Exam", "Physical Exam", exam_fields() + [
        F("tanner_stage", "Tanner stage", "dropdown", "ped_tanner"),
        F("pe_comments", "Physical exam comments", "textarea")]),

    ("Screening & Immunizations", "Screening", (
        screen("vision", "Vision screen") + screen("hearing", "Hearing screen") + screen("anemia", "Anemia (hemoglobin)")
        + screen("lead", "Lead level") + screen("tb", "Tuberculosis risk screen") + screen("lipids", "Cholesterol screen")
        + screen("oral", "Oral health risk and fluoride varnish")
    )),
    ("Screening & Immunizations", "Immunizations", [
        chart("immunization_list", "Immunizations given", "immunizations"),
        chart("health_manager_due", "Health Manager: due and overdue", "health_manager"),
        F("immunization_status", "Immunization status", "dropdown", "amb_immune_status"),
        F("vaccines_today", "Vaccines given today (vaccine, site, lot number)", "textarea"),
        F("vis_given", "Vaccine information statements given", "checkbox"),
        F("vaccine_declined", "Vaccines declined or deferred, and why", "text"),
    ]),

    ("Assessment & Plan", "Assessment", [
        F("assessment", "Assessment and diagnoses", "textarea", req=True),
        F("growth_assessment", "Growth", "dropdown", "ped_growth"),
        F("development_assessment", "Development", "dropdown", "ped_dev_status"),
        F("assessment_notes", "Other findings and clinical reasoning", "textarea"),
    ]),
    ("Assessment & Plan", "Plan", [
        F("plan", "Plan", "textarea", req=True),
        F("orders_labs", "Tests and labs ordered", "textarea"),
        F("med_changes", "Medicine changes", "textarea"),
        F("referrals", "Referrals", "textarea"),
    ]),
    ("Assessment & Plan", "Anticipatory Guidance and Follow-up", [
        F("guidance_topics", "Anticipatory guidance given", "multiselect", "ped_guidance"),
        F("guidance_notes", "Guidance notes", "text"),
        F("return_precautions", "Return precautions given to the family", "checkbox"),
        F("followup", "Follow-up", "dropdown", "amb_followup"),
        F("next_well_visit", "Next well-child visit due", "text"),
    ]),
]

TEMPLATES = [
    # code, name, note type value, note type label, role that may write it ("" = any clinician), sections
    ("general_pediatric_note", "General Pediatric Note", "pediatric_visit", "Pediatric visit", "", PEDIATRIC),
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

    types = Dictionary.objects.filter(code="note_types").first()
    for code, name, type_value, type_label, role, sections in TEMPLATES:
        if types is not None:
            DictionaryItem.objects.get_or_create(
                dictionary=types, value=type_value,
                defaults={"label": type_label, "sort_order": 140, "author_role": role})
        template, created = NoteTemplate.objects.get_or_create(
            code=code, defaults={"name": name, "version": 1, "is_active": True, "note_type": type_value})
        if not created:
            continue  # a clinic already has this template: never overwrite its edits
        made, order = {}, 0
        for tab, section, fields in sections:
            for f in fields:
                made[f["key"]] = NoteFieldDefinition.objects.create(
                    template=template, key=f["key"], label=f["label"], field_type=f["type"],
                    tab_label=tab, section_label=section, required=f["req"], sort_order=order * 10,
                    help_text=f["help"], calc=f["calc"],
                    dictionary=dictionaries[f["dict"]] if f["dict"] else None)
                order += 1
        for _tab, _section, fields in sections:
            for f in fields:
                if f["dep"]:
                    field = made[f["key"]]
                    field.depends_on = made[f["dep"]]
                    field.depends_on_value = f["val"]
                    field.save(update_fields=["depends_on", "depends_on_value"])


def unseed(apps, schema_editor):
    apps.get_model("appointments", "NoteTemplate").objects.filter(
        code__in=[t[0] for t in TEMPLATES]).delete()


class Migration(migrations.Migration):
    dependencies = [("appointments", "0087_unit_is_surgical")]
    operations = [migrations.RunPython(seed, unseed)]
