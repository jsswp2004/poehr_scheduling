import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0026_customuser_add_nurse_role"),
        ("appointments", "0029_clinicalnote_documentation_type"),
    ]

    operations = [
        migrations.AlterField(
            model_name="clinicalnote",
            name="documentation_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("initial_assessment", "Initial Assessment"),
                    ("progress_note", "Progress Note"),
                    ("admission_note", "Admission Note"),
                ],
                help_text="Further classification of the note (e.g. Initial Assessment, Progress Note)",
                max_length=30,
            ),
        ),
        migrations.CreateModel(
            name="Dictionary",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "code",
                    models.SlugField(
                        help_text="Stable machine key, e.g. 'ros_findings'",
                        max_length=64,
                        unique=True,
                    ),
                ),
                ("name", models.CharField(max_length=128)),
                ("description", models.TextField(blank=True)),
            ],
            options={
                "verbose_name_plural": "Dictionaries",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="NoteTemplate",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "code",
                    models.SlugField(
                        help_text="Stable machine key, matches ClinicalNote.documentation_type, e.g. 'admission_note'",
                        max_length=64,
                        unique=True,
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        help_text="Display name, e.g. 'Admission Note'", max_length=128
                    ),
                ),
                ("version", models.PositiveIntegerField(default=1)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Leave blank for a template available to all organizations",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="note_templates",
                        to="users.organization",
                    ),
                ),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="DictionaryItem",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "value",
                    models.CharField(
                        help_text="Stored value, e.g. 'penicillin'", max_length=100
                    ),
                ),
                (
                    "label",
                    models.CharField(
                        help_text="Display label, e.g. 'Penicillin'", max_length=200
                    ),
                ),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "dictionary",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="appointments.dictionary",
                    ),
                ),
            ],
            options={
                "ordering": ["dictionary", "sort_order", "label"],
                "unique_together": {("dictionary", "value")},
            },
        ),
        migrations.CreateModel(
            name="NoteFieldDefinition",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "section_label",
                    models.CharField(
                        blank=True,
                        help_text="Groups fields under a heading in the rendered form, e.g. 'History'",
                        max_length=128,
                    ),
                ),
                (
                    "key",
                    models.SlugField(
                        help_text="Stable key this field's value is stored under in structured_data",
                        max_length=64,
                    ),
                ),
                ("label", models.CharField(max_length=200)),
                (
                    "field_type",
                    models.CharField(
                        choices=[
                            ("text", "Single-line Text"),
                            ("textarea", "Multi-line Text"),
                            ("radio", "Radio Button (dictionary)"),
                            ("dropdown", "Dropdown (dictionary)"),
                            ("checkbox", "Checkbox (yes/no)"),
                            ("numeric", "Numeric"),
                            ("date", "Date"),
                        ],
                        max_length=20,
                    ),
                ),
                ("required", models.BooleanField(default=False)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                ("help_text", models.CharField(blank=True, max_length=255)),
                (
                    "dictionary",
                    models.ForeignKey(
                        blank=True,
                        help_text="Required when field_type is 'radio' or 'dropdown'",
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        to="appointments.dictionary",
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="fields",
                        to="appointments.notetemplate",
                    ),
                ),
            ],
            options={
                "ordering": ["template", "sort_order"],
                "unique_together": {("template", "key")},
            },
        ),
        migrations.AddField(
            model_name="clinicalnote",
            name="template",
            field=models.ForeignKey(
                blank=True,
                help_text="The structured template this note was authored against, if any",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="notes",
                to="appointments.notetemplate",
            ),
        ),
        migrations.AddField(
            model_name="clinicalnote",
            name="template_version",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="clinicalnote",
            name="structured_data",
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text="Field values for a template-driven note, keyed by field key",
            ),
        ),
    ]
