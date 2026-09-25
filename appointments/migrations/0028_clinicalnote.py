import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0026_customuser_add_nurse_role"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0027_add_unique_together_constraint"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClinicalNote",
            fields=[
                (
                    "id",
                    models.AutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "author_role_at_signing",
                    models.CharField(
                        blank=True,
                        help_text="Snapshot of the author's role at the time of writing/signing",
                        max_length=20,
                    ),
                ),
                (
                    "note_type",
                    models.CharField(
                        choices=[
                            ("nursing_assessment", "Nursing Assessment"),
                            ("doctor_assessment", "Doctor Assessment"),
                        ],
                        max_length=30,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("signed", "Signed")],
                        default="draft",
                        max_length=10,
                    ),
                ),
                ("subjective", models.TextField(blank=True)),
                ("objective", models.TextField(blank=True)),
                ("assessment", models.TextField(blank=True)),
                ("plan", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("signed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "amends",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="addenda",
                        to="appointments.clinicalnote",
                    ),
                ),
                (
                    "appointment",
                    models.ForeignKey(
                        help_text="The visit/registration this note documents",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="clinical_notes",
                        to="appointments.appointment",
                    ),
                ),
                (
                    "author",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="clinical_notes_authored",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        help_text="Organization this note belongs to",
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="clinical_notes",
                        to="users.organization",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="clinical_notes_received",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
