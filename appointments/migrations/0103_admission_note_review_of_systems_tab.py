"""Put the physician Admission Note's Review of Systems back in its own tab.

admission_note_2 had no tabs, so its Review of Systems fields had a blank tab. Once the other fields were given H&P
tabs (0100/0102), the blank-tab ROS fields fell into a catch-all "General" tab at the end of the rail. They are
now in a "Review of Systems" tab between Medications & Allergies and Physical Exam, exactly as in the H&P.
Nothing is added, removed or renamed besides the tab; re-running is safe.
"""

from django.db import migrations

CODE = "admission_note_2"
ROS_TAB = "Review of Systems"
TAB_ORDER = ["Visit", "History", "Medications & Allergies", ROS_TAB, "Physical Exam", "Assessment & Plan"]


def forwards(apps, schema_editor):
    NoteTemplate = apps.get_model("appointments", "NoteTemplate")
    template = NoteTemplate.objects.filter(code=CODE).first()
    if template is None:
        return
    fields = list(template.fields.order_by("sort_order", "id"))
    moved = False
    for f in fields:
        if not f.tab_label and f.section_label.startswith("Review of Systems"):
            f.tab_label = ROS_TAB
            f.save(update_fields=["tab_label"])
            moved = True
    if not moved:
        return
    position = {f.pk: i for i, f in enumerate(fields)}
    rank = {tab: i for i, tab in enumerate(TAB_ORDER)}
    ordered = sorted(fields, key=lambda f: (rank.get(f.tab_label, 1000), position[f.pk]))
    for i, f in enumerate(ordered):
        template.fields.filter(pk=f.pk).update(sort_order=i * 10)
    template.version += 1
    template.save(update_fields=["version"])


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0102_restore_physician_admission_note_sections"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
