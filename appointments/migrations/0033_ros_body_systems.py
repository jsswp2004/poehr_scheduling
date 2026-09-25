"""
Replaces the Admission Note's single-dropdown-per-system Review of Systems
with the Sunrise-style layout the user specified: each body system (or
sub-block, e.g. Genitourinary splits into "General" and "Male-Specific") is

    [ ] negative for...   [ ] positive for...   [ ] not asked   [ ] see HPI

and checking "negative for..." / "positive for..." reveals that block's own
checklist of specific negative / positive findings (multi-select, dictionary
-backed). This is the first real use of NoteFieldDefinition.depends_on /
depends_on_value (conditional visibility) and the new 'multiselect' field
type, both added in the previous migration.

Bumps NoteTemplate.version for admission_note since existing field
definitions are being replaced -- any note already signed against version 1
keeps rendering against its own frozen template_version snapshot.
"""

import re

from django.db import migrations


def slugify(label):
    value = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return value[:100]


# Shared status dictionary used by every body-system toggle row.
STATUS_OPTIONS = [
    ("negative_for", "Negative for..."),
    ("positive_for", "Positive for..."),
    ("not_asked", "Not Asked"),
    ("see_hpi", "See HPI"),
]

YES_NO_OPTIONS = [("yes", "Yes"), ("no", "No")]

# --- Review of Systems content, transcribed from the user's reference ------
# Each system is (system_key, system_label, has_comments, [blocks], [extra_fields])
# Each block is (block_suffix, block_label_for_dictionary, [negative labels], [positive labels])
# extra_fields (special one-off fields with no status/negative/positive of
# their own) is (key_suffix, label, field_type, options) -- options is a
# list of (value, label) for radio/dropdown/multiselect, else None.

ROS_SYSTEMS = [
    (
        "general", "General", True,
        [("", "General Symptoms",
          ["no fever", "no chills", "no sweating", "no anorexia", "no weight loss",
           "no weight gain", "no polyphagia", "no polyuria", "no polydipsia",
           "no malaise", "no fatigue"],
          ["fever", "chills", "sweating", "anorexia", "weight loss", "weight gain",
           "polyphagia", "polyuria", "polydipsia", "malaise", "fatigue"])],
        [],
    ),
    (
        "breast", "Breast", True,
        [("", "Breast Symptoms",
          ["no breast tenderness", "no breast pain", "no breast lumps", "no breast discharge"],
          ["tenderness", "lumps", "pain", "discharge"])],
        [],
    ),
    (
        "skin", "Skin", True,
        [("", "Skin Symptoms", [], [])],
        [],
    ),
    (
        "ophthalmologic", "Ophthalmologic", True,
        [("", "Ophthalmologic Symptoms",
          ["no diplopia", "normal lacrimation L", "no discharge L", "no discharge R",
           "no pain L", "no pain R", "no irritation L", "no irritation R",
           "no loss of vision L", "no loss of vision R", "no difficulty seeing"],
          ["diplopia L", "excessive lacrimation L", "irritation L", "pain L"])],
        [("corrective_lenses", "Corrective Lenses", "radio", YES_NO_OPTIONS)],
    ),
    (
        "enmt", "ENMT", True,
        [("", "ENMT Symptoms",
          ["no ear pain", "no throat pain", "no nasal discharge", "no hearing difficulty",
           "no tinnitus", "no vertigo", "no sinus symptoms", "no nasal congestion",
           "no nasal obstruction", "no post nasal drip", "no nose bleeds",
           "no recurrent cold sores", "no abnormal taste sensation", "no gum bleeding",
           "no dry mouth", "no odynophagia"],
          ["ear pain", "throat pain", "nasal discharge", "hearing difficulty",
           "tinnitus", "vertigo", "sinus symptoms", "nasal congestion",
           "nasal obstruction", "post-nasal discharge", "nose bleeds",
           "recurrent cold sores", "abnormal taste sensation", "gum bleeding",
           "dry mouth", "dysphagia"])],
        [],
    ),
    (
        "respiratory_thorax", "Respiratory and Thorax", True,
        [("", "Respiratory and Thorax Symptoms",
          ["no wheezing", "no dyspnea", "no cough", "no hemoptysis", "no pleuritic chest pain"],
          ["wheezing", "dyspnea", "cough", "hemoptysis", "pleuritic chest pain"])],
        [],
    ),
    (
        "cardiovascular", "Cardiovascular", True,
        [("", "Cardiovascular Symptoms",
          ["no palpitations", "no chest pain", "no dyspnea on exertion", "no orthopnea"],
          ["palpitations", "chest pain", "dyspnea on exertion", "orthopnea", "peripheral edema"])],
        [],
    ),
    (
        "gastrointestinal", "Gastrointestinal", True,
        [("", "Gastrointestinal Symptoms",
          ["no nausea", "no vomiting", "no diarrhea", "no constipation",
           "no change in bowel habits", "no flatulence", "no abdominal pain",
           "no melena", "no hematochezia", "no steatorrhea", "no jaundice",
           "no hiccoughs", "no dysphagia", "no heartburn"],
          ["nausea", "vomiting", "diarrhea", "constipation", "change in bowel habits",
           "flatulence", "abdominal pain", "melena", "hematochezia", "steatorrhea",
           "jaundice", "hiccoughs", "dysphagia"])],
        [],
    ),
    (
        "genitourinary", "Genitourinary", True,
        [
            ("general", "General Genitourinary Symptoms",
             ["no hematuria", "no renal colic", "no flank pain", "no urine discoloration",
              "no gas in urine", "no bladder infections", "no incontinence", "no dysuria",
              "no urinary hesitancy", "normal urinary frequency", "no nocturia",
              "normal libido", "no urgency", "no anuresis", "no kidney stones",
              "no kidney infection", "no genital sores", "no genital warts",
              "no urethral discharge"],
             ["none", "hematuria", "renal colic", "flank pain L", "flank pain R",
              "brown urine", "dark urine", "gas in urine", "bladder infections",
              "incontinence", "dysuria", "urinary hesitancy", "increased urinary frequency",
              "nocturia", "decreased libido", "urgency", "anuresis", "kidney stones",
              "kidney infection", "genital sores", "genital warts", "urethral discharge"]),
            ("male", "Male-Specific Symptoms",
             ["no impotence", "no ejaculatory dysfunction", "no erectile dysfunction",
              "no scrotal mass L", "no scrotal mass R", "no undescended testicle L",
              "no undescended testicle R"],
             ["none", "impotence", "ejaculatory dysfunction", "erectile dysfunction",
              "scrotal mass L", "scrotal mass R", "undescended testicle L",
              "undescended testicle R", "premature ejaculation",
              "difficulty initiating or maintaining urinary stream"]),
        ],
        [],
    ),
    (
        "musculoskeletal", "Musculoskeletal", True,
        [("", "Musculoskeletal Symptoms",
          ["no arthralgia", "no arthritis", "no joint swelling", "no myalgia",
           "no muscle cramps", "no muscle weakness", "no stiffness", "no neck pain",
           "no arm pain", "no back pain", "no leg pain"],
          ["arthralgia", "arthritis", "joint swelling", "myalgia", "muscle cramps",
           "muscle weakness", "stiffness", "neck pain", "back pain", "leg pain",
           "hip pain", "wrist pain"])],
        [],
    ),
    (
        "neurologic", "Neurologic", True,
        [("", "Neurologic Symptoms",
          ["no headache", "no stroke/TIA", "no seizure", "no memory loss",
           "no photophobia", "no transient paralysis", "no weakness", "no paresthesias",
           "no syncope", "no tremors", "no vertigo", "no loss of sensation",
           "no difficulty walking", "no loss of consciousness", "no hemiparesis",
           "no confusion", "no facial palsy"],
          ["headache", "stroke/TIA", "seizure", "memory loss", "photophobia",
           "transient paralysis", "weakness", "paresthesias", "syncope", "tremors",
           "vertigo", "loss of sensation", "difficulty walking", "loss of consciousness",
           "hemiparesis", "confusion", "facial palsy"])],
        [],
    ),
    (
        "psychiatric", "Psychiatric", True,
        [("", "Psychiatric Symptoms",
          ["no depression", "no anxiety", "no suicidal ideations", "no homicidal ideations",
           "no hallucinations", "no insomnia", "no memory loss", "no paranoia",
           "no mood swings", "no agitation", "no hyperactivity"],
          ["anxiety", "suicidal ideations", "homicidal ideations", "olfactory hallucinations",
           "insomnia", "memory loss", "paranoia", "mood swings", "agitation",
           "cries easily", "visual hallucinations", "auditory hallucinations",
           "hyperactivity"])],
        [("follow_up_plan", "Psychiatric Follow Up Plan", "multiselect",
          [("social_worker", "Social Worker"), ("psychiatrist", "Psychiatrist"),
           ("psychologist", "Psychologist"), ("pcp", "PCP")])],
    ),
    (
        "hematology_lymphatic", "Hematology/Lymphatics", True,
        [
            ("hematology", "Hematology Symptoms",
             ["doesn't bruise easily", "doesn't bleed easily", "no gum bleeding",
              "no nose bleeding", "no skin lumps", "no fever",
              "no excessive vaginal bleeding", "no anemia"],
             ["none", "bruises easily", "bleeds easily", "frequent gum bleeding",
              "frequent nose bleeding", "skin lumps", "fever",
              "excessive vaginal bleeding", "anemia"]),
            ("lymphatic", "Lymphatic Symptoms",
             ["no enlarged lymph nodes", "no tender lymph nodes", "no swelling of extremity"],
             ["none", "enlarged lymph nodes", "tender lymph nodes", "swelling of extremity"]),
        ],
        [],
    ),
    (
        "endocrine", "Endocrine", True,
        [("", "Endocrine Symptoms",
          ["no cold intolerance", "no heat intolerance", "no striae", "no voice change",
           "no hirsutism"],
          ["cold intolerance", "heat intolerance", "striae", "voice change", "hirsutism"])],
        [],
    ),
    (
        "allergic_immunologic", "Allergic/Immunologic", True,
        [
            ("reactions", "Allergic Reactions",
             ["no anaphylaxis", "no respiratory distress", "no photosensitivity", "no urticaria"],
             ["none", "anaphylaxis", "respiratory distress", "photosensitivity", "urticaria"]),
            ("types", "Allergy Types",
             ["no outdoor environmental allergies", "no indoor environmental allergies",
              "no reactions to medicines", "no reactions to food", "no reactions to animals",
              "no reactions to insect bites"],
             ["outdoor environmental allergies", "indoor environmental allergies",
              "reactions to medicines", "reactions to food", "reactions to animals",
              "reactions to insect bites"]),
            ("immunologic", "Immunological Symptoms",
             ["no recurring infections", "no persistent infections", "no recurring pneumonia"],
             ["none", "recurring infections", "persistent infections", "recurring pneumonia"]),
        ],
        [],
    ),
]


def seed(apps, schema_editor):
    Dictionary = apps.get_model("appointments", "Dictionary")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    NoteFieldDefinition = apps.get_model("appointments", "NoteFieldDefinition")

    template = NoteTemplate.objects.get(code="admission_note")

    # Remove the old single-dropdown ROS fields this replaces.
    old_ros_keys = [
        "ros_constitutional", "ros_cardiovascular", "ros_respiratory",
        "ros_gastrointestinal", "ros_genitourinary", "ros_musculoskeletal",
        "ros_neurological", "ros_psychiatric", "ros_skin",
    ]
    NoteFieldDefinition.objects.filter(template=template, key__in=old_ros_keys).delete()
    Dictionary.objects.filter(code="ros_finding").delete()

    status_dict, _ = Dictionary.objects.get_or_create(
        code="ros_status", defaults={"name": "Review of Systems Status"}
    )
    for i, (value, label) in enumerate(STATUS_OPTIONS):
        DictionaryItem.objects.get_or_create(
            dictionary=status_dict, value=value, defaults={"label": label, "sort_order": i}
        )

    def make_dictionary(code, name, items):
        if not items:
            return None
        dictionary, _ = Dictionary.objects.get_or_create(code=code, defaults={"name": name})
        for i, label in enumerate(items):
            DictionaryItem.objects.get_or_create(
                dictionary=dictionary,
                value=slugify(label),
                defaults={"label": label, "sort_order": i},
            )
        return dictionary

    # Push the fields that come after the Review of Systems section (Vital
    # Signs onward) far down the ordering, preserving their existing
    # relative sequence, so the new (much larger) ROS section fits between
    # History and Vital Signs without renumbering everything by hand.
    post_ros_keys_in_order = [
        "vital_bp", "vital_hr", "vital_rr", "vital_temp", "vital_spo2",
        "vital_height", "vital_weight", "physical_exam",
        "immunization_status", "advance_directive", "consent_acknowledged",
        "clinical_impression", "plan",
    ]
    for i, key in enumerate(post_ros_keys_in_order):
        NoteFieldDefinition.objects.filter(template=template, key=key).update(
            sort_order=2000 + i
        )

    sort_order = 100  # History section currently ends well below this

    for system_key, system_label, has_comments, blocks, extra_fields in ROS_SYSTEMS:
        section_label = f"Review of Systems: {system_label}"

        for block_suffix, block_name, negative_labels, positive_labels in blocks:
            prefix = f"ros_{system_key}" + (f"_{block_suffix}" if block_suffix else "")

            status_field, _ = NoteFieldDefinition.objects.update_or_create(
                template=template,
                key=f"{prefix}_status",
                defaults={
                    "section_label": section_label,
                    "label": block_name,
                    "field_type": "multiselect",
                    "dictionary": status_dict,
                    "required": False,
                    "sort_order": sort_order,
                    "help_text": "",
                },
            )
            sort_order += 1

            neg_dict = make_dictionary(
                f"{prefix}_negative", f"{block_name} - Negative Findings", negative_labels
            )
            if neg_dict:
                NoteFieldDefinition.objects.update_or_create(
                    template=template,
                    key=f"{prefix}_negative",
                    defaults={
                        "section_label": section_label,
                        "label": f"Negative {block_name}",
                        "field_type": "multiselect",
                        "dictionary": neg_dict,
                        "required": False,
                        "sort_order": sort_order,
                        "help_text": "",
                        "depends_on": status_field,
                        "depends_on_value": "negative_for",
                    },
                )
                sort_order += 1

            pos_dict = make_dictionary(
                f"{prefix}_positive", f"{block_name} - Positive Findings", positive_labels
            )
            if pos_dict:
                NoteFieldDefinition.objects.update_or_create(
                    template=template,
                    key=f"{prefix}_positive",
                    defaults={
                        "section_label": section_label,
                        "label": block_name,
                        "field_type": "multiselect",
                        "dictionary": pos_dict,
                        "required": False,
                        "sort_order": sort_order,
                        "help_text": "",
                        "depends_on": status_field,
                        "depends_on_value": "positive_for",
                    },
                )
                sort_order += 1

        for field_suffix, label, field_type, options in extra_fields:
            extra_dict = None
            if options:
                extra_dict, _ = Dictionary.objects.get_or_create(
                    code=f"ros_{system_key}_{field_suffix}", defaults={"name": label}
                )
                for i, (value, opt_label) in enumerate(options):
                    DictionaryItem.objects.get_or_create(
                        dictionary=extra_dict, value=value,
                        defaults={"label": opt_label, "sort_order": i},
                    )
            NoteFieldDefinition.objects.update_or_create(
                template=template,
                key=f"ros_{system_key}_{field_suffix}",
                defaults={
                    "section_label": section_label,
                    "label": label,
                    "field_type": field_type,
                    "dictionary": extra_dict,
                    "required": False,
                    "sort_order": sort_order,
                    "help_text": "",
                },
            )
            sort_order += 1

        if has_comments:
            NoteFieldDefinition.objects.update_or_create(
                template=template,
                key=f"ros_{system_key}_comments",
                defaults={
                    "section_label": section_label,
                    "label": f"{system_label} Comments",
                    "field_type": "text",
                    "dictionary": None,
                    "required": False,
                    "sort_order": sort_order,
                    "help_text": "",
                },
            )
            sort_order += 1

    template.version = template.version + 1
    template.save(update_fields=["version"])


def unseed(apps, schema_editor):
    # Not reversible in a meaningful way (would need to restore the exact
    # old ros_* single-dropdown fields and their dictionary) -- Phase 1's
    # data migrations are one-directional seed data, consistent with 0031.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0032_note_field_multiselect_and_conditional"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
