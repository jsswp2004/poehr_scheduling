"""Fill in Document Ownership for templates that already have a note type.

A note type carries the role that may write it (doctor or nurse). Templates of a doctor note type become Physician and
templates of a nurse note type become Nursing. Anything else (no note type, or a type open to any clinician) is left
blank for an admin to choose in the Note Builder -- Ancillary is never guessed. Templates that already have an ownership
are not touched.
"""

from django.db import migrations

ROLE_TO_OWNERSHIP = {"doctor": "physician", "nurse": "nursing"}


def owner_for(author_role):
    return ROLE_TO_OWNERSHIP.get(author_role or "", "")


def backfill(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    DictionaryItem = apps.get_model("appointments", "DictionaryItem")
    roles = {
        item.value: item.author_role
        for item in DictionaryItem.objects.filter(dictionary__code="note_types")
    }
    for template in NoteTemplate.objects.filter(ownership="").exclude(note_type=""):
        owner = owner_for(roles.get(template.note_type))
        if owner:
            template.ownership = owner
            template.save(update_fields=["ownership"])


class Migration(migrations.Migration):
    dependencies = [("appointments", "0093_notetemplate_ownership")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
