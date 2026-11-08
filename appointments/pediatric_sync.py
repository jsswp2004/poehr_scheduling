"""Keep the patient record's birth details in step with the General Pediatric Note.

Gestational age and birth weight are clinical facts a nurse or doctor records in the note's
Birth & Perinatal tab. The growth charts read them from the patient record to plot a premature
baby at corrected age, so every save of the note copies the three values across.
Values that are blank or out of range are skipped: the note never clears or corrupts the record.
"""

PEDIATRIC_TEMPLATE_CODE = "general_pediatric_note"
NEWBORN_TEMPLATE_CODE = "newborn_note"
# Notes whose Birth tab feeds the patient record (same three field keys in each).
SYNC_TEMPLATE_CODES = (PEDIATRIC_TEMPLATE_CODE, NEWBORN_TEMPLATE_CODE)

# note field key -> (patient field, lowest allowed, highest allowed)
BIRTH_FIELDS = {
    "gestational_age_weeks": ("gestational_age_weeks", 20, 45),
    "gestational_age_days": ("gestational_age_days", 0, 6),
    "birth_weight_g": ("birth_weight_g", 200, 8000),
}


def _whole_number(value):
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number == int(number) else None


def sync_birth_details(note):
    """Copy birth details from a pediatric or newborn note to the patient's profile. Returns the fields changed."""
    template = getattr(note, "template", None)
    if template is None or template.code not in SYNC_TEMPLATE_CODES:
        return []
    profile = getattr(note.patient, "patient_profile", None)
    if profile is None:
        return []
    data = note.structured_data or {}
    changed = []
    for key, (field, low, high) in BIRTH_FIELDS.items():
        number = _whole_number(data.get(key))
        if number is None or not low <= number <= high:
            continue
        if getattr(profile, field) != number:
            setattr(profile, field, number)
            changed.append(field)
    if changed:
        profile.save(update_fields=changed)
    return changed
