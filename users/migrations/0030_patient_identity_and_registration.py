# Hand-written to match the model changes in users/models.py (Patient's new
# Identity/Emergency Contact/Financial/Legal Documents fields, plus the new
# Registration model) -- generated the same way `makemigrations` would, but
# authored by hand since this environment has no Django install to run it.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import users.models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0039_autosms"),
        ("users", "0029_alter_customuser_role_staff"),
    ]

    operations = [
        migrations.AddField(
            model_name="patient",
            name="legal_sex",
            field=models.CharField(
                blank=True,
                choices=[("M", "Male"), ("F", "Female"), ("X", "Unspecified/Other")],
                max_length=1,
            ),
        ),
        migrations.AddField(
            model_name="patient",
            name="ssn_last4",
            field=models.CharField(blank=True, max_length=4),
        ),
        migrations.AddField(
            model_name="patient",
            name="preferred_language",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="patient",
            name="mrn",
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="emergency_contact_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="patient",
            name="emergency_contact_relationship",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="patient",
            name="emergency_contact_phone",
            field=models.CharField(blank=True, max_length=15),
        ),
        migrations.AddField(
            model_name="patient",
            name="emergency_contact_address",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="patient",
            name="insurance_payer_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="patient",
            name="insurance_member_id",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="patient",
            name="insurance_group_number",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="patient",
            name="policyholder_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="patient",
            name="policyholder_dob",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="copay_deductible_status",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="patient",
            name="authorization_requirements",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="secondary_insurance",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="consent_to_treat",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="patient",
            name="consent_to_treat_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="consent_to_treat_file",
            field=models.FileField(
                blank=True, null=True, upload_to=users.models.consent_to_treat_upload_path
            ),
        ),
        migrations.AddField(
            model_name="patient",
            name="privacy_acknowledgment",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="patient",
            name="privacy_acknowledgment_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="privacy_acknowledgment_file",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=users.models.privacy_acknowledgment_upload_path,
            ),
        ),
        migrations.AddField(
            model_name="patient",
            name="financial_responsibility_agreement",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="patient",
            name="financial_responsibility_agreement_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="financial_responsibility_agreement_file",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=users.models.financial_responsibility_upload_path,
            ),
        ),
        migrations.AddField(
            model_name="patient",
            name="assignment_of_benefits",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="patient",
            name="assignment_of_benefits_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="assignment_of_benefits_file",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=users.models.assignment_of_benefits_upload_path,
            ),
        ),
        migrations.AddField(
            model_name="patient",
            name="release_of_information",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="patient",
            name="release_of_information_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="patient",
            name="release_of_information_file",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=users.models.release_of_information_upload_path,
            ),
        ),
        migrations.CreateModel(
            name="Registration",
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
                    "visit_number",
                    models.CharField(blank=True, max_length=20, null=True, unique=True),
                ),
                ("reason_for_visit", models.TextField(blank=True)),
                ("presenting_problem", models.TextField(blank=True)),
                ("scheduled_procedure", models.CharField(blank=True, max_length=255)),
                ("referring_physician", models.CharField(blank=True, max_length=255)),
                ("current_diagnoses", models.TextField(blank=True)),
                (
                    "admission_type",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("scheduled", "Scheduled"),
                            ("emergency", "Emergency"),
                            ("direct", "Direct"),
                        ],
                        max_length=20,
                    ),
                ),
                ("arrival_time", models.DateTimeField(blank=True, null=True)),
                ("assigned_location", models.CharField(blank=True, max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "appointment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="registration",
                        to="appointments.appointment",
                    ),
                ),
                (
                    "attending_provider",
                    models.ForeignKey(
                        blank=True,
                        limit_choices_to={"role": "doctor"},
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="attending_registrations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "organization",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="registrations",
                        to="users.organization",
                    ),
                ),
                (
                    "patient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="registrations",
                        to="users.patient",
                    ),
                ),
                (
                    "registered_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="registrations_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
