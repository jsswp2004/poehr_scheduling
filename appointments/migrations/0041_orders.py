# Orders (phase 1): the orderable catalog, order sets, patient orders and the
# append-only order event log, plus NoteTemplate.kind so an order-detail form
# never shows up as a Documentation Type.

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("users", "0031_organization_address_state"),
        ("appointments", "0040_documentation_type_template_codes"),
    ]

    operations = [
        migrations.AddField(
            model_name="notetemplate",
            name="kind",
            field=models.CharField(
                choices=[("note", "Clinical note"), ("order_detail", "Order detail form")],
                default="note",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="Order",
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
                ("orderable_name", models.CharField(max_length=255)),
                ("orderable_category", models.CharField(max_length=20)),
                ("code_system", models.CharField(blank=True, max_length=20)),
                ("external_code", models.CharField(blank=True, max_length=64)),
                (
                    "detail_template_version",
                    models.PositiveIntegerField(blank=True, null=True),
                ),
                (
                    "detail_template_snapshot",
                    models.JSONField(blank=True, default=dict),
                ),
                (
                    "detail",
                    models.JSONField(
                        blank=True,
                        default=dict,
                        help_text="Answers to the detail form, keyed by field key",
                    ),
                ),
                (
                    "priority",
                    models.CharField(
                        choices=[
                            ("routine", "Routine"),
                            ("urgent", "Urgent"),
                            ("stat", "STAT"),
                        ],
                        default="routine",
                        max_length=10,
                    ),
                ),
                (
                    "indication",
                    models.TextField(blank=True, help_text="Reason for the order"),
                ),
                (
                    "diagnosis_codes",
                    models.JSONField(
                        blank=True,
                        default=list,
                        help_text="[{'code': 'I10', 'description': '...'}]",
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("pending_cosign", "Pending cosign"),
                            ("active", "Active"),
                            ("in_progress", "In progress"),
                            ("completed", "Completed"),
                            ("discontinued", "Discontinued"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("cosign_required", models.BooleanField(default=False)),
                ("signed_at", models.DateTimeField(blank=True, null=True)),
                ("cosigned_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("result_text", models.TextField(blank=True)),
                ("result_data", models.JSONField(blank=True, default=dict)),
                ("discontinued_at", models.DateTimeField(blank=True, null=True)),
                ("discontinue_reason", models.TextField(blank=True)),
                (
                    "placer_order_number",
                    models.CharField(blank=True, max_length=32, null=True, unique=True),
                ),
                ("filler_order_number", models.CharField(blank=True, max_length=64)),
                (
                    "interface_status",
                    models.CharField(
                        choices=[
                            ("not_sent", "Not sent"),
                            ("queued", "Queued"),
                            ("sent", "Sent"),
                            ("acknowledged", "Acknowledged"),
                            ("error", "Error"),
                        ],
                        default="not_sent",
                        max_length=20,
                    ),
                ),
                ("interface_message", models.TextField(blank=True)),
                ("interface_updated_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="Orderable",
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
                        help_text="Stable machine key, e.g. 'cbc_with_diff'",
                        max_length=64,
                        unique=True,
                    ),
                ),
                (
                    "name",
                    models.CharField(
                        help_text="Display name, e.g. 'CBC with differential'",
                        max_length=255,
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("laboratory", "Laboratory"),
                            ("imaging", "Imaging"),
                            ("procedure", "Procedure"),
                            ("referral", "Referral"),
                            ("nursing", "Nursing"),
                            ("medication", "Medication"),
                            ("other", "Other"),
                        ],
                        default="laboratory",
                        max_length=20,
                    ),
                ),
                (
                    "code_system",
                    models.CharField(
                        choices=[
                            ("local", "Local"),
                            ("loinc", "LOINC"),
                            ("hcpcs", "HCPCS"),
                            ("icd10pcs", "ICD-10-PCS"),
                            ("snomed", "SNOMED CT"),
                            ("rxnorm", "RxNorm"),
                            ("cpt", "CPT (entered by the clinic)"),
                        ],
                        default="local",
                        max_length=20,
                    ),
                ),
                (
                    "external_code",
                    models.CharField(
                        blank=True,
                        help_text="Code in code_system (e.g. the LOINC code). Copied onto each order, never looked up live.",
                        max_length=64,
                    ),
                ),
                ("description", models.TextField(blank=True)),
                (
                    "default_priority",
                    models.CharField(
                        choices=[
                            ("routine", "Routine"),
                            ("urgent", "Urgent"),
                            ("stat", "STAT"),
                        ],
                        default="routine",
                        max_length=10,
                    ),
                ),
                (
                    "requires_cosign",
                    models.BooleanField(
                        default=False,
                        help_text="Always needs a physician cosign, whoever places it",
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="OrderEvent",
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
                ("event_type", models.CharField(max_length=30)),
                ("from_status", models.CharField(blank=True, max_length=20)),
                ("to_status", models.CharField(blank=True, max_length=20)),
                (
                    "source",
                    models.CharField(
                        choices=[
                            ("user", "User"),
                            ("interface", "Interface"),
                            ("system", "System"),
                        ],
                        default="user",
                        max_length=10,
                    ),
                ),
                ("detail", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.CreateModel(
            name="OrderSet",
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
                ("code", models.SlugField(max_length=64, unique=True)),
                ("name", models.CharField(max_length=128)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="OrderSetItem",
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
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "default_priority",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("routine", "Routine"),
                            ("urgent", "Urgent"),
                            ("stat", "STAT"),
                        ],
                        help_text="Leave blank to use the orderable's default priority",
                        max_length=10,
                    ),
                ),
                ("default_detail", models.JSONField(blank=True, default=dict)),
                (
                    "order_set",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="appointments.orderset",
                    ),
                ),
                (
                    "orderable",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="order_set_items",
                        to="appointments.orderable",
                    ),
                ),
            ],
            options={
                "ordering": ["order_set", "sort_order"],
            },
        ),
        migrations.AddField(
            model_name="orderset",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Leave blank for an order set available to all organizations",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="order_sets",
                to="users.organization",
            ),
        ),

        migrations.AddField(
            model_name="orderevent",
            name="order",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="events",
                to="appointments.order",
            ),
        ),

        migrations.AddField(
            model_name="orderevent",
            name="user",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="order_events",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AddField(
            model_name="orderable",
            name="detail_template",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional question form (a NoteTemplate of kind 'order_detail') shown when ordering",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="orderables",
                to="appointments.notetemplate",
            ),
        ),

        migrations.AddField(
            model_name="orderable",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                help_text="Leave blank for an orderable available to all organizations",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="orderables",
                to="users.organization",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="appointment",
            field=models.ForeignKey(
                help_text="The visit/registration this order was placed during",
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders",
                to="appointments.appointment",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="clinical_note",
            field=models.ForeignKey(
                blank=True,
                help_text="The note this order was placed from, if any",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="orders",
                to="appointments.clinicalnote",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="completed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders_completed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="cosigned_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders_cosigned",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="detail_template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="orders",
                to="appointments.notetemplate",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="discontinued_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders_discontinued",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="order_set",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="orders",
                to="appointments.orderset",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="orderable",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders",
                to="appointments.orderable",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="ordering_provider",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders_placed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="organization",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="orders",
                to="users.organization",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="patient",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders_received",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="replaces",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="replaced_by",
                to="appointments.order",
            ),
        ),

        migrations.AddField(
            model_name="order",
            name="signed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="orders_signed",
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        migrations.AlterUniqueTogether(
            name="ordersetitem",
            unique_together={("order_set", "orderable")},
        ),

        migrations.AddIndex(
            model_name="order",
            index=models.Index(
                fields=["organization", "patient"],
                name="appointment_organiz_642448_idx",
            ),
        ),

        migrations.AddIndex(
            model_name="order",
            index=models.Index(
                fields=["status", "interface_status"],
                name="appointment_status_8e7a08_idx",
            ),
        ),
    ]
