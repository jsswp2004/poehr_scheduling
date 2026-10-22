"""Two ambulatory notes, built from a clinic's own section lists:

* General Ambulatory Note (physician, note type "Office visit"), 24 sections on 7 tabs.
* Ambulatory Nursing Note (note type "Nursing assessment"), 25 sections on 8 tabs.

Parts of the chart (problem list, allergies, medicines, results, vitals, immunizations, Health Manager)
are "Chart data" fields: shown read-only, with the server keeping a snapshot in the note. Everything else
is an ordinary field the clinic can edit in the Note Builder. Templates and dictionaries that already
exist are left alone, so re-running this never overwrites a clinic's edits.
"""

from django.db import migrations

YES_NO = ("Yes / No", [("yes", "Yes"), ("no", "No")])

DICTIONARIES = {
    "yes_no": YES_NO,
    "amb_visit_type": ("Ambulatory: type of visit", [
        ("new_patient", "New patient"), ("established", "Established patient"), ("follow_up", "Follow-up"),
        ("acute", "Acute or sick visit"), ("annual", "Annual or preventive"), ("post_hospital", "Post-hospital follow-up"),
        ("telehealth", "Telehealth")]),
    "amb_severity": ("Ambulatory: severity", [("mild", "Mild"), ("moderate", "Moderate"), ("severe", "Severe")]),
    "amb_barrier": ("Ambulatory: main barrier to self-management", [
        ("none", "None"), ("cost", "Cost"), ("transport", "Transportation"), ("schedule", "Work or family schedule"),
        ("understanding", "Understanding the condition"), ("motivation", "Motivation"), ("other", "Other")]),
    "amb_tobacco": ("Ambulatory: tobacco status", [
        ("never", "Never used"), ("former", "Former user"), ("current_daily", "Current, every day"),
        ("current_some", "Current, some days"), ("unknown", "Unknown")]),
    "amb_directive_type": ("Ambulatory: advance directive type", [
        ("proxy", "Health care proxy"), ("living_will", "Living will"), ("molst", "MOLST"), ("dnr", "DNR / DNI"), ("other", "Other")]),
    "amb_adherence": ("Ambulatory: medicine adherence", [
        ("as_directed", "Takes as directed"), ("misses_some", "Misses doses sometimes"), ("not_taking", "Not taking"), ("unknown", "Unknown")]),
    "amb_ros_status": ("Ambulatory: review of systems", [("negative", "Negative"), ("positive", "Positive"), ("not_reviewed", "Not reviewed")]),
    "amb_exam_status": ("Ambulatory: exam finding", [("normal", "Normal"), ("abnormal", "Abnormal"), ("not_examined", "Not examined")]),
    "amb_alcohol": ("Ambulatory: alcohol use", [("none", "None"), ("occasional", "Occasional"), ("moderate", "Moderate"), ("heavy", "Heavy")]),
    "amb_screen_result": ("Ambulatory: screening result", [("not_done", "Not done"), ("negative", "Negative"), ("positive", "Positive")]),
    "amb_specialty": ("Ambulatory: referral specialty", [
        ("cardiology", "Cardiology"), ("endocrinology", "Endocrinology"), ("gastroenterology", "Gastroenterology"),
        ("neurology", "Neurology"), ("ophthalmology", "Ophthalmology"), ("orthopedics", "Orthopedics"),
        ("dermatology", "Dermatology"), ("psychiatry", "Psychiatry / behavioral health"), ("ob_gyn", "OB/GYN"),
        ("urology", "Urology"), ("ent", "ENT"), ("pulmonology", "Pulmonology"), ("nephrology", "Nephrology"),
        ("physical_therapy", "Physical therapy"), ("other", "Other")]),
    "amb_urgency": ("Ambulatory: urgency", [("routine", "Routine"), ("soon", "Within 2 weeks"), ("urgent", "Urgent")]),
    "amb_visit_level": ("Ambulatory: level of service", [
        ("1", "Level 1 (nurse visit)"), ("2", "Level 2 (straightforward)"), ("3", "Level 3 (low complexity)"),
        ("4", "Level 4 (moderate complexity)"), ("5", "Level 5 (high complexity)")]),
    "amb_followup": ("Ambulatory: follow-up", [
        ("1w", "1 week"), ("2w", "2 weeks"), ("1m", "1 month"), ("3m", "3 months"), ("6m", "6 months"),
        ("12m", "12 months"), ("prn", "As needed")]),
    "amb_arrival": ("Ambulatory: mode of arrival", [
        ("walking", "Walking"), ("wheelchair", "Wheelchair"), ("stretcher", "Stretcher"), ("carried", "Carried"), ("ambulance", "Ambulance")]),
    "amb_history_from": ("Ambulatory: history obtained from", [
        ("patient", "Patient"), ("parent", "Parent"), ("family", "Family member"), ("caregiver", "Caregiver"),
        ("interpreter", "Interpreter"), ("records", "Records")]),
    "amb_appearance": ("Ambulatory: general appearance", [
        ("well", "Well appearing"), ("ill", "Ill appearing"), ("pale", "Pale"), ("flushed", "Flushed"),
        ("diaphoretic", "Diaphoretic"), ("cyanotic", "Cyanotic"), ("jaundiced", "Jaundiced"), ("poor_hygiene", "Poor hygiene")]),
    "amb_distress": ("Ambulatory: distress", [("none", "No distress"), ("mild", "Mild"), ("moderate", "Moderate"), ("severe", "Severe")]),
    "amb_pain_character": ("Ambulatory: pain character", [
        ("sharp", "Sharp"), ("dull", "Dull"), ("aching", "Aching"), ("burning", "Burning"), ("throbbing", "Throbbing"),
        ("stabbing", "Stabbing"), ("cramping", "Cramping")]),
    "amb_risk_factors": ("Ambulatory: health risk factors", [
        ("smoking", "Smoking or tobacco"), ("alcohol", "Alcohol"), ("drugs", "Drug use"), ("obesity", "Overweight or obesity"),
        ("sedentary", "Little physical activity"), ("poor_diet", "Poor diet"), ("family_history", "Strong family history"),
        ("unsafe_sex", "Unprotected sex"), ("no_seatbelt", "No seat belt or helmet"), ("stress", "High stress")]),
    "amb_stability": ("Ambulatory: stability", [("stable", "Stable"), ("at_risk", "At risk"), ("unstable", "Unstable")]),
    "amb_insurance": ("Ambulatory: insurance", [
        ("insured", "Insured"), ("underinsured", "Underinsured"), ("pending", "Coverage pending"), ("uninsured", "Uninsured")]),
    "amb_risk_level": ("Ambulatory: risk level", [("low", "Low"), ("moderate", "Moderate"), ("high", "High")]),
    "phq_score": ("Score 0 to 3 (PHQ-9, GAD-2)", [
        ("0", "0 - Not at all"), ("1", "1 - Several days"), ("2", "2 - More than half the days"), ("3", "3 - Nearly every day")]),
    "amb_interdisc": ("Ambulatory: team members involved", [
        ("social_work", "Social work"), ("nutrition", "Nutrition"), ("pharmacy", "Pharmacy"), ("behavioral", "Behavioral health"),
        ("case_mgmt", "Case management"), ("pt_ot", "PT / OT"), ("interpreter", "Interpreter services")]),
    "amb_immune_status": ("Ambulatory: immunization status", [
        ("up_to_date", "Up to date"), ("due", "Due"), ("overdue", "Overdue"), ("declined", "Declined"), ("unknown", "Unknown")]),
    "amb_edu_topics": ("Ambulatory: patient education topics", [
        ("medications", "Medicines"), ("diet", "Diet"), ("exercise", "Exercise"), ("disease", "The condition"),
        ("symptoms", "Symptoms to report"), ("follow_up", "Follow-up"), ("smoking", "Quitting tobacco"),
        ("injection", "Injection technique"), ("glucose", "Glucose monitoring"), ("bp", "Blood pressure monitoring"),
        ("wound", "Wound care"), ("other", "Other")]),
    "amb_edu_method": ("Ambulatory: teaching method", [
        ("verbal", "Verbal"), ("written", "Written"), ("demonstration", "Demonstration"), ("video", "Video"), ("interpreter", "With interpreter")]),
    "amb_edu_learner": ("Ambulatory: learner", [("patient", "Patient"), ("parent", "Parent"), ("caregiver", "Caregiver"), ("family", "Family")]),
    "amb_dispo": ("Ambulatory: disposition", [
        ("home", "Home"), ("ed", "Sent to the ED"), ("admitted", "Admitted"), ("specialist", "Sent to a specialist"), ("other", "Other")]),
    "amb_condition": ("Ambulatory: condition at disposition", [
        ("stable", "Stable"), ("improved", "Improved"), ("unchanged", "Unchanged"), ("worsened", "Worsened")]),
    "amb_glucose_monitoring": ("Ambulatory: glucose monitoring", [
        ("daily", "Daily"), ("few_week", "A few times a week"), ("rarely", "Rarely"), ("never", "Never")]),
}

ROS_SYSTEMS = [
    "General", "Eyes", "Ears, nose, mouth and throat", "Cardiovascular", "Respiratory", "Gastrointestinal",
    "Genitourinary", "Musculoskeletal", "Skin and breast", "Neurological", "Psychiatric", "Endocrine",
    "Hematologic and lymphatic", "Allergic and immunologic",
]
EXAM_SYSTEMS = [
    "General", "Head, eyes, ears, nose and throat", "Neck", "Cardiovascular", "Respiratory", "Abdomen",
    "Musculoskeletal", "Extremities", "Neurological", "Skin", "Psychiatric",
]


def F(key, label, ftype, dic=None, req=False, help="", dep=None, val=None, calc=None):
    return {"key": key, "label": label, "type": ftype, "dict": dic, "req": req, "help": help,
            "dep": dep, "val": val, "calc": calc or {}}


def chart(key, label, source, help=""):
    return F(key, label, "chart_data", calc={"source": source}, help=help)


def slug(text):
    return "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_").replace("__", "_")


def ros_fields():
    out = []
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
    return out


def phq_items():
    questions = [
        "Little interest or pleasure in doing things",
        "Feeling down, depressed or hopeless",
        "Trouble falling or staying asleep, or sleeping too much",
        "Feeling tired or having little energy",
        "Poor appetite or overeating",
        "Feeling bad about yourself, or that you are a failure or have let yourself or your family down",
        "Trouble concentrating on things, such as reading or watching television",
        "Moving or speaking so slowly that others noticed, or being much more restless than usual",
        "Thoughts that you would be better off dead, or of hurting yourself in some way",
    ]
    items = [F(f"phq9_{i}", f"{i}. {q}", "radio", "phq_score") for i, q in enumerate(questions, 1)]
    items.append(F("phq9_total", "PHQ-9 total", "calculated", calc={
        "operation": "sum", "sources": [f"phq9_{i}" for i in range(1, 10)], "require_all": True, "decimals": 0,
        "bands": [
            {"min": 0, "max": 4, "label": "Minimal depression"}, {"min": 5, "max": 9, "label": "Mild depression"},
            {"min": 10, "max": 14, "label": "Moderate depression"}, {"min": 15, "max": 19, "label": "Moderately severe depression"},
            {"min": 20, "max": 27, "label": "Severe depression"}],
        "alerts": [{"source": "phq9_9", "min": 1,
                    "message": "Item 9 is above 0: assess suicide risk before the patient leaves and tell the provider."}]}))
    return items


# (tab, section, [fields])
PHYSICIAN = [
    ("Visit", "Reason for Visit", [
        F("visit_type", "Type of visit", "dropdown", "amb_visit_type"),
        F("chief_complaint", "Chief complaint", "text", req=True),
        F("reason_own_words", "Reason for visit, in the patient's words", "text"),
    ]),
    ("Visit", "Nursing Flowsheets", [chart("nursing_vitals", "Nursing flowsheet: latest vital signs", "vitals")]),
    ("Visit", "HPI", [
        F("hpi", "History of present illness", "textarea", req=True),
        F("hpi_onset", "Onset", "text"), F("hpi_duration", "Duration", "text"),
        F("hpi_severity", "Severity", "radio", "amb_severity"),
        F("hpi_modifying", "Aggravating and relieving factors", "text"),
        F("hpi_associated", "Associated symptoms", "text"),
    ]),
    ("History", "Self-Management", [
        F("sm_goal", "Patient's goal", "text"), F("sm_barrier", "Main barrier", "dropdown", "amb_barrier"),
        F("sm_tobacco", "Tobacco status", "dropdown", "amb_tobacco"),
        F("sm_diet_counselled", "Diet counselling given", "checkbox"),
        F("sm_exercise_counselled", "Exercise counselling given", "checkbox"),
    ]),
    ("History", "Advance Directive", [
        F("ad_on_file", "Advance directive on file", "radio", "yes_no"),
        F("ad_type", "Type", "dropdown", "amb_directive_type", dep="ad_on_file", val="yes"),
        F("ad_discussed", "Discussed today", "checkbox"), F("ad_notes", "Notes", "text"),
    ]),
    ("History", "Problem List", [
        chart("problem_list", "Problem list", "problems"),
        F("problems_reviewed", "Problem list reviewed with the patient", "checkbox"),
        F("problems_update", "Update to problems today", "textarea"),
    ]),
    ("History", "Significant Events", [
        F("events_since_last", "Hospital stays, ED visits or surgery since the last visit", "textarea")]),
    ("History", "PFSH", [
        F("pmh", "Past medical history", "textarea"), F("psh", "Past surgical history", "textarea"),
        F("family_history", "Family history", "textarea"), F("social_history", "Social history", "textarea"),
        F("pfsh_reviewed", "Past, family and social history reviewed", "checkbox"),
    ]),
    ("History", "Allergies", [
        chart("allergy_list", "Allergies", "allergies"),
        F("allergies_reviewed", "Allergies reviewed with the patient", "checkbox"),
        F("allergies_new", "New allergy or reaction", "text"),
    ]),
    ("History", "Outpatient Meds", [
        chart("medication_list", "Outpatient medications", "medications"),
        F("meds_reconciled", "Medication list reconciled", "checkbox"),
        F("meds_adherence", "Adherence", "dropdown", "amb_adherence"),
        F("meds_changes", "Medication changes today", "textarea"),
    ]),
    ("Exam", "ROS", ros_fields() + [F("ros_comments", "Review of systems comments", "textarea")]),
    ("Exam", "Physical Exam", exam_fields() + [F("pe_comments", "Physical exam comments", "textarea")]),
    ("Exam", "Body Images", [F("body_image_notes", "Findings marked on the body diagram", "textarea",
                                help="Describe the site and finding. Image upload comes later.")]),
    ("Prevention", "Health Manager", [
        chart("health_manager_due", "Health Manager: due and overdue", "health_manager"),
        F("hm_addressed", "Due items addressed today", "checkbox"), F("hm_comment", "Comment", "text"),
    ]),
    ("Prevention", "Screening", [
        F("scr_alcohol", "Alcohol use", "dropdown", "amb_alcohol"),
        F("scr_falls", "Fall risk", "radio", "yes_no"),
        F("scr_depression", "Depression screen", "dropdown", "amb_screen_result"),
        F("scr_comment", "Screening comment", "textarea"),
    ]),
    ("Results & Orders", "Laboratory Results", [
        chart("lab_results", "Laboratory results", "labs"),
        F("labs_reviewed", "Results reviewed with the patient", "checkbox"), F("labs_comment", "Comment", "textarea"),
    ]),
    ("Results & Orders", "DX, Orders, Rx", [
        F("dx_primary", "Primary diagnosis (ICD-10 and description)", "text", req=True),
        F("dx_other", "Other diagnoses (ICD-10 and description)", "textarea"),
        F("orders_today", "Orders placed today", "textarea"), F("rx_today", "Prescriptions written today", "textarea"),
    ]),
    ("Results & Orders", "Referral", [
        F("referral_needed", "Referral needed", "radio", "yes_no"),
        F("referral_specialty", "Specialty", "dropdown", "amb_specialty", dep="referral_needed", val="yes"),
        F("referral_reason", "Reason", "text", dep="referral_needed", val="yes"),
        F("referral_urgency", "Urgency", "dropdown", "amb_urgency", dep="referral_needed", val="yes"),
    ]),
    ("Assessment & Plan", "Encounter Form", [
        F("visit_level", "Level of service", "dropdown", "amb_visit_level"),
        F("time_spent", "Total time on the day of the visit (minutes)", "numeric"),
        F("counselling_majority", "More than half the visit was counselling or coordination", "checkbox"),
    ]),
    ("Assessment & Plan", "Encounter Assessment and Plan", [
        F("assessment_plan", "Assessment and plan, by problem", "textarea", req=True),
        F("patient_instructions", "Patient instructions", "textarea"),
        F("followup_interval", "Follow-up", "dropdown", "amb_followup"),
    ]),
    ("Attestation", "PATH Statement for Interns/Residents/Fellows", [
        F("path_supervising", "Supervising physician", "text"),
        F("path_statement", "Statement", "textarea"),
        F("path_confirm", "I confirm this statement", "checkbox"),
    ]),
    ("Attestation", "PATH Primary Care Exception: Supervision Attestation", [
        F("pce_criteria", "Visit meets the primary care exception criteria", "checkbox"),
        F("pce_supervising", "Supervising physician", "text"),
        F("pce_confirm", "I confirm this attestation", "checkbox"),
    ]),
    ("Attestation", "Advanced Practice Practitioner Attestations", [
        F("app_collaborating", "Collaborating physician", "text"),
        F("app_statement", "Statement", "textarea"),
        F("app_confirm", "I confirm this statement", "checkbox"),
    ]),
]

NURSING = [
    ("Intake", "Initial Visit Details", [
        F("covid_travel", "COVID-19 screen: travel in the last 14 days", "radio", "yes_no"),
        F("covid_chart_review", "COVID-19 screen: chart reviewed", "checkbox"),
        F("visit_type", "Type of visit", "dropdown", "amb_visit_type"),
        F("reason_own_words", "Reason for visit, in the patient's own words", "text", req=True),
        F("arrival_mode", "Mode of arrival", "dropdown", "amb_arrival"),
        F("accompanied_by", "Patient is accompanied by", "text"),
        F("history_from", "History obtained from", "dropdown", "amb_history_from"),
        F("temperature", "Temperature (F)", "numeric"), F("heart_rate", "Heart rate (beats/min)", "numeric"),
        F("resp_rate", "Respiratory rate (breaths/min)", "numeric"), F("spo2", "Pulse oximetry (%)", "numeric"),
        F("peak_flow", "Peak flow rate (L/min)", "numeric"),
        F("bp_systolic", "BP systolic (mmHg)", "numeric"), F("bp_diastolic", "BP diastolic (mmHg)", "numeric"),
        F("weight_lb", "Weight (lb)", "numeric"), F("height_in", "Height (in)", "numeric"),
        F("capillary_glucose", "Capillary blood glucose (mg/dL)", "numeric"),
    ]),
    ("Vitals & Appearance", "Nursing Flowsheet", [chart("nursing_vitals", "Nursing vital sign flowsheet", "vitals")]),
    ("Vitals & Appearance", "Appearance", [
        F("appearance", "Appearance", "multiselect", "amb_appearance"),
        F("distress", "Distress", "dropdown", "amb_distress"), F("appearance_comment", "Comment", "text"),
    ]),
    ("Pain", "Pain Management", [
        F("pain_score", "Pain score (0 to 10)", "numeric", help="0 = no pain, 10 = worst pain"),
        F("pain_location", "Pain location", "text"),
        F("pain_character", "Pain character", "multiselect", "amb_pain_character"),
        F("pain_comprehensive", "Comprehensive pain assessment needed", "radio", "yes_no", help="Use when the score is 4 or more"),
        F("pain_onset", "Onset", "text", dep="pain_comprehensive", val="yes"),
        F("pain_duration", "Duration", "text", dep="pain_comprehensive", val="yes"),
        F("pain_aggravating", "Makes it worse", "text", dep="pain_comprehensive", val="yes"),
        F("pain_relieving", "Makes it better", "text", dep="pain_comprehensive", val="yes"),
        F("pain_interference", "Effect on sleep, work or daily activity", "text", dep="pain_comprehensive", val="yes"),
    ]),
    ("Meds & Allergies", "Allergies", [
        chart("allergy_list", "Allergies", "allergies"),
        F("allergies_reviewed", "Allergies reviewed with the patient", "checkbox"),
        F("allergies_new", "New allergy or reaction", "text"),
    ]),
    ("Meds & Allergies", "Outpatient Medications", [
        chart("medication_list", "Outpatient medications", "medications"),
        F("meds_reconciled", "Medication list reconciled", "checkbox"),
        F("meds_adherence", "Adherence", "dropdown", "amb_adherence"),
    ]),
    ("Self-Management & Risk", "Self-Management", [
        F("sm_tobacco", "Tobacco status", "dropdown", "amb_tobacco"),
        F("sm_cessation_offered", "Tobacco cessation help offered", "radio", "yes_no"),
        F("sm_adherence_testing", "Adherence testing", "text"),
        F("sm_diabetes", "Patient has diabetes (ADA guidelines)", "radio", "yes_no"),
        F("sm_dm_monitoring", "Checks blood glucose", "dropdown", "amb_glucose_monitoring", dep="sm_diabetes", val="yes"),
        F("sm_dm_foot", "Daily foot check taught", "checkbox", dep="sm_diabetes", val="yes"),
        F("sm_htn", "Patient has hypertension (JNC guidelines)", "radio", "yes_no"),
        F("sm_htn_home_bp", "Checks blood pressure at home", "radio", "yes_no", dep="sm_htn", val="yes"),
        F("sm_htn_salt", "Low-salt diet taught", "checkbox", dep="sm_htn", val="yes"),
        F("sm_chol", "Patient has high cholesterol (ATP guidelines)", "radio", "yes_no"),
        F("sm_chol_diet", "Diet taught", "checkbox", dep="sm_chol", val="yes"),
        F("sm_chf", "Patient has heart failure", "radio", "yes_no"),
        F("sm_chf_weights", "Weighs daily", "radio", "yes_no", dep="sm_chf", val="yes"),
        F("sm_chf_fluids", "Fluid and salt limits taught", "checkbox", dep="sm_chf", val="yes"),
    ]),
    ("Self-Management & Risk", "Health Risk Factors", [
        F("risk_factors", "Risk factors", "multiselect", "amb_risk_factors"), F("risk_comment", "Comment", "text")]),
    ("Self-Management & Risk", "Social Economic Factors", [
        F("se_housing", "Housing", "dropdown", "amb_stability"), F("se_food", "Food", "dropdown", "amb_stability"),
        F("se_transport", "Transportation", "dropdown", "amb_stability"), F("se_employment", "Employment", "dropdown", "amb_stability"),
        F("se_insurance", "Insurance", "dropdown", "amb_insurance"), F("se_comment", "Comment", "text"),
    ]),
    ("Screening", "SDOH Screening", [
        F("sdoh_housing", "Worried about losing your housing", "radio", "yes_no"),
        F("sdoh_food", "Worried about having enough food", "radio", "yes_no"),
        F("sdoh_utilities", "Trouble paying for utilities", "radio", "yes_no"),
        F("sdoh_transport", "Trouble getting to appointments", "radio", "yes_no"),
        F("sdoh_safety", "Feel unsafe at home", "radio", "yes_no", help="Ask privately"),
    ]),
    ("Screening", "STD/HIV Risk Assessment", [
        F("std_risk", "At risk for an STD or HIV", "radio", "yes_no"),
        F("std_testing_offered", "Testing offered", "checkbox"),
    ]),
    ("Screening", "TB Risk Assessment", [
        F("tb_cough", "Cough for 3 weeks or more", "radio", "yes_no"),
        F("tb_night_sweats", "Night sweats, fever or weight loss", "radio", "yes_no"),
        F("tb_exposure", "Contact with a person with TB", "radio", "yes_no"),
        F("tb_result", "Last TB test and result", "text"),
    ]),
    ("Screening", "Depression/Suicide Risk Assessment", [
        F("dep_down", "Over the last 2 weeks, felt down, depressed or hopeless", "radio", "yes_no"),
        F("dep_selfharm", "Thoughts of harming yourself", "radio", "yes_no"),
        F("dep_risk", "Risk level", "dropdown", "amb_risk_level"),
        F("dep_notify", "Provider told before the patient leaves", "checkbox"),
    ]),
    ("Screening", "PHQ-9 Screening", phq_items()),
    ("Screening", "Generalized Anxiety Disorder 2-item (GAD-2)", [
        F("gad2_1", "Feeling nervous, anxious or on edge", "radio", "phq_score"),
        F("gad2_2", "Not being able to stop or control worrying", "radio", "phq_score"),
        F("gad2_total", "GAD-2 total", "calculated", calc={
            "operation": "sum", "sources": ["gad2_1", "gad2_2"], "require_all": True, "decimals": 0,
            "bands": [{"min": 0, "max": 2, "label": "Negative screen"},
                      {"min": 3, "max": 6, "label": "Positive screen: needs further assessment"}]}),
    ]),
    ("Screening", "Maternal Depression Screening", [
        F("mat_postpartum", "Delivered within the last 12 months", "radio", "yes_no"),
        F("mat_result", "Screening result", "dropdown", "amb_screen_result", dep="mat_postpartum", val="yes"),
        F("mat_comment", "Comment", "text", dep="mat_postpartum", val="yes"),
    ]),
    ("Health & Education", "Interdisciplinary Screening", [
        F("inter_team", "Team members to involve", "multiselect", "amb_interdisc"),
        F("inter_reproductive", "Reproductive health", "text"),
        F("inter_checklist_done", "Checklist completed", "checkbox"),
    ]),
    ("Health & Education", "Health Manager", [
        chart("health_manager_due", "Health Manager: due and overdue", "health_manager"),
        F("hm_addressed", "Due items addressed today", "checkbox"),
    ]),
    ("Health & Education", "Immune Status", [
        chart("immunization_list", "Immunizations given", "immunizations"),
        F("immune_status", "Immune status", "dropdown", "amb_immune_status"),
        F("immune_comment", "Comment", "text"),
    ]),
    ("Health & Education", "Patient Education Log", [
        F("edu_topics", "Topics taught", "multiselect", "amb_edu_topics"),
        F("edu_method", "Method", "dropdown", "amb_edu_method"), F("edu_learner", "Learner", "dropdown", "amb_edu_learner"),
        F("edu_teachback", "Teach-back correct", "radio", "yes_no"), F("edu_comment", "Comment", "text"),
    ]),
    ("Procedure & Disposition", "Day of Procedure", [
        F("proc_consent", "Consent signed", "radio", "yes_no"), F("proc_timeout", "Time-out done", "radio", "yes_no"),
        F("proc_prep", "Preparation and instructions followed", "text"),
    ]),
    ("Procedure & Disposition", "Treatments/Procedures", [
        F("treatment_given", "Treatment or procedure", "textarea"), F("treatment_site", "Site", "text"),
        F("treatment_time", "Time", "text"), F("treatment_response", "Patient's response", "textarea"),
    ]),
    ("Procedure & Disposition", "Disposition of Patient", [
        F("dispo_to", "Disposition", "dropdown", "amb_dispo", req=True),
        F("dispo_condition", "Condition", "dropdown", "amb_condition"),
        F("dispo_accompanied", "Accompanied by", "text"),
        F("dispo_instructions", "Discharge instructions given", "checkbox"),
    ]),
    ("Procedure & Disposition", "Follow-up Nurse Visit", [
        F("fu_needed", "Nurse visit needed", "radio", "yes_no"),
        F("fu_date", "Date", "date", dep="fu_needed", val="yes"),
        F("fu_reason", "Reason", "text", dep="fu_needed", val="yes"),
    ]),
]

TEMPLATES = [
    # code, name, note type value, note type label, role that may write it, sections
    ("general_ambulatory_note", "General Ambulatory Note", "office_visit", "Office visit", "doctor", PHYSICIAN),
    ("ambulatory_nursing_note", "Ambulatory Nursing Note", "nursing_assessment", "Nursing Assessment", "nurse", NURSING),
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
                defaults={"label": type_label, "sort_order": 130, "author_role": role})
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
    dependencies = [("appointments", "0070_chart_data_field_type")]
    operations = [migrations.RunPython(seed, unseed)]
