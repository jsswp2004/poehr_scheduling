# documentation_type may now hold any NoteTemplate.code (max 64, like
# NoteTemplate.code), not just the three built-in choices. Choices are no
# longer enforced at the database/model level; ClinicalNoteSerializer
# validates the value instead. Existing rows are unaffected.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0039_autosms'),
    ]

    operations = [
        migrations.AlterField(
            model_name='clinicalnote',
            name='documentation_type',
            field=models.CharField(
                blank=True,
                help_text=(
                    'Further classification of the note: a built-in type (e.g. initial_assessment, '
                    'progress_note) or the code of a NoteTemplate (e.g. admission_note)'
                ),
                max_length=64,
            ),
        ),
    ]
