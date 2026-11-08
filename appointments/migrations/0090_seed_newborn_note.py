"""Newborn Note: a tabbed physician note for the nursery and the first days of life.

Tabs: Birth History, Newborn Exam, Feeding and Output, Screening and Prophylaxis, Assessment and Plan, Attestation.

The Birth History tab holds gestational age (weeks and days) and birth weight. Every save of the note copies them to the
patient's record (see appointments/pediatric_sync.py) so the growth charts can plot a premature baby at corrected age.
Diagnoses use the ICD-10 picker (field type "icd10").
Templates and dictionaries that already exist are left alone, so re-running this never overwrites a clinic's edits.
"""

from django.db import migrations

DICTIONARIES = {
    "amb_exam_status": ("Ambulatory: exam finding", [("normal", "Normal"), ("abnormal", "Abnormal"), ("not_examined", "Not examined")]),
    "ped_delivery": ("Pediatric: delivery", [
        ("vaginal", "Vaginal"), ("assisted", "Assisted vaginal (forceps or vacuum)"), ("cesarean_planned", "Cesarean, planned"),
        ("cesarean_urgent", "Cesarean, urgent"), ("unknown", "Unknown")]),
    "nb_blood_type": ("Newborn: maternal blood type and Rh", [
        ("o_pos", "O positive"), ("o_neg", "O negative"), ("a_pos", "A positive"), ("a_neg", "A negative"),
        ("b_pos", "B positive"), ("b_neg", "B negative"), ("ab_pos", "AB positive"), ("ab_neg", "AB negative"), ("unknown", "Unknown")]),
    "nb_prenatal_care": ("Newborn: prenatal care", [
        ("regular", "Regular"), ("limited", "Limited"), ("none", "None"), ("unknown", "Unknown")]),
    "nb_serology": ("Newborn: maternal test result", [
        ("negative", "Negative or non-reactive"), ("positive", "Positive or reactive"), ("unknown", "Unknown or not tested")]),
    "nb_rubella": ("Newborn: maternal rubella", [("immune", "Immune"), ("non_immune", "Not immune"), ("unknown", "Unknown")]),
    "nb_steroids": ("Newborn: antenatal steroids", [
        ("complete", "Complete course"), ("partial", "Partial course"), ("none", "None"), ("unknown", "Unknown")]),
    "nb_presentation": ("Newborn: presentation", [
        ("vertex", "Vertex"), ("breech", "Breech"), ("transverse", "Transverse"), ("other", "Other")]),
    "nb_rom": ("Newborn: rupture of membranes", [
        ("spontaneous", "Spontaneous"), ("artificial", "Artificial"), ("at_delivery", "At delivery"), ("unknown", "Unknown")]),
    "nb_fluid": ("Newborn: amniotic fluid", [
        ("clear", "Clear"), ("meconium", "Meconium stained"), ("bloody", "Bloody"), ("foul", "Foul smelling"), ("unknown", "Unknown")]),
    "nb_anesthesia": ("Newborn: maternal anesthesia", [
        ("none", "None"), ("epidural", "Epidural"), ("spinal", "Spinal"), ("general", "General"), ("local", "Local"), ("other", "Other")]),
    "nb_resus": ("Newborn: resuscitation", [
        ("routine", "Routine care: dry, warm, stimulate"), ("oxygen", "Free-flow oxygen"), ("ppv", "Positive-pressure ventilation"),
        ("cpap", "CPAP"), ("intubation", "Intubation"), ("compressions", "Chest compressions or medications")]),
    "nb_feeding_method": ("Newborn: feeding method", [
        ("breast", "Breast milk"), ("formula", "Formula"), ("both", "Breast milk and formula"), ("tube", "Tube feeding"), ("other", "Other")]),
    "nb_latch": ("Newborn: latch and suck", [
        ("good", "Good latch, effective suck"), ("fair", "Fair latch, needs help"), ("poor", "Poor latch or weak suck"),
        ("not_breastfeeding", "Not breastfeeding")]),
    "nb_lactation": ("Newborn: lactation consult", [("not_seen", "Not seen"), ("seen", "Seen"), ("declined", "Declined")]),
    "nb_stool": ("Newborn: stool", [
        ("meconium", "Meconium"), ("transitional", "Transitional, green-brown"), ("yellow", "Yellow, seedy"), ("none", "No stool yet")]),
    "nb_jaundice": ("Newborn: visible jaundice", [
        ("none", "None"), ("face", "Face only"), ("chest", "To the chest"), ("abdomen", "To the abdomen"),
        ("legs", "To the legs"), ("hands_feet", "To the hands and feet")]),
    "nb_serum_bili": ("Newborn: serum bilirubin", [("not_drawn", "Not drawn"), ("drawn", "Drawn")]),
    "nb_photo": ("Newborn: phototherapy", [
        ("not_needed", "Not needed"), ("started", "Started"), ("in_progress", "In progress"), ("completed", "Completed")]),
    "nb_given": ("Newborn: prophylaxis given", [("given", "Given"), ("declined", "Declined by family"), ("not_given", "Not given")]),
    "nb_screen_state": ("Newborn: screen state", [("not_done", "Not done"), ("collected", "Collected"), ("resulted", "Resulted")]),
    "nb_pass_refer": ("Newborn: screen result", [("not_done", "Not done"), ("pass", "Pass"), ("refer", "Refer or fail")]),
    "nb_carseat": ("Newborn: car seat tolerance screen", [
        ("not_done", "Not done"), ("pass", "Pass"), ("fail", "Fail"), ("not_needed", "Not needed")]),
    "nb_followup": ("Newborn: follow-up visit", [
        ("24h", "Within 24 hours of discharge"), ("48h", "Within 48 hours of discharge"), ("1w", "Within 1 week"), ("other", "Other")]),
    "nb_attest": ("Newborn: attestation", [
        ("personal", "I personally examined this newborn and reviewed the history above"),
        ("with_resident", "I saw and examined this newborn with the resident or nurse practitioner and agree with the findings")]),
}

NB_EXAM = [
    "General appearance", "Skin", "Head and fontanelles", "Eyes and red reflex", "Ears, nose, mouth and palate",
    "Neck and clavicles", "Chest and lungs", "Heart and femoral pulses", "Abdomen and umbilical cord",
    "Genitalia and anus", "Hips (Ortolani and Barlow)", "Spine and extremities", "Neurologic: tone and reflexes",
]


def F(key, label, ftype, dic=None, req=False, help="", dep=None, val=None, calc=None):
    return {"key": key, "label": label, "type": ftype, "dict": dic, "req": req, "help": help,
            "dep": dep, "val": val, "calc": calc or {}}


def slug(text):
    out = "".join(c if c.isalnum() else "_" for c in text.lower())
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


def exam_fields():
    out = []
    for system in NB_EXAM:
        s = slug(system)[:40]
        out.append(F(f"nb_{s}_status", system, "radio", "amb_exam_status"))
        out.append(F(f"nb_{s}_findings", f"{system}: findings", "text", dep=f"nb_{s}_status", val="abnormal"))
    return out


def given(key, label, detail_label):
    return [F(f"{key}_status", label, "dropdown", "nb_given"),
            F(f"{key}_time", f"{label}: date and time", "text"),
            F(f"{key}_detail", f"{label}: {detail_label}", "text")]


def screen(key, label, dic, detail_label):
    return [F(f"{key}_result", label, "dropdown", dic),
            F(f"{key}_time", f"{label}: date and time", "text"),
            F(f"{key}_detail", f"{label}: {detail_label}", "text")]


WEIGHT_CHANGE_CALC = {
    "operation": "formula",
    "formula": "(weight_today_g - birth_weight_g) / birth_weight_g * 100",
    "sources": ["weight_today_g", "birth_weight_g"],
    "require_all": True,
    "decimals": 1,
    "bands": [
        {"min": None, "max": -10, "label": "Loss of 10 % or more: review"},
        {"min": -9.9, "max": None, "label": "Less than 10 % loss"},
    ],
    "alerts": [],
}

# (tab, section, [fields])
NEWBORN = [
    ("Birth History", "Maternal History", [
        F("maternal_age", "Mother's age (years)", "numeric"),
        F("gravida_para", "Gravida / para", "text", help="For example G2 P1."),
        F("maternal_blood_type", "Maternal blood type and Rh", "dropdown", "nb_blood_type"),
        F("prenatal_care", "Prenatal care", "dropdown", "nb_prenatal_care"),
        F("gbs_status", "Group B strep", "dropdown", "nb_serology"),
        F("hbsag_status", "Hepatitis B surface antigen", "dropdown", "nb_serology"),
        F("hiv_status", "HIV", "dropdown", "nb_serology"),
        F("rpr_status", "Syphilis (RPR)", "dropdown", "nb_serology"),
        F("rubella_status", "Rubella", "dropdown", "nb_rubella"),
        F("antenatal_steroids", "Antenatal steroids", "dropdown", "nb_steroids"),
        F("pregnancy_complications", "Pregnancy complications", "textarea"),
    ]),
    ("Birth History", "Delivery", [
        F("birth_date", "Date of birth", "date"),
        F("birth_time", "Time of birth (24-hour)", "text", help="For example 03:42."),
        F("delivery_type", "Delivery type", "dropdown", "ped_delivery"),
        F("presentation", "Presentation", "dropdown", "nb_presentation"),
        F("rom_type", "Rupture of membranes", "dropdown", "nb_rom"),
        F("rom_hours", "Rupture of membranes: duration (hours)", "numeric"),
        F("amniotic_fluid", "Amniotic fluid", "dropdown", "nb_fluid"),
        F("maternal_anesthesia", "Maternal anesthesia", "dropdown", "nb_anesthesia"),
        F("delivery_comments", "Delivery comments", "textarea"),
    ]),
    ("Birth History", "Birth Measurements", [
        F("gestational_age_weeks", "Gestational age at birth (completed weeks)", "numeric",
          help="20 to 45. Feeds the growth charts: a baby born before 37 weeks is plotted at corrected age until 24 months. "
               "If it is unknown, leave it blank and the charts assume a term birth."),
        F("gestational_age_days", "Plus days", "numeric", help="0 to 6."),
        F("birth_weight_g", "Birth weight (grams)", "numeric", help="200 to 8000 grams. For example 3.5 kg is 3500."),
        F("birth_length_cm", "Birth length (cm)", "numeric"),
        F("birth_head_cm", "Birth head circumference (cm)", "numeric"),
    ]),
    ("Birth History", "Apgar Scores and Resuscitation", [
        F("apgar_1", "Apgar at 1 minute", "numeric", help="0 to 10."),
        F("apgar_5", "Apgar at 5 minutes", "numeric", help="0 to 10."),
        F("apgar_10", "Apgar at 10 minutes", "numeric", help="Record it when the 5-minute score is below 7."),
        F("resuscitation", "Resuscitation", "dropdown", "nb_resus"),
    ]),

    ("Newborn Exam", "Vital Signs", [
        F("vitals_chart", "Latest vital signs (from the chart)", "chart_data", calc={"source": "vitals"},
          help="Read from the Vital Signs flowsheet. A snapshot is saved when the note is signed."),
    ]),
    ("Newborn Exam", "Physical Examination", exam_fields()),
    ("Newborn Exam", "Additional Findings", [
        F("exam_additional", "Anything not covered above", "textarea"),
    ]),

    ("Feeding and Output", "Feeding", [
        F("feeding_method", "Feeding method", "dropdown", "nb_feeding_method"),
        F("feeds_24h", "Feeds in the last 24 hours", "numeric"),
        F("latch", "Latch and suck", "dropdown", "nb_latch"),
        F("lactation_consult", "Lactation consult", "dropdown", "nb_lactation"),
        F("feeding_comments", "Supplementation and feeding comments", "textarea"),
    ]),
    ("Feeding and Output", "Weight Change", [
        F("weight_today_g", "Current weight (grams)", "numeric", help="Compared with the birth weight on the Birth History tab."),
        F("weight_change_pct", "Change from birth weight (%)", "calculated", calc=WEIGHT_CHANGE_CALC,
          help="A prompt for review at a loss of 10 % or more. It is not a diagnosis."),
    ]),
    ("Feeding and Output", "Urine and Stool Output", [
        F("wet_diapers_24h", "Wet diapers in the last 24 hours", "numeric"),
        F("stools_24h", "Stools in the last 24 hours", "numeric"),
        F("stool_character", "Stool", "dropdown", "nb_stool"),
        F("meconium_24h", "Meconium passed within 24 hours", "checkbox"),
        F("first_void", "First void (date and time)", "text"),
        F("first_stool", "First stool (date and time)", "text"),
    ]),
    ("Feeding and Output", "Jaundice", [
        F("jaundice_visible", "Visible jaundice", "dropdown", "nb_jaundice"),
        F("serum_bilirubin", "Serum bilirubin", "dropdown", "nb_serum_bili"),
        F("phototherapy", "Phototherapy", "dropdown", "nb_photo"),
        F("jaundice_notes", "Jaundice notes", "textarea",
          help="Phototherapy thresholds depend on gestational age and risk factors. Compare the bilirubin (see Screening) with the "
               "clinic's threshold for this baby's gestational age, recorded on the Birth History tab."),
    ]),

    ("Screening and Prophylaxis", "Prophylaxis",
     given("vitamin_k", "Vitamin K (phytonadione)", "dose and site")
     + given("eye_ointment", "Erythromycin eye ointment", "eyes treated")
     + given("hepatitis_b", "Hepatitis B vaccine, dose 1", "site and lot")),
    ("Screening and Prophylaxis", "Screening",
     screen("metabolic", "Newborn metabolic screen", "nb_screen_state", "result or reference number")
     + screen("hearing", "Hearing screen", "nb_pass_refer", "each ear")
     + screen("cchd", "Critical congenital heart disease screen (pulse oximetry)", "nb_pass_refer", "right hand and foot saturations")
     + screen("bilirubin", "Transcutaneous bilirubin", "nb_screen_state", "value (mg/dL) and age in hours")
     + [F("carseat_result", "Car seat tolerance screen", "dropdown", "nb_carseat",
          help="Recommended before discharge for babies born before 37 weeks. A prompt for review, not an order."),
        F("carseat_notes", "Car seat tolerance screen: notes", "text")]),

    ("Assessment and Plan", "Diagnoses", [
        F("diagnoses", "Diagnoses (ICD-10)", "icd10",
          help="Search by code or name, for example P07.39 or preterm."),
    ]),
    ("Assessment and Plan", "Assessment and Plan", [
        F("assessment", "Assessment", "textarea", req=True),
        F("plan_feeding", "Feeding plan", "textarea"),
        F("plan_jaundice", "Jaundice plan", "textarea"),
        F("plan_screening", "Screening follow-up", "textarea"),
        F("family_teaching", "Family teaching", "textarea"),
    ]),
    ("Assessment and Plan", "Follow-up and Discharge Readiness", [
        F("followup", "Follow-up visit", "dropdown", "nb_followup"),
        F("followup_with", "Follow-up with", "text"),
        F("dc_feeding", "Feeding established", "checkbox"),
        F("dc_weight", "Weight loss under 10 %", "checkbox"),
        F("dc_bilirubin", "Bilirubin plan in place", "checkbox"),
        F("dc_hepb", "Hepatitis B vaccine given", "checkbox"),
        F("dc_metabolic", "Metabolic screen collected", "checkbox"),
        F("dc_hearing", "Hearing screen passed", "checkbox"),
        F("dc_cchd", "Heart screen passed", "checkbox"),
        F("dc_carseat", "Car seat tolerance screen done (if born before 37 weeks)", "checkbox"),
    ]),

    ("Attestation", "Attestation", [
        F("attestation", "Attestation statement", "dropdown", "nb_attest", req=True),
        F("examined_on", "Examined on (date and time)", "text"),
        F("time_spent_min", "Time spent (minutes)", "numeric"),
    ]),
]

TEMPLATES = [
    # code, name, note type value, note type label, role that may write it ("" = any clinician), sections
    ("newborn_note", "Newborn Note", "newborn_visit", "Newborn visit", "doctor", NEWBORN),
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
                defaults={"label": type_label, "sort_order": 150, "author_role": role})
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
    dependencies = [("appointments", "0089_icd10_field_type")]
    operations = [migrations.RunPython(seed, unseed)]
