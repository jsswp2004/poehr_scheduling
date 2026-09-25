from django.db import migrations, models


def backfill_template_snapshot(apps, schema_editor):
    """
    Freeze a template_snapshot for any ClinicalNote created before this field
    existed (Phase 1's Admission Notes, if any). These notes were authored
    against whatever the template looked like at the time, and since no
    template edits have happened yet (Phase 2's editor didn't exist until
    now), the *current* live template state is exactly what they were
    authored against -- so it's a safe, accurate backfill, not a guess.

    Serialized by hand (rather than importing the real DRF serializer,
    which migrations should never depend on) to match NoteTemplateSerializer
    / NoteFieldDefinitionSerializer's shape exactly, so DynamicNoteSummary on
    the frontend renders backfilled notes identically to freshly-snapshotted
    ones.
    """
    ClinicalNote = apps.get_model("appointments", "ClinicalNote")
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")

    def serialize_template(template):
        fields = []
        for f in template.fields.all().order_by("sort_order"):
            options = []
            if f.dictionary_id:
                for item in f.dictionary.items.all().order_by("sort_order", "label"):
                    options.append(
                        {"id": item.id, "value": item.value, "label": item.label, "sort_order": item.sort_order}
                    )
            fields.append(
                {
                    "id": f.id,
                    "section_label": f.section_label,
                    "key": f.key,
                    "label": f.label,
                    "field_type": f.field_type,
                    "required": f.required,
                    "sort_order": f.sort_order,
                    "help_text": f.help_text,
                    "options": options,
                    "depends_on_key": f.depends_on.key if f.depends_on_id else None,
                    "depends_on_value": f.depends_on_value,
                }
            )
        return {
            "id": template.id,
            "code": template.code,
            "name": template.name,
            "version": template.version,
            "is_active": template.is_active,
            "fields": fields,
        }

    template_cache = {}
    for note in ClinicalNote.objects.exclude(template_id=None).select_related("template"):
        if note.template_id not in template_cache:
            template_cache[note.template_id] = serialize_template(note.template)
        note.template_snapshot = template_cache[note.template_id]
        note.save(update_fields=["template_snapshot"])


def noop(apps, schema_editor):
    # One-directional, consistent with this project's other seed/backfill
    # migrations (0031, 0033) -- reversing would discard frozen history with
    # no way to reconstruct it.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0033_ros_body_systems"),
    ]

    operations = [
        migrations.AddField(
            model_name="clinicalnote",
            name="template_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RunPython(backfill_template_snapshot, noop),
    ]
